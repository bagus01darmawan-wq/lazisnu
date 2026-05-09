import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, desc, ilike, or, and, sql } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { UserRole } from '@lazisnu/shared-types';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { getWhatsAppQueue } from '../../services/whatsapp';
import { getPaginationParams, formatPaginatedResponse } from '../../utils/pagination';

export async function waRoutes(fastify: FastifyInstance) {
  const adminOnly = authorize('ADMIN_KECAMATAN', 'ADMIN_RANTING', 'BENDAHARA');

  // GET /admin/wa/logs - Real Notification Logs from DB
  fastify.get('/wa/logs', { preHandler: [adminOnly] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      const { page, limit, offset } = getPaginationParams(query);

      const conditions: any[] = [];
      if (query.search) {
        conditions.push(or(
          ilike(schema.notifications.recipientName, `%${query.search}%`),
          ilike(schema.notifications.recipientPhone, `%${query.search}%`),
          ilike(schema.notifications.messageContent, `%${query.search}%`)
        ));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [logs, total] = await Promise.all([
        db.query.notifications.findMany({
          where: whereClause,
          limit,
          offset,
          orderBy: [desc(schema.notifications.createdAt)],
        }),
        db.select({ count: sql<number>`count(*)` })
          .from(schema.notifications)
          .where(whereClause)
          .then(res => Number(res[0].count))
      ]);

      // Get real BullMQ stats for the dashboard header
      const queue = getWhatsAppQueue();
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      const stats = {
        sent: completed,
        pending: waiting + active + delayed,
        failed: failed
      };

      return sendSuccess(reply, {
        ...formatPaginatedResponse(logs, total, page, limit),
        stats
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // GET /admin/wa/failed
  fastify.get('/wa/failed', { preHandler: [authorize('ADMIN_KECAMATAN')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const queue = getWhatsAppQueue();
      const failedJobs = await queue.getFailed();
      
      const formattedJobs = failedJobs.map(job => ({
        id: job.id,
        name: job.name,
        data: job.data,
        failedReason: job.failedReason,
        timestamp: job.timestamp,
        finishedOn: job.finishedOn,
        attemptsMade: job.attemptsMade,
      }));

      return sendSuccess(reply, {
        total: formattedJobs.length,
        jobs: formattedJobs,
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // POST /admin/wa/retry/:id
  fastify.post('/wa/retry/:id', { preHandler: [adminOnly] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const queue = getWhatsAppQueue();
      const job = await queue.getJob(id);

      if (!job) {
        return sendError(reply, 404, 'NOT_FOUND', 'Job tidak ditemukan');
      }

      await job.retry();

      return sendSuccess(reply, {
        message: 'Job berhasil dijadwalkan ulang',
        jobId: id,
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // POST /admin/wa/flush-failed
  fastify.post('/wa/flush-failed', { preHandler: [adminOnly] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const queue = getWhatsAppQueue();
      await queue.clean(0, 1000, 'failed'); // Clean failed jobs older than 0ms, limit 1000

      return sendSuccess(reply, {
        message: 'Antrean job gagal berhasil dibersihkan',
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
