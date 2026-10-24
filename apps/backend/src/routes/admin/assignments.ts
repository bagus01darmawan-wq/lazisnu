import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, desc, inArray, or, ilike, sql, asc, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { getPaginationParams, formatPaginatedResponse } from '../../utils/pagination';
import { getRoleScope } from '../../utils/role-scope';
import { assertBranchAccess } from '../../middleware/ownership';
import { createAssignmentSchema } from './schemas';
import { z } from 'zod';
import { insertAssignments } from '../../services/assignmentGenerator';
import * as regionCardService from '../../services/regionCardService';
import { ASSIGNABLE_CONDITIONS } from '../../services/conditionRules';
import { getAssignmentWorkQueue } from '../../services/assignmentWorkQueueService';
import { AppError, isAppError } from '../../utils/AppError';
import { currentOperationalPeriod } from '../../utils/operationalTimeZone';

const rantingOrKec = { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')] };

export async function assignmentsRoutes(fastify: FastifyInstance) {
  // Ringkasan per wilayah untuk layer kartu. Static segment didahulukan atas
  // route ber-param oleh router Fastify.
  fastify.get('/assignments/region-cards', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const query = request.query as { year?: string; month?: string };
      const cards = await regionCardService.getAssignmentRegionCards(user, query);
      return sendSuccess(reply, cards);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // Ruang kerja tab "Kelola": summary + queue + beban petugas dalam satu request.
  fastify.get('/assignments/work-queue', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const query = request.query as {
        year?: string;
        month?: string;
        branch_id?: string;
        dukuh_id?: string;
      };
      const workQueue = await getAssignmentWorkQueue(user, query);
      return sendSuccess(reply, workQueue);
    } catch (error) {
      if (isAppError(error)) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.get('/assignments', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { 
        year?: string; 
        month?: string; 
        officer_id?: string; 
        branch_id?: string;
        dukuh_id?: string;
        search?: string;
        status?: string;
        page?: string; 
        limit?: string 
      };
      const { page, limit, offset } = getPaginationParams(query);
      const user = request.currentUser!;

      const roleScope = await getRoleScope(user, schema.cans);
      
      const conditions: any[] = [];
      if (roleScope) conditions.push(roleScope);
      
      // Tanpa guard ini `?year=abc` menjadi binding NaN dan meledak sebagai
      // 500 di database; batas rentang mengikuti skema periode endpoint lain.
      if (query.year) {
        const year = z.coerce.number().int().min(2020).max(2100).safeParse(query.year);
        if (!year.success) {
          return sendError(reply, 400, 'VALIDATION_ERROR', 'Tahun tidak valid');
        }
        conditions.push(eq(schema.assignments.periodYear, year.data));
      }
      if (query.month) {
        const month = z.coerce.number().int().min(1).max(12).safeParse(query.month);
        if (!month.success) {
          return sendError(reply, 400, 'VALIDATION_ERROR', 'Bulan tidak valid');
        }
        conditions.push(eq(schema.assignments.periodMonth, month.data));
      }
      if (query.officer_id) conditions.push(eq(schema.assignments.officerId, query.officer_id));
      if (query.status) {
        const status = z
          .enum(['ACTIVE', 'COMPLETED', 'REASSIGNED', 'UNCOLLECTED'])
          .safeParse(query.status);
        if (!status.success) {
          return sendError(reply, 400, 'VALIDATION_ERROR', 'Status tidak valid');
        }
        conditions.push(eq(schema.assignments.status, status.data));
      }
      
      // Filter by specific branch
      if (query.branch_id) {
        conditions.push(eq(schema.cans.branchId, query.branch_id));
      }

      // Layer kartu admin ranting menyaring per dukuh. Sengaja memakai
      // `cans.dukuh_id`, bukan `dukuhs.name`, karena query count di bawah tidak
      // melakukan join ke tabel dukuhs.
      if (query.dukuh_id) {
        conditions.push(eq(schema.cans.dukuhId, query.dukuh_id));
      }

      // Advanced Search (Can QR, Owner Name, or Officer Name)
      if (query.search) {
        const searchPattern = `%${query.search}%`;
        conditions.push(
          or(
            ilike(schema.cans.qrCode, searchPattern),
            ilike(schema.cans.ownerName, searchPattern),
            ilike(schema.users.fullName, searchPattern)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const officerBranch = alias(schema.branches, 'officerBranch');

      const [assignments, total] = await Promise.all([
        db.select({
          id: schema.assignments.id,
          canId: schema.assignments.canId,
          officerId: schema.assignments.officerId,
          periodMonth: schema.assignments.periodMonth,
          periodYear: schema.assignments.periodYear,
          status: schema.assignments.status,
          assignedAt: schema.assignments.assignedAt,
          can: {
            qrCode: schema.cans.qrCode,
            ownerName: schema.cans.ownerName,
            branchId: schema.cans.branchId,
            branchName: schema.branches.name,
            rt: schema.cans.rt,
            rw: schema.cans.rw,
            dukuh: schema.cans.dukuh,
            dukuhName: schema.dukuhs.name,
          },
          officer: {
            fullName: schema.users.fullName,
            employeeCode: schema.officers.employeeCode,
            branchName: officerBranch.name,
          }
        })
        .from(schema.assignments)
        .innerJoin(schema.cans, eq(schema.assignments.canId, schema.cans.id))
        .innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
        .leftJoin(schema.dukuhs, eq(schema.cans.dukuhId, schema.dukuhs.id))
        .innerJoin(schema.officers, eq(schema.assignments.officerId, schema.officers.id))
        .innerJoin(schema.users, eq(schema.officers.userId, schema.users.id))
        .innerJoin(officerBranch, eq(schema.officers.branchId, officerBranch.id))
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(schema.assignments.assignedAt)),
        
        db.select({ count: sql<number>`count(*)` })
          .from(schema.assignments)
          .innerJoin(schema.cans, eq(schema.assignments.canId, schema.cans.id))
          .innerJoin(schema.officers, eq(schema.assignments.officerId, schema.officers.id))
          .innerJoin(schema.users, eq(schema.officers.userId, schema.users.id))
          .where(whereClause)
          .then(res => Number(res[0].count))
      ]);

      return sendSuccess(reply, formatPaginatedResponse(assignments, total, page, limit));
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/assignments', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const body = createAssignmentSchema.parse(request.body);

      if (user.role === 'ADMIN_RANTING') {
        const can = await db.query.cans.findFirst({ where: eq(schema.cans.id, body.can_id) });
        if (!can || can.branchId !== user.branchId) {
          return sendError(reply, 403, 'FORBIDDEN', 'Kaleng bukan milik ranting Anda');
        }
        const officer = await db.query.officers.findFirst({ where: eq(schema.officers.id, body.officer_id) });
        if (!officer || officer.branchId !== user.branchId) {
          return sendError(reply, 403, 'FORBIDDEN', 'Petugas bukan anggota ranting Anda');
        }
      }

      // Kunci baris kaleng lalu periksa ulang assignment di dalam transaksi
      // yang sama: dua request bersamaan untuk kaleng yang sama menjadi
      // serial — yang kedua melihat hasil yang pertama dan tertolak 409,
      // bukan menghasilkan penugasan ganda pada periode yang sama.
      const inserted = await db.transaction(async (tx) => {
        await tx
          .select({ id: schema.cans.id })
          .from(schema.cans)
          .where(eq(schema.cans.id, body.can_id))
          .for('update');

        const existing = await tx.query.assignments.findFirst({
          where: and(eq(schema.assignments.canId, body.can_id), eq(schema.assignments.periodYear, body.period_year), eq(schema.assignments.periodMonth, body.period_month)),
        });
        if (existing) return null;

        return tx.insert(schema.assignments).values({
          canId: body.can_id,
          officerId: body.officer_id,
          backupOfficerId: body.backup_officer_id,
          periodYear: body.period_year,
          periodMonth: body.period_month,
        }).returning();
      });
      if (!inserted) {
        return sendError(reply, 409, 'CONFLICT', 'Kaleng sudah ditugaskan bulan ini');
      }

      request.auditContext = { newData: inserted[0] };
      return sendSuccess(reply, inserted[0], 201);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.issues);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/assignments/bulk-branch', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = z.object({
        branch_id: z.string().uuid(),
        officer_id: z.string().uuid(),
        dukuh_ids: z.array(z.string().uuid()).optional().nullable(),
        period_year: z.number().int().min(2020).max(2100).optional(),
        period_month: z.number().int().min(1).max(12).optional(),
      }).parse(request.body);

      const user = request.currentUser!;
      await assertBranchAccess(user, body.branch_id);
      if (user.role === 'ADMIN_RANTING' && body.branch_id !== user.branchId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Anda hanya dapat membuat penugasan massal untuk ranting sendiri');
      }

      const operational = currentOperationalPeriod();
      const currentYear = body.period_year ?? operational.year;
      const currentMonth = body.period_month ?? operational.month;

      const candidateConditions: any[] = [
        eq(schema.cans.branchId, body.branch_id),
        eq(schema.cans.isActive, true),
        // Hanya AKTIF, RUSAK, dan HILANG yang boleh menerima tugas penjemputan.
        // NON_AKTIF cukup dikunjungi untuk verifikasi; DIKEMBALIKAN sudah keluar.
        inArray(schema.cans.condition, ASSIGNABLE_CONDITIONS),
      ];

      if (body.dukuh_ids && body.dukuh_ids.length > 0) {
        const dukuhsInBranch = await db.query.dukuhs.findMany({
          where: and(
            inArray(schema.dukuhs.id, body.dukuh_ids),
            eq(schema.dukuhs.branchId, body.branch_id)
          )
        });

        if (dukuhsInBranch.length !== body.dukuh_ids.length) {
          return sendError(reply, 400, 'INVALID_DUKUH', 'Satu atau lebih dukuh yang dipilih tidak terdaftar di ranting ini');
        }

        candidateConditions.push(inArray(schema.cans.dukuhId, body.dukuh_ids));
      }

      // Kunci kandidat kaleng (urut id agar urutan lock konsisten antar
      // request), lalu periksa ulang assignment di dalam transaksi yang sama:
      // dua assign bersamaan untuk kaleng yang sama menjadi serial, yang
      // kedua melihat hasil yang pertama dan melewatinya — bukan menugaskan
      // ulang. Pola lock yang sama dipakai bulk-cans, POST /assignments,
      // transfer, dan scheduler/generate-tasks.
      const { newAssignments, assignedCount } = await db.transaction(async (tx) => {
        const candidates = await tx
          .select({ id: schema.cans.id })
          .from(schema.cans)
          .where(and(...candidateConditions))
          .orderBy(asc(schema.cans.id))
          .for('update');

        const candidateIds = candidates.map((can) => can.id);
        const assignedRows =
          candidateIds.length === 0
            ? []
            : await tx
                .select({ canId: schema.assignments.canId })
                .from(schema.assignments)
                .where(
                  and(
                    inArray(schema.assignments.canId, candidateIds),
                    eq(schema.assignments.periodYear, currentYear),
                    eq(schema.assignments.periodMonth, currentMonth)
                  )
                );
        const assignedCanIds = new Set(assignedRows.map((row) => row.canId));
        const eligibleCanIds = candidateIds.filter((canId) => !assignedCanIds.has(canId));

        if (eligibleCanIds.length === 0) {
          throw new AppError('ALREADY_ASSIGNED', 'Semua kaleng di wilayah/dukuh yang dipilih sudah memiliki jadwal penugasan untuk bulan ini', 400);
        }

        const newAssignments = eligibleCanIds.map((canId) => ({
          canId,
          officerId: body.officer_id,
          periodYear: currentYear,
          periodMonth: currentMonth,
          status: 'ACTIVE' as const,
        }));

        await insertAssignments(newAssignments, false, tx);
        return { newAssignments, assignedCount: eligibleCanIds.length };
      });

      request.auditContext = { newData: newAssignments };
      return sendSuccess(reply, {
        assigned_count: assignedCount,
        period: `${currentMonth}/${currentYear}`
      }, 201);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.issues);
      }
      if (isAppError(error)) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  /**
   * Assign sebagian kaleng (subset RT/pemilik) pada scope dukuh. Dipakai tab
   * Kelola ketika queue berisi grup RT/kaleng, bukan dukuh utuh.
   */
  fastify.post('/assignments/bulk-cans', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = z.object({
        officer_id: z.string().uuid(),
        can_ids: z.array(z.string().uuid()).min(1).max(500),
        period_year: z.number().int().min(2020).max(2100).optional(),
        period_month: z.number().int().min(1).max(12).optional(),
      }).parse(request.body);

      const user = request.currentUser!;
      const uniqueCanIds = Array.from(new Set(body.can_ids));

      const officer = await db.query.officers.findFirst({
        where: eq(schema.officers.id, body.officer_id),
        columns: { id: true, branchId: true, isActive: true },
      });
      if (!officer) return sendError(reply, 404, 'OFFICER_NOT_FOUND', 'Petugas tidak ditemukan');
      if (!officer.isActive) return sendError(reply, 400, 'OFFICER_INACTIVE', 'Petugas non-aktif');
      await assertBranchAccess(user, officer.branchId);
      if (user.role === 'ADMIN_RANTING' && officer.branchId !== user.branchId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Petugas bukan anggota ranting Anda');
      }

      const cans = await db.query.cans.findMany({
        where: inArray(schema.cans.id, uniqueCanIds),
        columns: { id: true, branchId: true, isActive: true, condition: true },
      });

      if (cans.length !== uniqueCanIds.length) {
        return sendError(reply, 403, 'FORBIDDEN', 'Satu atau lebih kaleng tidak ditemukan atau bukan milik wilayah Anda');
      }
      if (cans.some((can) => can.branchId !== officer.branchId)) {
        return sendError(reply, 400, 'BRANCH_MISMATCH', 'Petugas dan kaleng harus berada di ranting yang sama');
      }
      if (user.role === 'ADMIN_RANTING' && cans.some((can) => can.branchId !== user.branchId)) {
        return sendError(reply, 403, 'FORBIDDEN', 'Kaleng bukan milik ranting Anda');
      }

      const operational = currentOperationalPeriod();
      const currentYear = body.period_year ?? operational.year;
      const currentMonth = body.period_month ?? operational.month;

      // Kunci kaleng yang diminta, lalu hitung ulang kelayakan dan sisipkan
      // di transaksi yang sama — pola yang sama dengan bulk-branch agar dua
      // request bersamaan tidak menghasilkan penugasan ganda.
      const { newAssignments, assignedCount, skippedCount } = await db.transaction(async (tx) => {
        const lockedCans = await tx
          .select({
            id: schema.cans.id,
            isActive: schema.cans.isActive,
            condition: schema.cans.condition,
          })
          .from(schema.cans)
          .where(inArray(schema.cans.id, uniqueCanIds))
          .orderBy(asc(schema.cans.id))
          .for('update');

        if (lockedCans.length !== uniqueCanIds.length) {
          throw new AppError('FORBIDDEN', 'Satu atau lebih kaleng tidak ditemukan atau bukan milik wilayah Anda', 403);
        }

        const assignedRows = await tx
          .select({ canId: schema.assignments.canId })
          .from(schema.assignments)
          .where(
            and(
              inArray(schema.assignments.canId, uniqueCanIds),
              eq(schema.assignments.periodYear, currentYear),
              eq(schema.assignments.periodMonth, currentMonth)
            )
          );
        const assignedCanIds = new Set(assignedRows.map((row) => row.canId));

        const eligible = lockedCans.filter(
          (can) =>
            can.isActive &&
            (ASSIGNABLE_CONDITIONS as string[]).includes(can.condition) &&
            !assignedCanIds.has(can.id)
        );

        if (eligible.length === 0) {
          throw new AppError('ALREADY_ASSIGNED', 'Semua kaleng yang dipilih sudah memiliki jadwal penugasan untuk bulan ini', 400);
        }

        const newAssignments = eligible.map((can) => ({
          canId: can.id,
          officerId: body.officer_id,
          periodYear: currentYear,
          periodMonth: currentMonth,
          status: 'ACTIVE' as const,
        }));

        await insertAssignments(newAssignments, false, tx);
        return {
          newAssignments,
          assignedCount: eligible.length,
          skippedCount: uniqueCanIds.length - eligible.length,
        };
      });

      request.auditContext = { newData: newAssignments };
      return sendSuccess(reply, {
        assigned_count: assignedCount,
        skipped_count: skippedCount,
        period: `${currentMonth}/${currentYear}`,
      }, 201);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.issues);
      }
      if (isAppError(error)) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.put('/assignments/:id', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = z.object({
        officer_id: z.string().uuid().optional(),
        backup_officer_id: z.string().uuid().optional(),
        status: z.enum(['ACTIVE', 'COMPLETED', 'REASSIGNED']).optional(),
        notes: z.string().optional(),
      }).parse(request.body);

      const user = request.currentUser!;
      const existing = await db.query.assignments.findFirst({
        where: eq(schema.assignments.id, id),
        with: { can: { columns: { branchId: true } } },
      });
      if (!existing) return sendError(reply, 404, 'NOT_FOUND', 'Penugasan tidak ditemukan');
      if (user.role === 'ADMIN_RANTING' && existing.can.branchId !== user.branchId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Penugasan ini bukan milik ranting Anda');
      }

      let updateData: any = {};
      // Mengganti petugas pada baris yang sama akan menyembunyikan tugas dari mobile
      // (mobile hanya memuat status ACTIVE) sekaligus menimpa laporan petugas lama.
      // Gunakan POST /assignments/:id/transfer agar jejaknya benar.
      if (body.officer_id !== undefined && body.officer_id !== existing.officerId) {
        return sendError(
          reply,
          400,
          'USE_TRANSFER_ENDPOINT',
          'Untuk memindahkan petugas gunakan POST /admin/assignments/:id/transfer agar assignment lama ditandai REASSIGNED',
        );
      }
      if (body.backup_officer_id !== undefined) updateData.backupOfficerId = body.backup_officer_id;
      if (body.status !== undefined) updateData.status = body.status;
      if (body.notes !== undefined) updateData.notes = body.notes;

      // Kunci kaleng lalu, bila status diganti ke status berjalan (bukan
      // REASSIGNED), pastikan tidak ada baris lain pada periode yang sama
      // yang masih berjalan — PUT tidak boleh bisa menghasilkan dua
      // penugasan berjalan untuk kaleng yang sama.
      const updated = await db.transaction(async (tx) => {
        await tx
          .select({ id: schema.cans.id })
          .from(schema.cans)
          .where(eq(schema.cans.id, existing.canId))
          .for('update');

        if (body.status !== undefined && body.status !== 'REASSIGNED') {
          const others = await tx
            .select({ status: schema.assignments.status })
            .from(schema.assignments)
            .where(
              and(
                eq(schema.assignments.canId, existing.canId),
                eq(schema.assignments.periodYear, existing.periodYear),
                eq(schema.assignments.periodMonth, existing.periodMonth),
                ne(schema.assignments.id, id)
              )
            );
          if (others.some((row) => row.status !== 'REASSIGNED')) {
            throw new AppError('CONFLICT', 'Kaleng ini sudah memiliki penugasan berjalan lain pada periode yang sama', 409);
          }
        }

        return tx.update(schema.assignments).set(updateData).where(eq(schema.assignments.id, id)).returning();
      });
      // Jejak SEBELUM/SESUDAH wajib: tanpa ini 67 perubahan penugasan di
      // history tercatat null, sehingga tidak bisa direkonstruksi siapa
      // mengubah status tugas apa (laporan penelusuran 2026-10-09).
      request.auditContext = {
        oldData: {
          id: existing.id,
          kaleng: existing.canId,
          petugas: existing.officerId,
          periode: `${existing.periodYear}-${String(existing.periodMonth).padStart(2, '0')}`,
          status: existing.status,
          catatan: existing.notes ?? null,
        },
        newData: updated[0],
      };
      return sendSuccess(reply, updated[0]);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.issues);
      }
      if (isAppError(error)) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  /**
   * Transfer tugas ke petugas lain dalam satu transaksi:
   * 1. assignment lama → REASSIGNED (petugas lama TIDAK diganti, jejak laporan tetap utuh);
   * 2. assignment baru untuk petugas pengganti → ACTIVE pada periode & kaleng yang sama;
   * 3. collection lama tidak dipindahkan;
   * 4. validasi uniqueness (can, officer, periode) agar tidak ada dua assignment aktif.
   */
  fastify.post('/assignments/:id/transfer', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = z.object({
        officer_id: z.string().uuid(),
        backup_officer_id: z.string().uuid().optional().nullable(),
        notes: z.string().max(255).optional().nullable(),
      }).parse(request.body);

      const user = request.currentUser!;
      const existing = await db.query.assignments.findFirst({
        where: eq(schema.assignments.id, id),
        with: { can: { columns: { branchId: true } } },
      });
      if (!existing) return sendError(reply, 404, 'NOT_FOUND', 'Penugasan tidak ditemukan');

      if (user.role === 'ADMIN_RANTING' && existing.can.branchId !== user.branchId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Penugasan ini bukan milik ranting Anda');
      }

      if (existing.officerId === body.officer_id) {
        return sendError(reply, 400, 'SAME_OFFICER', 'Petugas pengganti sama dengan petugas saat ini');
      }
      if (existing.status !== 'ACTIVE') {
        return sendError(reply, 409, 'NOT_TRANSFERABLE', `Penugasan berstatus ${existing.status} tidak dapat dipindahkan`);
      }

      const newOfficer = await db.query.officers.findFirst({
        where: eq(schema.officers.id, body.officer_id),
        columns: { id: true, branchId: true, isActive: true },
      });
      if (!newOfficer) return sendError(reply, 404, 'OFFICER_NOT_FOUND', 'Petugas tidak ditemukan');
      if (!newOfficer.isActive) return sendError(reply, 400, 'OFFICER_INACTIVE', 'Petugas pengganti non-aktif');
      if (user.role === 'ADMIN_RANTING' && newOfficer.branchId !== user.branchId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Petugas bukan anggota ranting Anda');
      }

      const now = new Date();
      // Kunci kaleng lalu periksa ulang status & duplikat DI DALAM transaksi:
      // tanpa ini, transfer yang bersamaan dengan assign massal pada kaleng
      // yang sama bisa lolos dan menghasilkan dua penugasan berjalan.
      const result = await db.transaction(async (tx) => {
        await tx
          .select({ id: schema.cans.id })
          .from(schema.cans)
          .where(eq(schema.cans.id, existing.canId))
          .for('update');

        const [current] = await tx
          .select({ status: schema.assignments.status })
          .from(schema.assignments)
          .where(eq(schema.assignments.id, id));
        if (!current || current.status !== 'ACTIVE') {
          throw new AppError('NOT_TRANSFERABLE', `Penugasan berstatus ${current?.status ?? 'tidak diketahui'} tidak dapat dipindahkan`, 409);
        }

        const duplicate = await tx.query.assignments.findFirst({
          where: and(
            eq(schema.assignments.canId, existing.canId),
            eq(schema.assignments.officerId, body.officer_id),
            eq(schema.assignments.periodYear, existing.periodYear),
            eq(schema.assignments.periodMonth, existing.periodMonth),
          ),
          columns: { id: true },
        });
        if (duplicate) {
          throw new AppError('DUPLICATE_ASSIGNMENT', 'Kaleng ini sudah ditugaskan ke petugas tersebut pada periode yang sama', 409);
        }

        const [oldRow] = await tx.update(schema.assignments)
          .set({ status: 'REASSIGNED', notes: body.notes ?? existing.notes, updatedAt: now })
          .where(eq(schema.assignments.id, id))
          .returning();

        const [newRow] = await tx.insert(schema.assignments).values({
          canId: existing.canId,
          officerId: body.officer_id,
          backupOfficerId: body.backup_officer_id ?? null,
          periodYear: existing.periodYear,
          periodMonth: existing.periodMonth,
          status: 'ACTIVE',
          assignedAt: now,
          notes: body.notes ?? null,
        }).returning();

        return { oldRow, newRow };
      });

      request.auditContext = { oldData: result.oldRow, newData: result.newRow };
      return sendSuccess(reply, {
        reassigned_id: result.oldRow.id,
        new_assignment_id: result.newRow.id,
        from_officer_id: existing.officerId,
        to_officer_id: body.officer_id,
        period: `${existing.periodYear}-${String(existing.periodMonth).padStart(2, '0')}`,
      }, 201);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.issues);
      }
      if (isAppError(error)) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.delete('/assignments/:id', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const user = request.currentUser!;
      const existing = await db.query.assignments.findFirst({
        where: eq(schema.assignments.id, id),
        with: { can: { columns: { branchId: true } } },
      });
      
      if (!existing) return sendError(reply, 404, 'NOT_FOUND', 'Penugasan tidak ditemukan');
      if (user.role === 'ADMIN_RANTING' && existing.can.branchId !== user.branchId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Penugasan ini bukan milik ranting Anda');
      }

      // Jejak SEBELUM dihapus wajib: barisnya hilang dari database begitu
      // perintah ini jalan, jadi tanpa mencatat dulu tidak ada cara memastikan
      // PENUGASAN apa yang terhapus (laporan penelusuran 2026-10-09 — 182
      // penghapusan penugasan tercatat null, tak bisa direkonstruksi).
      request.auditContext = {
        oldData: {
          id: existing.id,
          kaleng: existing.canId,
          petugas: existing.officerId,
          periode: `${existing.periodYear}-${String(existing.periodMonth).padStart(2, '0')}`,
          status: existing.status,
        },
      };

      await db.delete(schema.assignments).where(eq(schema.assignments.id, id));
      return sendSuccess(reply, { message: 'Penugasan berhasil dihapus' });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
