import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { resubmitCollectionSchema } from './schemas';

const rantingOrKec = { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')] };

export async function collectionsRoutes(fastify: FastifyInstance) {
  fastify.post('/collections/:id/resubmit', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = resubmitCollectionSchema.parse(request.body);
      const user = request.currentUser!;

      const result = await db.transaction(async (tx) => {
        const old = await tx.query.collections.findFirst({
          where: eq(schema.collections.id, id),
        });

        if (!old) {
          throw new Error('COLLECTION_NOT_FOUND');
        }

        // Check if this is the latest one for the assignment
        const latest = await tx.query.collections.findFirst({
          where: eq(schema.collections.assignmentId, old.assignmentId),
          orderBy: [desc(schema.collections.submitSequence)]
        });

        if (latest?.id !== old.id) {
          throw new Error('NOT_LATEST');
        }

        if (user.role === 'ADMIN_RANTING') {
          const can = await tx.query.cans.findFirst({ where: eq(schema.cans.id, old.canId) });
          if (can?.branchId !== user.branchId) throw new Error('FORBIDDEN');
        }

        // NOTE: Table collections is STRICTLY IMMUTABLE. No UPDATE or DELETE allowed.
        // We do NOT update the old record's isLatest flag.

        const [newRecord] = await tx.insert(schema.collections).values({
          assignmentId: old.assignmentId,
          canId: old.canId,
          officerId: old.officerId,
          nominal: BigInt(body.nominal),
          paymentMethod: old.paymentMethod,
          collectedAt: old.collectedAt,
          submittedAt: new Date(),
          syncStatus: 'COMPLETED',
          isLatest: true,
          submitSequence: old.submitSequence + 1,
          alasanResubmit: body.alasan_resubmit,
          deviceInfo: old.deviceInfo,
          latitude: old.latitude,
          longitude: old.longitude,
          offlineId: old.offlineId ? `${old.offlineId}-rev-${old.submitSequence + 1}` : null,
        }).returning();

        const diff = BigInt(body.nominal) - old.nominal;
        await tx.update(schema.cans).set({
          totalCollected: sql`${schema.cans.totalCollected} + ${diff}`,
        }).where(eq(schema.cans.id, old.canId));

        await tx.insert(schema.activityLogs).values({
          userId: user.userId,
          actionType: 'RESUBMIT_COLLECTION',
          entityType: 'collections',
          entityId: newRecord.id,
          oldData: old as any,
          newData: newRecord as any,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });

        return newRecord;
      });

      return sendSuccess(reply, result);
    } catch (error: any) {
      if (error.message === 'COLLECTION_NOT_FOUND') {
        return sendError(reply, 404, 'NOT_FOUND', 'Data tidak ditemukan');
      }
      if (error.message === 'NOT_LATEST') {
        return sendError(reply, 400, 'NOT_LATEST', 'Data sudah pernah di-resubmit (bukan record terbaru)');
      }
      if (error.message === 'FORBIDDEN') {
        return sendError(reply, 403, 'FORBIDDEN', 'Tidak memiliki akses ke data ini');
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
