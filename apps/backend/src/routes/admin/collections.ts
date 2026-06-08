import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authorize } from '../../middleware/auth';
import { assertCollectionAccess } from '../../middleware/ownership';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { resubmitCollectionSchema } from './schemas';
import { correctCollection } from '../../services/collectionCorrectionService';
import { isAppError } from '../../utils/AppError';

const canResubmit = { preHandler: [authorize('BENDAHARA', 'ADMIN_RANTING', 'ADMIN_KECAMATAN')] };

export async function collectionsRoutes(fastify: FastifyInstance) {
  fastify.post('/collections/:id/resubmit', canResubmit, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = resubmitCollectionSchema.parse(request.body);
      const user = request.currentUser!;

      // Ownership check
      await assertCollectionAccess(user, id);

      const result = await correctCollection(
        {
          collectionId: id,
          nominal: body.nominal,
          alasanResubmit: body.alasan_resubmit,
          requiredBranchId: user.branchId,
        },
        {
          userId: user.userId,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] as string,
        },
      );

      return sendSuccess(reply, result.newCollection);
    } catch (error: unknown) {
      if (isAppError(error)) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
