import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';

export async function profileRoutes(fastify: FastifyInstance) {
  // GET /mobile/profile
  fastify.get('/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');

      const c2 = alias(schema.collections, 'c2');
      const latestCollectionCondition = eq(
        schema.collections.submitSequence,
        db.select({ maxSeq: sql<number>`max(${c2.submitSequence})` })
          .from(c2)
          .where(and(
            eq(c2.assignmentId, schema.collections.assignmentId),
            eq(c2.canId, schema.collections.canId)
          ))
      );

      const [officer, totalCollections, sumResult] = await Promise.all([
        db.query.officers.findFirst({
          where: eq(schema.officers.id, officerId),
          with: {
            branch: { columns: { id: true, name: true } },
            district: { columns: { id: true, name: true } },
          },
        }),
        db.$count(schema.collections, and(eq(schema.collections.officerId, officerId), eq(schema.collections.syncStatus, 'COMPLETED'), latestCollectionCondition)),
        db.select({ total: sql<string>`sum(${schema.collections.nominal})` }).from(schema.collections)
          .where(and(eq(schema.collections.officerId, officerId), eq(schema.collections.syncStatus, 'COMPLETED'), latestCollectionCondition))
      ]);
      const totalAmount = Number(sumResult[0]?.total || 0);

      if (!officer) return sendError(reply, 404, 'NOT_FOUND', 'Data petugas tidak ditemukan');

      return sendSuccess(reply, {
        id: officer.id,
        employee_code: officer.employeeCode,
        full_name: officer.fullName,
        phone: officer.phone,
        photo_url: officer.photoUrl,
        branch: officer.branch ? { id: officer.branch.id, name: officer.branch.name } : { id: '', name: '' },
        district: officer.district ? { id: officer.district.id, name: officer.district.name } : { id: '', name: '' },
        assigned_zone: officer.assignedZone,
        stats: { total_collections: totalCollections, total_amount: totalAmount },
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
