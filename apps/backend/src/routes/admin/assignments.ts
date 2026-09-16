import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, desc, inArray, or, ilike, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { getPaginationParams, formatPaginatedResponse } from '../../utils/pagination';
import { getRoleScope } from '../../utils/role-scope';
import { createAssignmentSchema } from './schemas';
import { z } from 'zod';
import { insertAssignments } from '../../services/assignmentGenerator';
import { ASSIGNABLE_CONDITIONS } from '../../services/conditionRules';

const rantingOrKec = { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')] };

export async function assignmentsRoutes(fastify: FastifyInstance) {
  fastify.get('/assignments', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { 
        year?: string; 
        month?: string; 
        officer_id?: string; 
        branch_id?: string;
        search?: string;
        page?: string; 
        limit?: string 
      };
      const { page, limit, offset } = getPaginationParams(query);
      const user = request.currentUser!;

      const roleScope = await getRoleScope(user, schema.cans);
      
      const conditions: any[] = [];
      if (roleScope) conditions.push(roleScope);
      
      if (query.year) conditions.push(eq(schema.assignments.periodYear, parseInt(query.year)));
      if (query.month) conditions.push(eq(schema.assignments.periodMonth, parseInt(query.month)));
      if (query.officer_id) conditions.push(eq(schema.assignments.officerId, query.officer_id));
      
      // Filter by specific branch
      if (query.branch_id) {
        conditions.push(eq(schema.cans.branchId, query.branch_id));
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

      const existing = await db.query.assignments.findFirst({
        where: and(eq(schema.assignments.canId, body.can_id), eq(schema.assignments.periodYear, body.period_year), eq(schema.assignments.periodMonth, body.period_month)),
      });
      if (existing) {
        return sendError(reply, 409, 'CONFLICT', 'Kaleng sudah ditugaskan bulan ini');
      }
      const inserted = await db.insert(schema.assignments).values({
          canId: body.can_id,
          officerId: body.officer_id,
          backupOfficerId: body.backup_officer_id,
          periodYear: body.period_year,
          periodMonth: body.period_month,
      }).returning();
      
      request.auditContext = { newData: inserted[0] };
      return sendSuccess(reply, inserted[0], 201);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
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
      }).parse(request.body);

      const user = request.currentUser!;
      if (user.role === 'ADMIN_RANTING' && body.branch_id !== user.branchId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Anda hanya dapat membuat penugasan massal untuk ranting sendiri');
      }

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      const conditions: any[] = [
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

        conditions.push(inArray(schema.cans.dukuhId, body.dukuh_ids));
      }

      const assignedSubquery = db
        .select({ canId: schema.assignments.canId })
        .from(schema.assignments)
        .where(and(
          eq(schema.assignments.periodYear, currentYear),
          eq(schema.assignments.periodMonth, currentMonth)
        ));

      conditions.push(sql`${schema.cans.id} NOT IN (${assignedSubquery})`);

      const cansToAssign = await db.query.cans.findMany({
        where: and(...conditions),
        columns: { id: true },
      });

      if (cansToAssign.length === 0) {
        return sendError(reply, 400, 'ALREADY_ASSIGNED', 'Semua kaleng di wilayah/dukuh yang dipilih sudah memiliki jadwal penugasan untuk bulan ini');
      }

      const newAssignments = cansToAssign.map(can => ({
        canId: can.id,
        officerId: body.officer_id,
        periodYear: currentYear,
        periodMonth: currentMonth,
        status: 'ACTIVE' as const,
      }));

      await insertAssignments(newAssignments);

      request.auditContext = { newData: newAssignments };
      return sendSuccess(reply, { 
        assigned_count: cansToAssign.length,
        period: `${currentMonth}/${currentYear}`
      }, 201);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
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

      const updated = await db.update(schema.assignments).set(updateData).where(eq(schema.assignments.id, id)).returning();
      return sendSuccess(reply, updated[0]);
    } catch (error) {
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

      const duplicate = await db.query.assignments.findFirst({
        where: and(
          eq(schema.assignments.canId, existing.canId),
          eq(schema.assignments.officerId, body.officer_id),
          eq(schema.assignments.periodYear, existing.periodYear),
          eq(schema.assignments.periodMonth, existing.periodMonth),
        ),
        columns: { id: true },
      });
      if (duplicate) {
        return sendError(reply, 409, 'DUPLICATE_ASSIGNMENT', 'Kaleng ini sudah ditugaskan ke petugas tersebut pada periode yang sama');
      }

      const now = new Date();
      const result = await db.transaction(async (tx) => {
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
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
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

      await db.delete(schema.assignments).where(eq(schema.assignments.id, id));
      return sendSuccess(reply, { message: 'Penugasan berhasil dihapus' });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
