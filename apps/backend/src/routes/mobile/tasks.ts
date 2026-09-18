import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, desc, asc, gte, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { isValidQRCode } from '../../utils/qr';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { getLatestCollectionCondition } from '../../services/collectionSubmission';
import { skipAssignmentSchema, canVisitSchema } from './schemas';
import { AppError, isAppError } from '../../utils/AppError';
import { parseStatsRange, computeMonthsCovered } from '../../utils/statsRange';
import { computeTaskMetrics } from '../../services/taskMetrics';
import {
  actionLabel,
  conditionAfterReplacementVisit,
  isTransitionAllowed,
} from '../../services/conditionRules';
import type { CanConditionValue } from '../../services/conditionRules';
import { createProposalFromSkipReason, getLatestProposalForCan } from '../../services/conditionProposalService';
import { assertCanAccess } from '../../services/canService';

export async function tasksRoutes(fastify: FastifyInstance) {
  // GET /mobile/dashboard
  fastify.get('/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');
      }

      const latestCollectionCondition = getLatestCollectionCondition();

      // B2: hitung kaleng NON_AKTIF "perlu dikunjungi" di wilayah petugas.
      // Branch officer diambil dari token (sama dengan mekanisme akses lain).
      const officerRec = await db.query.officers.findFirst({
        where: eq(schema.officers.id, officerId),
        columns: { id: true, branchId: true },
      });
      let visitTasks = { total: 0, completed: 0 };
      if (officerRec?.branchId) {
        const nonaktifCans = await db.query.cans.findMany({
          where: and(
            eq(schema.cans.branchId, officerRec.branchId),
            eq(schema.cans.condition, 'NON_AKTIF'),
            eq(schema.cans.isActive, true),
          ),
          columns: { id: true },
          with: {
            visits: { limit: 1, columns: { id: true } },
          },
        });
        visitTasks = {
          total: nonaktifCans.length,
          // Menghitung KALENG, bukan kunjungan: 1 kaleng 3x visit = 1 selesai.
          completed: nonaktifCans.filter((c) => c.visits.length > 0).length,
        };
      }

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodYear = now.getFullYear();
      const periodMonth = now.getMonth() + 1;

      const [todayStats, weekStats, monthStats, pendingAssignments, latestRecent, remainingCount] = await Promise.all([
        db.select({
          collected: sql<number>`count(*)::int`,
          total_nominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
        }).from(schema.collections)
          .where(and(
            eq(schema.collections.officerId, officerId),
            gte(schema.collections.collectedAt, today),
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          )).then(r => r[0]),
        db.select({
          collected: sql<number>`count(*)::int`,
          total_nominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
        }).from(schema.collections)
          .where(and(
            eq(schema.collections.officerId, officerId),
            gte(schema.collections.collectedAt, weekStart),
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          )).then(r => r[0]),
        // Statistik bulan berjalan: penjemputan + progres tugas periode berjalan
        Promise.all([
          db.select({
            collected: sql<number>`count(*)::int`,
            total_nominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
          }).from(schema.collections)
            .where(and(
              eq(schema.collections.officerId, officerId),
              gte(schema.collections.collectedAt, monthStart),
              eq(schema.collections.syncStatus, 'COMPLETED'),
              latestCollectionCondition
            )).then(r => r[0]),
          db.select({
            status: schema.assignments.status,
            count: sql<number>`count(*)::int`,
          }).from(schema.assignments)
            .where(and(
              eq(schema.assignments.officerId, officerId),
              eq(schema.assignments.periodYear, periodYear),
              eq(schema.assignments.periodMonth, periodMonth)
            ))
            .groupBy(schema.assignments.status),
        ]).then(([colRes, taskRows]) => {
          // Kontrak metrik final — rumus dipusatkan di taskMetrics
          // (docs/audit/dasar-perbaikan-metrik-tugas-mobile-2026-09-13.md §7).
          // Field lama (task_total/task_completed) dipertahankan untuk APK lama.
          const metrics = computeTaskMetrics(taskRows);
          return {
            collected: colRes.collected,
            total_nominal: colRes.total_nominal,
            task_total: metrics.task_total,
            task_completed: metrics.task_completed,
            task_active: metrics.task_active,
            task_closed: metrics.task_closed,
            task_uncollected: metrics.task_uncollected,
          };
        }),
        db.query.assignments.findMany({
          where: and(eq(schema.assignments.officerId, officerId), eq(schema.assignments.status, 'ACTIVE')),
          with: {
            can: {
              columns: { id: true, qrCode: true, ownerName: true, ownerAddress: true, latitude: true, longitude: true, condition: true, isActive: true },
            },
          },
          limit: 10,
          orderBy: [asc(schema.assignments.assignedAt)],
        }),
        db.query.collections.findMany({
          where: and(
            eq(schema.collections.officerId, officerId),
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          ),
          with: { can: { columns: { qrCode: true, ownerName: true } } },
          orderBy: [desc(schema.collections.collectedAt)],
          limit: 5,
        }),
        // Hitung jumlah AKTUAL tugas yang belum selesai (tidak dibatasi limit)
        db.$count(
          schema.assignments,
          and(eq(schema.assignments.officerId, officerId), eq(schema.assignments.status, 'ACTIVE'))
        ),
      ]);

      return sendSuccess(reply, {
        today_stats: {
          collected: todayStats.collected,
          total_nominal: Number(todayStats.total_nominal),
          remaining: remainingCount, // Jumlah aktual dari DB, bukan panjang array yang dibatasi limit 10
        },
        week_stats: {
          collected: weekStats.collected,
          total_nominal: Number(weekStats.total_nominal),
        },
        month_stats: {
          collected: monthStats.collected,
          total_nominal: Number(monthStats.total_nominal),
          task_total: monthStats.task_total,
          task_completed: monthStats.task_completed,
          // Field baru (kontrak 2026-09-13) — selalu ada sejak taskMetrics
          // dipusatkan; MonthStats mempertahankannya opsional demi APK lama.
          task_active: monthStats.task_active,
          task_closed: monthStats.task_closed,
          task_uncollected: monthStats.task_uncollected,
        },
        pending_tasks: pendingAssignments.map((a) => ({
          id: a.id,
          can_id: a.can.id,
          qr_code: a.can.qrCode,
          owner_name: a.can.ownerName,
          address: a.can.ownerAddress,
          latitude: a.can.latitude,
          longitude: a.can.longitude,
          condition: a.can.condition,
          is_active: a.can.isActive,
          assigned_at: a.assignedAt,
        })),
        // B2: kaleng NON_AKTIF di wilayah petugas — "tugas kunjungan"
        // (bukan assignment). Dihitung sebagai jumlah KALENG, bukan jumlah
        // kunjungan: 1 kaleng 3x visit = 1. Kaleng yang sudah ditarik
        // (DIKEMBALIKAN) otomatis keluar dari pembilang & penyebut.
        visit_tasks: visitTasks,
        recent_collections: latestRecent.map((c) => ({
          id: c.id,
          qr_code: c.can.qrCode,
          owner_name: c.can.ownerName,
          nominal: Number(c.nominal),
          collected_at: c.collectedAt,
        })),
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // GET /mobile/tasks
  /**
   * GET /mobile/cans/visit-required
   *
   * Daftar kaleng NON_AKTIF di wilayah petugas yang perlu dikunjungi untuk
   * penyelesaian (pencabutan / verifikasi). Tidak menggunakan assignments —
   * kaleng NON_AKTIF memang tidak punya assignment (di luar mekanisme normal).
   * Filter wilayah tetap lewat `assertCanAccess` per item.
   */
  fastify.get('/cans/visit-required', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const officerId = user.officerId;
      if (!officerId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');
      }

      // Officer selalu terikat ke 1 branch (ranting) — filter dari sana, bukan
      // dari parameter permintaan, supaya tidak bisa melihat wilayah lain.
      const officer = await db.query.officers.findFirst({
        where: eq(schema.officers.id, officerId),
        columns: { id: true, branchId: true, districtId: true },
      });
      if (!officer?.branchId) {
        return sendSuccess(reply, { items: [], total: 0 });
      }

      const cans = await db.query.cans.findMany({
        where: and(
          eq(schema.cans.branchId, officer.branchId),
          eq(schema.cans.condition, 'NON_AKTIF'),
          eq(schema.cans.isActive, true),
        ),
        with: {
          visits: {
            limit: 1,
            orderBy: [desc(schema.canVisits.visitedAt)],
            columns: { id: true, purpose: true, visitedAt: true },
          },
        },
        orderBy: [asc(schema.cans.qrCode)],
      });

      const items = cans.map((c) => ({
        can_id: c.id,
        qr_code: c.qrCode,
        owner_name: c.ownerName,
        owner_address: c.ownerAddress,
        latitude: c.latitude,
        longitude: c.longitude,
        condition: c.condition,
        last_visit: c.visits[0]?.visitedAt ?? null,
        last_visit_purpose: c.visits[0]?.purpose ?? null,
      }));

      return sendSuccess(reply, { items, total: items.length });
    } catch (error: unknown) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.get('/tasks', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const officerId = user.officerId;
      const query = request.query as { status?: string; page?: string; limit?: string };

      if (!officerId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');
      }

      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '20');
      const status = query.status || 'ACTIVE';
      const skip = (page - 1) * limit;
      const currentPeriod = new Date();
      const currentYear = currentPeriod.getFullYear();
      const currentMonth = currentPeriod.getMonth() + 1;

      const conditions: any[] = [
        eq(schema.assignments.officerId, officerId!),
        eq(schema.assignments.status, status as any),
      ];
      const whereClause = and(...conditions);

      const [assignments, total] = await Promise.all([
        db.query.assignments.findMany({
          where: whereClause,
          with: {
            can: {
              columns: { id: true, qrCode: true, ownerName: true, ownerPhone: true, ownerAddress: true, latitude: true, longitude: true, condition: true, isActive: true },
            },
          },
          orderBy: [
            status === 'COMPLETED'
              ? desc(schema.assignments.completedAt)
              : asc(schema.assignments.assignedAt),
          ],
          offset: skip,
          limit,
        }),
        db.$count(schema.assignments, whereClause),
      ]);

      let totalNominal = 0;
      if (status === 'COMPLETED') {
        const nominalResult = await db.select({
          total_nominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`
        })
        .from(schema.collections)
        .innerJoin(schema.assignments, eq(schema.collections.assignmentId, schema.assignments.id))
        .where(and(
          eq(schema.collections.officerId, officerId),
          eq(schema.collections.syncStatus, 'COMPLETED'),
          eq(schema.assignments.periodYear, currentYear),
          eq(schema.assignments.periodMonth, currentMonth),
          getLatestCollectionCondition()
        ));

        totalNominal = Number(nominalResult[0]?.total_nominal || 0);
      }

      const items = assignments.map((a) => ({
        id: a.id,
        can_id: a.can.id,
        qr_code: a.can.qrCode,
        owner_name: a.can.ownerName,
        owner_phone: a.can.ownerPhone,
        owner_address: a.can.ownerAddress,
        latitude: a.can.latitude,
        longitude: a.can.longitude,
        condition: a.can.condition,
        is_active: a.can.isActive,
        status: a.status,
        assigned_at: a.assignedAt,
        period: `${a.periodYear}-${String(a.periodMonth).padStart(2, '0')}`,
      }));

      return sendSuccess(reply, {
        items,
        tasks: items,
        total_nominal: totalNominal,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // GET /mobile/tasks/stats-range?start=YYYY-MM-DD&end=YYYY-MM-DD
  // Akumulasi penjemputan dalam rentang tanggal + progres tugas dari semua
  // periode (bulan) yang tersentuh rentang.
  fastify.get('/tasks/stats-range', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');
      }

      const query = request.query as { start?: string; end?: string };
      const parsed = parseStatsRange(query.start, query.end);
      if (!parsed.ok) {
        return sendError(reply, 400, 'BAD_REQUEST', parsed.error!);
      }
      const startDate = parsed.startDate!;
      const endDate = parsed.endDate!;

      // Daftar periode (YYYY-MM) yang tersentuh rentang — dipakai untuk filter
      // tugas dan dilaporkan kembali sebagai months_covered.
      const monthsCovered = computeMonthsCovered(startDate, endDate);
      const periodConditions = monthsCovered.map((period) => {
        const [y, m] = period.split('-').map(Number);
        return and(eq(schema.assignments.periodYear, y), eq(schema.assignments.periodMonth, m));
      });

      const latestCollectionCondition = getLatestCollectionCondition();

      const [colRes, taskRows] = await Promise.all([
        db.select({
          collected: sql<number>`count(*)::int`,
          total_nominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
        }).from(schema.collections)
          .where(and(
            eq(schema.collections.officerId, officerId),
            gte(schema.collections.collectedAt, startDate),
            lte(schema.collections.collectedAt, endDate),
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          )).then(r => r[0]),
        db.select({
          status: schema.assignments.status,
          count: sql<number>`count(*)::int`,
        }).from(schema.assignments)
          .where(and(
            eq(schema.assignments.officerId, officerId),
            or(...periodConditions)
          ))
          .groupBy(schema.assignments.status),
      ]);

      const metrics = computeTaskMetrics(taskRows);
      return sendSuccess(reply, {
        collected: colRes.collected,
        total_nominal: Number(colRes.total_nominal),
        task_active: metrics.task_active,
        task_completed: metrics.task_completed,
        task_closed: metrics.task_closed,
        task_uncollected: metrics.task_uncollected,
        task_total: metrics.task_total,
        months_covered: monthsCovered,
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // GET /mobile/scan/:qrCode
  fastify.get('/scan/:qrCode', {
    config: {
      rateLimit: { max: 30, timeWindow: '1 minute' },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { qrCode } = request.params as { qrCode: string };
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');
      }

      if (!isValidQRCode(qrCode)) {
        return sendError(reply, 400, 'QR_INVALID', 'Format kode QR tidak valid');
      }

      const can = await db.query.cans.findFirst({
        where: eq(schema.cans.qrCode, qrCode),
        with: {
          collections: { orderBy: [desc(schema.collections.collectedAt)], limit: 1 },
          assignments: {
            where: and(
              eq(schema.assignments.officerId, officerId!),
              eq(schema.assignments.status, 'ACTIVE'),
              eq(schema.assignments.periodYear, new Date().getFullYear()),
              eq(schema.assignments.periodMonth, new Date().getMonth() + 1)
            ),
          },
        },
      });

      if (!can) {
        return sendError(reply, 404, 'CAN_NOT_FOUND', 'Kaleng tidak ditemukan');
      }

      if (!can.isActive) {
        // Kaleng yang sudah ditarik admin (DIKEMBALIKAN) diberi kode khusus
        // agar petugas paham — bukan sekadar "QR tidak valid" (Fase 4).
        if (can.condition === 'DIKEMBALIKAN') {
          return sendError(reply, 400, 'CAN_RETURNED', 'Kaleng ini sudah dikembalikan dan ditarik admin, bukan tugas aktif');
        }
        return sendError(reply, 400, 'QR_INVALID', 'Kaleng tidak aktif');
      }

      const lastCollection = can.collections[0];
      const activeAssignment = can.assignments[0];

      if (!activeAssignment) {
        return sendError(reply, 403, 'QR_NOT_ASSIGNED', 'Kaleng ini bukan tugas Anda pada periode berjalan');
      }

      return sendSuccess(reply, {
        id: activeAssignment.id,
        can_id: can.id,
        qr_code: can.qrCode,
        owner_name: can.ownerName,
        owner_phone: can.ownerPhone,
        owner_address: can.ownerAddress,
        latitude: can.latitude ? Number(can.latitude) : undefined,
        longitude: can.longitude ? Number(can.longitude) : undefined,
        last_collection: lastCollection
          ? { nominal: Number(lastCollection.nominal), date: lastCollection.collectedAt }
          : null,
        status: activeAssignment.status,
        assigned_at: activeAssignment.assignedAt,
        period: `${activeAssignment.periodYear}-${String(activeAssignment.periodMonth).padStart(2, '0')}`,
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // POST /mobile/assignments/:id/skip
  fastify.post('/assignments/:id/skip', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = skipAssignmentSchema.parse(request.body || {});
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');
      }

      const assignment = await db.query.assignments.findFirst({
        where: and(
          eq(schema.assignments.id, id),
          eq(schema.assignments.officerId, officerId),
          eq(schema.assignments.status, 'ACTIVE')
        ),
      });

      if (!assignment) {
        return sendError(reply, 403, 'ASSIGNMENT_INVALID', 'Assignment tidak valid, bukan milik Anda, atau sudah selesai');
      }

      // APK lama (pra-rilis pemilih alasan) belum mengirim reason_code → OTHER.
      const reasonCode = body.reason_code ?? 'OTHER';
      const isLegacySkip = !body.reason_code;

      await db.update(schema.assignments)
        .set({
          status: 'UNCOLLECTED',
          // Kode alasan baku. APK lama yang belum mengirim kode dipetakan ke OTHER
          // (masa transisi) dan ditandai di `notes` agar tetap bisa diaudit.
          skipReasonCode: reasonCode,
          notes: body.notes || (isLegacySkip ? 'APK lama tanpa reason_code (dipetakan ke OTHER)' : null),
          updatedAt: new Date(),
          completedAt: new Date(),
        })
        .where(eq(schema.assignments.id, id));

      // CAN_LOST / CAN_DAMAGED memicu usulan perubahan kondisi.
      // Sistem mengusulkan; admin yang memutuskan (kondisi TIDAK berubah di sini).
      let proposalId: string | undefined;
      if (assignment.canId) {
        try {
          const proposal = await createProposalFromSkipReason(
            assignment.canId,
            reasonCode,
            body.notes ?? null,
          );
          proposalId = proposal?.id;
        } catch (proposalError) {
          // Usulan yang gagal tidak boleh menggagalkan penutupan tugas petugas.
          fastify.log.warn({ err: proposalError }, 'gagal membuat usulan kondisi dari skip reason');
        }
      }

      return sendSuccess(reply, {
        id,
        status: 'UNCOLLECTED',
        reason_code: reasonCode,
        proposal_id: proposalId,
        message: 'Kaleng ditandai tidak dijemput',
      });
    } catch (error) {
      if (error instanceof AppError || isAppError(error)) {
        return sendError(reply, (error as AppError).statusCode, (error as AppError).code, (error as AppError).message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // GET /mobile/assignments/:id/proposal-status
  //
  // Status usulan kondisi terbaru untuk kaleng pada satu assignment milik
  // petugas (Fase 1 rencana susulan mobile–overview). Kepemilikan diperiksa
  // lewat assignment (officerId dari token) — petugas hanya bisa membaca
  // usulan untuk tugasnya sendiri. Proyeksi status saja, bukan detail penuh
  // admin (lihat getCanDetail di canService).
  fastify.get('/assignments/:id/proposal-status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');
      }

      const assignment = await db.query.assignments.findFirst({
        where: and(
          eq(schema.assignments.id, id),
          eq(schema.assignments.officerId, officerId),
        ),
        columns: { id: true, canId: true },
      });

      if (!assignment) {
        return sendError(reply, 403, 'ASSIGNMENT_INVALID', 'Assignment tidak valid atau bukan milik Anda');
      }

      const proposal = assignment.canId ? await getLatestProposalForCan(assignment.canId) : null;

      return sendSuccess(reply, {
        assignment_id: id,
        can_id: assignment.canId,
        proposal: proposal ? {
          id: proposal.id,
          from_condition: proposal.fromCondition,
          to_condition: proposal.toCondition,
          status: proposal.status,
          reason_code: proposal.reasonCode,
          action_label: actionLabel(proposal.toCondition as CanConditionValue),
          created_at: proposal.createdAt,
          decided_at: proposal.approvedAt,
        } : null,
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // POST /mobile/periods/complete
  fastify.post('/periods/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');
      }

      const now = new Date();
      const periodYear = now.getFullYear();
      const periodMonth = now.getMonth() + 1;

      const activeCount = await db.$count(
        schema.assignments,
        and(
          eq(schema.assignments.officerId, officerId),
          eq(schema.assignments.periodYear, periodYear),
          eq(schema.assignments.periodMonth, periodMonth),
          eq(schema.assignments.status, 'ACTIVE')
        )
      );

      if (activeCount === 0) {
        return sendSuccess(reply, {
          period: `${periodYear}-${String(periodMonth).padStart(2, '0')}`,
          skipped_count: 0,
          message: 'Tidak ada kaleng yang perlu ditandai',
        });
      }

      await db.update(schema.assignments)
        .set({
          status: 'UNCOLLECTED',
          updatedAt: new Date(),
          completedAt: new Date(),
        })
        .where(and(
          eq(schema.assignments.officerId, officerId),
          eq(schema.assignments.periodYear, periodYear),
          eq(schema.assignments.periodMonth, periodMonth),
          eq(schema.assignments.status, 'ACTIVE')
        ));

      return sendSuccess(reply, {
        period: `${periodYear}-${String(periodMonth).padStart(2, '0')}`,
        skipped_count: activeCount,
        message: `${activeCount} kaleng ditandai tidak dijemput untuk periode berjalan`,
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  /**
   * GET /mobile/visits
   *
   * Riwayat kunjungan non-penjemputan milik petugas (Fase 3 rencana susulan
   * mobile–overview). Proyeksi ringan untuk layar Riwayat; kunjungan bukan
   * collection sehingga tidak memengaruhi angka penjemputan/nominal.
   */
  fastify.get('/visits', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');
      }

      const query = request.query as { limit?: string };
      const limit = Math.min(Math.max(parseInt(query.limit || '10', 10) || 10, 1), 50);

      const rows = await db.query.canVisits.findMany({
        where: eq(schema.canVisits.officerId, officerId),
        with: { can: { columns: { qrCode: true, ownerName: true } } },
        orderBy: [desc(schema.canVisits.visitedAt)],
        limit,
      });

      return sendSuccess(reply, {
        items: rows.map((v) => ({
          id: v.id,
          can_id: v.canId,
          qr_code: v.can?.qrCode ?? '',
          owner_name: v.can?.ownerName ?? '',
          purpose: v.purpose,
          visited_at: v.visitedAt,
          notes: v.notes,
        })),
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  /**
   * POST /mobile/cans/:canId/visits
   *
   * Kunjungan verifikasi (kaleng NON_AKTIF) atau penggantian unit (RUSAK/HILANG).
   * Sengaja BUKAN collection: tidak ada nominal, tidak menambah hitungan kosong,
   * dan tidak muncul sebagai penjemputan di dashboard.
   *
   * Kunjungan PENGGANTIAN menutup kasus RUSAK/HILANG → kondisi kembali AKTIF dan
   * angka cakupan hilang berkurang.
   */
  fastify.post('/cans/:canId/visits', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { canId } = request.params as { canId: string };
      const body = canVisitSchema.parse(request.body || {});
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');
      }

      // Pintu wajib: petugas hanya boleh mengunjungi kaleng pada rantingnya sendiri.
      // Tanpa ini, penggantian unit (PENGGANTIAN) bisa mengubah status kaleng di luar
      // wilayah petugas. Aturan diambil dari `assertCanAccess` (sumber tunggal,
      // sama dengan semua rute admin), branchId dari token — bukan dari permintaan.
      const can = await db.query.cans.findFirst({
        where: eq(schema.cans.id, canId),
        with: {
          branch: { columns: { districtId: true } },
        },
        columns: { id: true, condition: true, isActive: true, branchId: true },
      });
      if (!can) {
        return sendError(reply, 404, 'CAN_NOT_FOUND', 'Kaleng tidak ditemukan');
      }

      await assertCanAccess(user, can, 'Kaleng ini bukan wilayah Anda');

      const visitedAt = body.visited_at ? new Date(body.visited_at) : new Date();
      const [visit] = await db.insert(schema.canVisits).values({
        canId,
        officerId,
        purpose: body.purpose,
        visitedAt,
        notes: body.notes ?? null,
      }).returning();

      let newCondition: CanConditionValue | null = null;
      let visitMessage = 'Kunjungan tercatat sebagai kunjungan, bukan penjemputan';
      if (body.purpose === 'PENCABUTAN') {
        // Petugas menarik kaleng NON_AKTIF untuk dikembalikan ke kantor (B2).
        // Hanya dari NON_AKTIF — kondisi lain tidak punya "kasus terbuka" untuk
        // ditutup. Transisi dikunci oleh ALLOWED_TRANSITIONS.
        const current = can.condition as CanConditionValue;
        if (current !== 'NON_AKTIF') {
          return sendError(reply, 409, 'CAN_NOT_WITHDRAWN',
            `Kaleng berstatus ${current} — hanya kaleng NON_AKTIF yang dapat dicabut`);
        }
        if (!isTransitionAllowed(current, 'DIKEMBALIKAN')) {
          return sendError(reply, 409, 'INVALID_TRANSITION',
            'Kaleng dalam kondisi yang tidak dapat ditarik saat ini');
        }
        await db.update(schema.cans)
          .set({ condition: 'DIKEMBALIKAN', isActive: false, updatedAt: new Date() })
          .where(eq(schema.cans.id, canId));
        // Kasus tertutup → assignment tidak lagi dianggap aktif.
        await db.update(schema.assignments)
          .set({ status: 'COMPLETED', updatedAt: new Date() })
          .where(and(
            eq(schema.assignments.canId, canId),
            eq(schema.assignments.status, 'ACTIVE'),
          ));
        newCondition = 'DIKEMBALIKAN';
        visitMessage = 'Kaleng dicabut dan ditandai dikembalikan ke kantor';
      } else if (body.purpose === 'PENGGANTIAN') {
        const current = can.condition as CanConditionValue;
        const target = conditionAfterReplacementVisit(current);
        if (target && isTransitionAllowed(current, target)) {
          await db.update(schema.cans)
            .set({ condition: target, isActive: true, updatedAt: new Date() })
            .where(eq(schema.cans.id, canId));
          newCondition = target;
        }
      }

      return sendSuccess(reply, {
        id: visit.id,
        can_id: canId,
        purpose: visit.purpose,
        visited_at: visit.visitedAt,
        condition: newCondition ?? can.condition,
        message: visitMessage,
      }, 201);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      if (isAppError(error)) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
