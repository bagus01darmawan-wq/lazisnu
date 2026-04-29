import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, desc, inArray, or, ilike, sql } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { getPaginationParams, formatPaginatedResponse } from '../../utils/pagination';
import { getRoleScope } from '../../utils/role-scope';
import { createAssignmentSchema } from './schemas';
import { z } from 'zod';

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
          },
          officer: {
            fullName: schema.users.fullName,
            employeeCode: schema.officers.employeeCode,
          }
        })
        .from(schema.assignments)
        .innerJoin(schema.cans, eq(schema.assignments.canId, schema.cans.id))
        .innerJoin(schema.officers, eq(schema.assignments.officerId, schema.officers.id))
        .innerJoin(schema.users, eq(schema.officers.userId, schema.users.id))
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
      const body = createAssignmentSchema.parse(request.body);
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
      
      return sendSuccess(reply, inserted[0], 201);
    } catch (error: any) {
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

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      // 1. Get all active cans in this branch, optionally filtered by dukuhs
      const conditions = [
        eq(schema.cans.branchId, body.branch_id),
        eq(schema.cans.isActive, true)
      ];

      if (body.dukuh_ids && body.dukuh_ids.length > 0) {
        conditions.push(inArray(schema.cans.dukuhId, body.dukuh_ids));
      }

      const activeCans = await db.query.cans.findMany({
        where: and(...conditions)
      });

      if (activeCans.length === 0) {
        return sendError(reply, 404, 'NOT_FOUND', 'Tidak ada kaleng aktif yang sesuai kriteria di ranting ini');
      }

      // 2. Get already assigned can IDs for this month
      const canIds = activeCans.map(c => c.id);
      const existingAssignments = await db.query.assignments.findMany({
        where: and(
          inArray(schema.assignments.canId, canIds),
          eq(schema.assignments.periodYear, currentYear),
          eq(schema.assignments.periodMonth, currentMonth)
        )
      });

      const assignedCanIds = new Set(existingAssignments.map(a => a.canId));
      const cansToAssign = activeCans.filter(c => !assignedCanIds.has(c.id));

      if (cansToAssign.length === 0) {
        return sendError(reply, 400, 'ALREADY_ASSIGNED', 'Semua kaleng di wilayah/dukuh yang dipilih sudah memiliki jadwal penugasan untuk bulan ini');
      }

      // 3. Perform bulk insert
      const newAssignments = cansToAssign.map(can => ({
        canId: can.id,
        officerId: body.officer_id,
        periodYear: currentYear,
        periodMonth: currentMonth,
      }));

      await db.insert(schema.assignments).values(newAssignments);

      return sendSuccess(reply, { 
        assigned_count: cansToAssign.length,
        period: `${currentMonth}/${currentYear}`
      }, 201);
    } catch (error: any) {
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
        status: z.enum(['ACTIVE', 'COMPLETED', 'POSTPONED', 'REASSIGNED']).optional(),
        notes: z.string().optional(),
      }).parse(request.body);

      let updateData: any = {};
      if (body.officer_id !== undefined) updateData.officerId = body.officer_id;
      if (body.backup_officer_id !== undefined) updateData.backupOfficerId = body.backup_officer_id;
      if (body.status !== undefined) updateData.status = body.status;
      if (body.notes !== undefined) updateData.notes = body.notes;

      const updated = await db.update(schema.assignments).set(updateData).where(eq(schema.assignments.id, id)).returning();
      return sendSuccess(reply, updated[0]);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.delete('/assignments/:id', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      await db.delete(schema.assignments).where(eq(schema.assignments.id, id));
      return sendSuccess(reply, { message: 'Penugasan berhasil dihapus' });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
