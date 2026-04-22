import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, asc, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { batchCollectionSchema } from './schemas';

export async function syncRoutes(fastify: FastifyInstance) {
  // POST /mobile/collections/batch (offline sync)
  fastify.post('/collections/batch', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = batchCollectionSchema.parse(request.body);
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');

      const results: any[] = [];
      let succeeded = 0;
      let failed = 0;

      for (const item of body.collections) {
        try {
          const existing = await db.query.collections.findFirst({
            where: eq(schema.collections.offlineId, item.offline_id),
          });

          if (existing) {
            results.push({ offline_id: item.offline_id, server_id: existing.id, status: 'ALREADY_SYNCED' });
            succeeded++;
            continue;
          }

          const insertedColls = await db.insert(schema.collections).values({
            assignmentId: item.assignment_id,
            canId: item.can_id,
            officerId,
            nominal: BigInt(item.nominal),
            paymentMethod: item.payment_method,
            collectedAt: new Date(item.collected_at),
            submittedAt: new Date(),
            syncedAt: new Date(),
            syncStatus: 'COMPLETED',
            serverTimestamp: new Date(),
            latitude: item.latitude?.toString(),
            longitude: item.longitude?.toString(),
            offlineId: item.offline_id,
          }).returning();
          const collection = insertedColls[0];

          await db.update(schema.assignments).set({ status: 'COMPLETED', completedAt: new Date() }).where(eq(schema.assignments.id, item.assignment_id)).catch(() => { });

          await db.update(schema.cans).set({
            lastCollectedAt: new Date(item.collected_at),
            totalCollected: sql`${schema.cans.totalCollected} + ${BigInt(item.nominal)}`,
            collectionCount: sql`${schema.cans.collectionCount} + 1`
          }).where(eq(schema.cans.id, item.can_id));

          results.push({ offline_id: item.offline_id, server_id: collection.id, status: 'COMPLETED' });
          succeeded++;
        } catch (err) {
          results.push({ offline_id: item.offline_id, status: 'FAILED', error: (err as Error).message });
          failed++;
        }
      }

      return sendSuccess(reply, { total: body.collections.length, succeeded, failed, results });
    } catch (error: any) {
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
