import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, desc, ilike, or } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { getPaginationParams, formatPaginatedResponse } from '../../utils/pagination';
import { getRoleScope } from '../../utils/role-scope';
import { createOfficerSchema, updateOfficerSchema } from './schemas';
import { z } from 'zod';

const rantingOrKec = { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')] };

export async function officersRoutes(fastify: FastifyInstance) {
  fastify.get('/officers', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const query = request.query as any;
      const { page, limit, offset } = getPaginationParams(query);

      const roleScope = await getRoleScope(user, schema.officers);

      let whereClause = and(
        roleScope,
        query.branch_id ? eq(schema.officers.branchId, query.branch_id) : undefined
      );

      if (query.search) {
        whereClause = and(whereClause, or(
          ilike(schema.officers.fullName, `%${query.search}%`),
          ilike(schema.officers.employeeCode, `%${query.search}%`)
        ));
      }

      const [officers, total] = await Promise.all([
        db.query.officers.findMany({
          where: whereClause, offset, limit, orderBy: [desc(schema.officers.createdAt)],
          columns: { id: true, employeeCode: true, fullName: true, phone: true, photoUrl: true, assignedZone: true, isActive: true, branchId: true },
        }),
        db.$count(schema.officers, whereClause),
      ]);

      return sendSuccess(reply, formatPaginatedResponse(officers, total, page, limit));
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/officers', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const body = createOfficerSchema.extend({ branch_id: z.string().uuid().optional() }).parse(request.body);
      
      const targetBranchId = (user.role === 'ADMIN_KECAMATAN' ? body.branch_id : user.branchId);
      if (!targetBranchId) return sendError(reply, 400, 'MISSING_BRANCH', 'Ranting wajib diisi');

      const branchRes = await db.query.branches.findFirst({ where: eq(schema.branches.id, targetBranchId) });
      if (!branchRes) return sendError(reply, 404, 'NOT_FOUND', 'Ranting tidak ditemukan');

      const count = await db.$count(schema.officers, eq(schema.officers.branchId, targetBranchId));
      const employeeCode = `${branchRes.code || 'XX'}-${String(count + 1).padStart(4, '0')}`;

      const insertedUser = await db.insert(schema.users).values({
        email: `${body.phone}@petugas.lazisnu.id`,
        passwordHash: '',
        fullName: body.full_name,
        phone: body.phone,
        role: 'PETUGAS',
        branchId: targetBranchId,
        districtId: user.districtId,
      }).returning();
      const userRecord = insertedUser[0];

      const insertedOfficer = await db.insert(schema.officers).values({
        userId: userRecord.id,
        employeeCode,
        fullName: body.full_name,
        phone: body.phone,
        photoUrl: body.photo_url,
        districtId: user.districtId!,
        branchId: targetBranchId,
        assignedZone: body.assigned_zone,
      }).returning();
      
      return sendSuccess(reply, insertedOfficer[0], 201);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.put('/officers/:id', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const user = request.currentUser!;
      const body = updateOfficerSchema.parse(request.body);
      const existing = await db.query.officers.findFirst({ where: eq(schema.officers.id, id) });
      
      if (!existing) return sendError(reply, 404, 'NOT_FOUND', 'Petugas tidak ditemukan');

      if (user.role === 'ADMIN_RANTING' && existing.branchId !== user.branchId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak');
      }
      if (user.role === 'ADMIN_KECAMATAN' && existing.districtId !== user.districtId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak');
      }
      const updated = await db.update(schema.officers).set({ fullName: body.full_name, phone: body.phone, photoUrl: body.photo_url, assignedZone: body.assigned_zone, isActive: body.is_active })
        .where(eq(schema.officers.id, id)).returning();
      
      return sendSuccess(reply, updated[0]);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.delete('/officers/:id', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const user = request.currentUser!;
      const existing = await db.query.officers.findFirst({ where: eq(schema.officers.id, id) });

      if (!existing) return sendError(reply, 404, 'NOT_FOUND', 'Petugas tidak ditemukan');

      if (user.role === 'ADMIN_RANTING' && existing.branchId !== user.branchId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak');
      }
      if (user.role === 'ADMIN_KECAMATAN' && existing.districtId !== user.districtId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak');
      }

      await db.update(schema.officers).set({ isActive: false }).where(eq(schema.officers.id, id));
      return reply.status(204).send();
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
