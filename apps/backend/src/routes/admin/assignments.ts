import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
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
      const query = request.query as { year?: string; month?: string; officer_id?: string; page?: string; limit?: string };
      const { page, limit, offset } = getPaginationParams(query);
      const user = request.currentUser!;

      const roleScope = await getRoleScope(user, schema.cans);
      
      let canBranchCondition;
      if (user.role === 'ADMIN_RANTING' && user.branchId) {
        const branchCans = await db.select({ id: schema.cans.id })
          .from(schema.cans)
          .where(eq(schema.cans.branchId, user.branchId));
        const canIds = branchCans.map(c => c.id);
        if (canIds.length === 0) {
          return sendSuccess(reply, formatPaginatedResponse([], 0, page, limit));
        }
        canBranchCondition = inArray(schema.assignments.canId, canIds);
      } else if (user.role === 'ADMIN_KECAMATAN' && user.districtId) {
        const districtBranches = await db.select({ id: schema.branches.id })
          .from(schema.branches)
          .where(eq(schema.branches.districtId, user.districtId));
        const branchIds = districtBranches.map(b => b.id);
        if (branchIds.length === 0) {
          return sendSuccess(reply, formatPaginatedResponse([], 0, page, limit));
        }
        const districtCans = await db.select({ id: schema.cans.id })
          .from(schema.cans)
          .where(inArray(schema.cans.branchId, branchIds));
        const canIds = districtCans.map(c => c.id);
        if (canIds.length === 0) {
          return sendSuccess(reply, formatPaginatedResponse([], 0, page, limit));
        }
        canBranchCondition = inArray(schema.assignments.canId, canIds);
      }

      const conditions: any[] = [];
      if (canBranchCondition) conditions.push(canBranchCondition);
      if (query.year) conditions.push(eq(schema.assignments.periodYear, parseInt(query.year)));
      if (query.month) conditions.push(eq(schema.assignments.periodMonth, parseInt(query.month)));
      if (query.officer_id) conditions.push(eq(schema.assignments.officerId, query.officer_id));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [assignments, total] = await Promise.all([
        db.query.assignments.findMany({
          where: whereClause,
          with: {
            can: { columns: { qrCode: true, ownerName: true } },
            officer: { columns: { fullName: true, employeeCode: true } },
          },
          orderBy: [desc(schema.assignments.assignedAt)],
          limit,
          offset,
        }),
        db.$count(schema.assignments, whereClause),
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
}
