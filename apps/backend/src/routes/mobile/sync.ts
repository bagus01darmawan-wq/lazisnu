import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, asc, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { batchCollectionSchema } from './schemas';
import { syncCollectionsBatch } from '../../services/mobileSyncService';

export async function syncRoutes(fastify: FastifyInstance) {
  // POST /mobile/collections/batch (offline sync)
  fastify.post('/collections/batch', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = batchCollectionSchema.parse(request.body);
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');

      const result = await syncCollectionsBatch(body.collections as any, officerId);
      return sendSuccess(reply, result);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid');
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // GET /mobile/sync/status
  fastify.get('/sync/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');

      const [pendingCount, oldestPending] = await Promise.all([
        db.$count(schema.collections, and(eq(schema.collections.officerId, officerId), inArray(schema.collections.syncStatus, ['PENDING', 'FAILED']))),
        db.query.collections.findFirst({
          where: and(eq(schema.collections.officerId, officerId), inArray(schema.collections.syncStatus, ['PENDING', 'FAILED'])),
          orderBy: [asc(schema.collections.collectedAt)],
          columns: { collectedAt: true },
        }),
      ]);

      return sendSuccess(reply, {
        pending_count: pendingCount,
        last_sync_at: new Date().toISOString(),
        oldest_pending: oldestPending?.collectedAt || null,
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
