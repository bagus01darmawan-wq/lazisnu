import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authorize } from '../../middleware/auth';
import { UserRole } from '@lazisnu/shared-types';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { getWhatsAppQueue } from '../../services/whatsapp';

export async function waRoutes(fastify: FastifyInstance) {
  const adminOnly = authorize('ADMIN_KECAMATAN');

  // GET /admin/wa/failed
  fastify.get('/wa/failed', { preHandler: [adminOnly] }, async (request: FastifyRequest, reply: FastifyReply) => {
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
