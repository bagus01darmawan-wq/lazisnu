// Scheduler Routes - Automated / Internal Tasks

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, gte, inArray, sql } from 'drizzle-orm';
import { config } from '../config/env';
import { getLatestCollectionCondition } from '../services/collectionSubmission';
import { findCansWithoutAssignment, buildFirstOfficerAssignments, insertAssignments } from '../services/assignmentGenerator';
import { periodKey } from '../services/periodCalendar';
import { preparePeriodDraft } from '../services/periodDrafts';
import { sweepNotifs } from '../services/notifications';
import { sweepQrPdfs, DEFAULT_QR_RETENTION_DAYS } from '../services/r2Cleanup';
import { sendSuccess, sendError, sendInternalError } from '../utils/response';
import { insertActivityLog } from '../services/auditLogService';
import { isAppError } from '../utils/AppError';

const generateTasksSchema = z.object({
  year: z.number().min(2020).max(2100),
  month: z.number().min(1).max(12),
});

const cleanupQrPdfsSchema = z.object({
  /** Umur minimum sebelum dihapus. Bawaan 7 hari; lantai 1 hari (dijaga service). */
  retention_days: z.number().int().min(1).max(365).optional(),
  /** true = hanya laporkan, jangan hapus. Berguna untuk uji coba pertama. */
  dry_run: z.boolean().optional(),
});

