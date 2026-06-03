import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { resubmitCollectionSchema } from './schemas';
import { resubmitCollection } from '../../services/collectionSubmission';

const canResubmit = { preHandler: [authorize('BENDAHARA', 'ADMIN_RANTING', 'ADMIN_KECAMATAN')] };

export async function collectionsRoutes(fastify: FastifyInstance) {
  fastify.post('/collections/:id/resubmit', canResubmit, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = resubmitCollectionSchema.parse(request.body);
      const user = request.currentUser!;

      const result = await db.transaction(async (tx) => {
        const { oldCollection, newCollection } = await resubmitCollection(tx, {
          collectionId: id,
          nominal: body.nominal,
          alasanResubmit: body.alasan_resubmit,
          requiredBranchId: user.role === 'ADMIN_RANTING' ? user.branchId : undefined,
        });

        await tx.insert(schema.activityLogs).values({
          userId: user.userId,
          actionType: 'RESUBMIT_COLLECTION',
          entityType: 'collections',
          entityId: newCollection.id,
          oldData: oldCollection as any,
          newData: newCollection as any,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });

        return newCollection;
      });

      return sendSuccess(reply, result);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'COLLECTION_NOT_FOUND') {
        return sendError(reply, 404, 'NOT_FOUND', 'Data tidak ditemukan');
      }
      if (error instanceof Error && error.message === 'NOT_LATEST') {
        return sendError(reply, 400, 'NOT_LATEST', 'Data sudah pernah di-resubmit (bukan record terbaru)');
      }
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return sendError(reply, 403, 'FORBIDDEN', 'Tidak memiliki akses ke data ini');
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