export async function schedulerRoutes(fastify: FastifyInstance) {
  // Internal API key guard
  fastify.addHook('preHandler', async (request, reply) => {
    const apiKey = request.headers['x-internal-api-key'];
    if (!config.INTERNAL_API_KEY) {
      return sendError(reply, 503, 'NOT_CONFIGURED', 'Scheduler API tidak dikonfigurasi');
    }
    if (apiKey !== config.INTERNAL_API_KEY) {
      try {
        await insertActivityLog({
          userId: null,
          officerId: null,
          actionType: 'SCHEDULER_MISMATCH',
          entityType: 'system',
          entityId: null,
          oldData: { providedKey: apiKey ? '[REDACTED]' : 'MISSING' },
          newData: null,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] || null,
        });
      } catch (err) {
        request.log.error({ err }, 'SCHEDULER_MISMATCH audit log failed');
      }
      return sendError(reply, 403, 'FORBIDDEN', 'Internal API key tidak valid');
    }
  });

  const latestCollectionCondition = getLatestCollectionCondition();

  // POST /scheduler/generate-tasks
  // Generates monthly assignments for all active cans
  fastify.post('/generate-tasks', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = generateTasksSchema.parse(request.body);
      const { year, month } = body;

      const { cansToAssign } = await findCansWithoutAssignment(year, month);

      const assignmentItems = buildFirstOfficerAssignments(cansToAssign, year, month);

      const { created } = await insertAssignments(assignmentItems, true);

      return sendSuccess(reply, {
        total_assignments: created,
        assigned_to_officers: new Set(assignmentItems.map((a: any) => a.officerId)).size,
        skipped_no_officer: cansToAssign.length - assignmentItems.length,
        period: periodKey(year, month),
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // POST /scheduler/prepare-draft
  // C1-T3 robot (§6, §14.12): siapkan draft siap-jalan (DRAFT + baris
  // period_calendar identik buildPeriodBoundaries). Idempoten: aman dipanggil
  // ulang / dobel cron — draft yang ada hanya di-top-up, approve tetap sekali.
  //
  // JADWAL CRON (wiring deploy = T12, zona WIB; {year,month} = bulan BERJALAN
  // saat cron jalan — endpoint menolak bulan masa depan):
  //   tgl 10 00:00 → siapkan draft bulan berjalan (= M+1 pasca-kunci M):
  //     0 0 10 * * curl -s -X POST $BASE/v1/scheduler/prepare-draft \
  //       -H "x-internal-api-key: $KEY" -H 'Content-Type: application/json' \
  //       -d "{\"year\":$(date +\%Y),\"month\":$(date +\%m)}"
  //   tgl 20 00:00 → sapuan susulan kaleng/PPK baru + kickoff pengingat (T11):
  //     0 0 20 * * curl ... (payload sama: bulan berjalan)
  // Tidak ada tombol manual terpisah — Staf hanya melihat/mengedit/menyetujui
  // via /v1/admin/period-drafts (otorisasi peran, bukan kunci internal).
  fastify.post('/prepare-draft', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = generateTasksSchema.parse(request.body);
      const { year, month } = body;

      const result = await preparePeriodDraft(year, month);

      return sendSuccess(reply, {
        period: result.period,
        calendar_row_written: result.calendarRowWritten,
        drafts: result.drafts.map((d) => ({
          branch_id: d.branchId,
          draft_id: d.draftId,
          status: d.draftStatus,
          added_items: d.addedItems,
          total_items: d.totalItems,
          direct_assignments: d.directAssignments,
        })),
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      if (isAppError(error)) {
        return sendError(reply, error.statusCode, error.code, error.message, error.details);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // POST /scheduler/calculate-summaries
  // Recalculates CollectionSummary for a given period
  fastify.post('/calculate-summaries', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = z
        .object({
          year: z.number().min(2020).max(2100),
          month: z.number().min(1).max(12),
        })
        .parse(request.body);

      const { year, month } = body;

      // C1-T12 (§2.2): periode MILIK ASSIGNMENT, bukan collected_at.
      // collected_at 20 Sep–9 Okt dengan assignment Sept = pemasukan Sept.
      // N1 (backlog T12): filter periode dikerjakan DB via JOIN assignments
      // (dulu: ambil SEMUA koleksi + filter di memori). Hasil agregat identik.
      const inPeriod = await db
        .select({
          nominal: schema.collections.nominal,
          officerId: schema.collections.officerId,
          branchId: schema.cans.branchId,
          districtId: schema.branches.districtId,
        })
        .from(schema.collections)
        .innerJoin(schema.assignments, eq(schema.collections.assignmentId, schema.assignments.id))
        .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
        .innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
        .where(
          and(
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition,
            eq(schema.assignments.periodYear, year),
            eq(schema.assignments.periodMonth, month),
          ),
        );

      type SummaryAcc = { total: number; count: number };
      const byDistrict: Record<string, SummaryAcc> = {};
      const byBranch: Record<string, SummaryAcc> = {};
      const byOfficer: Record<string, SummaryAcc> = {};

      const initAcc = (): SummaryAcc => ({ total: 0, count: 0 });

      const addToAcc = (acc: SummaryAcc, amount: number) => { acc.total += amount; acc.count++; };

      for (const col of inPeriod) {
        const nominal = Number(col.nominal);
        const districtId = col.districtId;
        const branchId = col.branchId;
        const officerId = col.officerId;

        if (!byDistrict[districtId]) byDistrict[districtId] = initAcc();
        addToAcc(byDistrict[districtId], nominal);

        if (!byBranch[branchId]) byBranch[branchId] = initAcc();
        addToAcc(byBranch[branchId], nominal);

        if (!byOfficer[officerId]) byOfficer[officerId] = initAcc();
        addToAcc(byOfficer[officerId], nominal);
      }

      const summaries = [
        ...Object.entries(byDistrict).map(([districtId, d]) => ({
          periodId: `${year}-${month}`, // hypothetical helper but sticking to schema:
          periodYear: year, periodMonth: month,
          districtId, branchId: null, officerId: null,
          totalAmount: BigInt(d.total), collectionCount: d.count,
        })),
        ...Object.entries(byBranch).map(([branchId, d]) => ({
          periodYear: year, periodMonth: month,
          districtId: null, branchId, officerId: null,
          totalAmount: BigInt(d.total), collectionCount: d.count,
        })),
        ...Object.entries(byOfficer).map(([officerId, d]) => ({
          periodYear: year, periodMonth: month,
          districtId: null, branchId: null, officerId,
          totalAmount: BigInt(d.total), collectionCount: d.count,
        })),
      ];

      if (summaries.length > 0) {
        await db.transaction(async (tx) => {
          await tx.delete(schema.collectionSummaries)
            .where(and(eq(schema.collectionSummaries.periodYear, year), eq(schema.collectionSummaries.periodMonth, month)));
          await tx.insert(schema.collectionSummaries).values(summaries as any[]);
        });
      }

      return sendSuccess(reply, {
        period: periodKey(year, month),
        districts_processed: Object.keys(byDistrict).length,
        branches_processed: Object.keys(byBranch).length,
        officers_processed: Object.keys(byOfficer).length,
        total_summaries: summaries.length,
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // GET /scheduler/stats
  // Quick overview of system health for monitoring
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const monthStart = new Date(currentYear, currentMonth - 1, 1);

      const [totalCans, totalOfficers, sumResultRows, pendingSync] = await Promise.all([
        db.$count(schema.cans, eq(schema.cans.isActive, true)),
        db.$count(schema.officers, eq(schema.officers.isActive, true)),
        db.select({ count: sql<number>`count(*)`, total_nominal: sql<string>`sum(${schema.collections.nominal})` })
          .from(schema.collections)
          .where(and(
            gte(schema.collections.collectedAt, monthStart), 
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          )),
        db.$count(schema.collections, inArray(schema.collections.syncStatus, ['PENDING', 'FAILED'])),
      ]);
      const monthCollections = sumResultRows[0];

      return sendSuccess(reply, {
        total_cans: totalCans,
        total_officers: totalOfficers,
        current_month: {
          collections: Number(monthCollections.count) || 0,
          nominal: Number(monthCollections.total_nominal) || 0,
        },
        pending_sync: pendingSync,
        server_time: now.toISOString(),
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // POST /scheduler/notifikasi-sapu
  // C1-T11 (§14.15): sapuan notifikasi terjadwal — eskalasi approve (>24 jam
  // → Keuangan), pengingat H-3 (ACTIVE tersisa), mendekati kunci (2 hari
  // terakhir toleransi + ACTIVE tersisa). Semua dedup 20 jam; tak melempar.
  //
  // JADWAL CRON (wiring deploy = T12, zona WIB; {year,month} = periode yang
  // disapu — biasanya bulan berjalan):
  //   0 7 * * * curl -s -X POST $BASE/v1/scheduler/notifikasi-sapu \
  //     -H "x-internal-api-key: $KEY" -H 'Content-Type: application/json' \
  //     -d "{\"year\":$(date +\%Y),\"month\":$(date +\%m)}"
  // Harian 07:00 WIB: mencakup H-3 (jendela due-3..due), kunci (2 hari
  // terakhir toleransi), dan eskalasi (setiap hari sampai disetujui).
  fastify.post('/notifikasi-sapu', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = generateTasksSchema.parse(request.body);
      const { year, month } = body;

      const result = await sweepNotifs(year, month, new Date());

      return sendSuccess(reply, {
        period: result.period,
        eskalasi_terkirim: result.escalated,
        pengingat_h3_terkirim: result.h3,
        mendekati_kunci_terkirim: result.near_lock,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // POST /scheduler/cleanup-qr-pdfs
  // Penyapu berkas sementara R2 (temuan 23 Sep 2026): label QR dulu diunggah
  // dengan key bertimestamp dan tidak pernah dihapus → menumpuk selamanya.
  // Akar masalahnya sudah diperbaiki (key deterministik di qrPdfKeys.ts), endpoint
  // ini membereskan sisa lama + berkas yatim bila ada.
  //
  // ⚠️ Hanya menyentuh prefix `qr-pdfs/`. `ba-pdfs/` = arsip hukum, tidak pernah disentuh.
  //
  // JADWAL CRON (zona WIB) — harian 03:30, sepi trafik:
  //   30 3 * * * curl -s -X POST $BASE/v1/scheduler/cleanup-qr-pdfs \
  //     -H "x-internal-api-key: $KEY" -H 'Content-Type: application/json' -d '{}'
  // Uji coba pertama (tidak menghapus apa pun):
  //   ... -d '{"dry_run":true}'
  fastify.post('/cleanup-qr-pdfs', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = cleanupQrPdfsSchema.parse(request.body ?? {});

      const result = await sweepQrPdfs({
        retentionDays: body.retention_days,
        dryRun: body.dry_run,
      });

      // Audit hanya bila benar-benar ada yang terhapus — jangan banjiri log
      // dengan catatan "0 berkas" setiap hari.
      if (!result.dry_run && result.deleted > 0) {
        try {
          await insertActivityLog({
            userId: null,
            officerId: null,
            actionType: 'SCHEDULER_R2_CLEANUP',
            entityType: 'system',
            entityId: null,
            oldData: null,
            newData: {
              prefix: result.prefix,
              retention_days: result.retention_days,
              cutoff: result.cutoff,
              deleted: result.deleted,
              failed: result.failed,
              bytes_freed_estimate: result.bytes_freed_estimate,
            },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'] || null,
          });
        } catch (err) {
          request.log.error({ err }, 'SCHEDULER_R2_CLEANUP audit log failed');
        }
      }

      if (result.failed > 0) {
        request.log.warn({ result }, 'Sebagian berkas QR gagal dihapus dari R2');
      }
      if (result.capped) {
        request.log.warn(
          { scanned: result.scanned },
          'Sapuan QR berhenti di batas per jalan — jalankan lagi untuk menyelesaikan sisa',
        );
      }

      return sendSuccess(reply, {
        prefix: result.prefix,
        retention_days: result.retention_days,
        cutoff: result.cutoff,
        scanned: result.scanned,
        expired: result.expired,
        deleted: result.deleted,
        failed: result.failed,
        bytes_freed_estimate: result.bytes_freed_estimate,
        capped: result.capped,
        dry_run: result.dry_run,
        default_retention_days: DEFAULT_QR_RETENTION_DAYS,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });
}

export default schedulerRoutes;
