import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, desc, ilike, or, and, sql, inArray, gte, lt } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { UserRole } from '@lazisnu/shared-types';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { getWhatsAppQueue } from '../../services/whatsapp';
import { getPaginationParams, formatPaginatedResponse } from '../../utils/pagination';

export async function getSafeWhatsAppQueueStats(request: FastifyRequest) {
  try {
    const queue = getWhatsAppQueue();
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      sent: completed,
      pending: waiting + active + delayed,
      failed
    };
  } catch (error) {
    request.log.warn({ err: error }, 'Failed to fetch WhatsApp queue stats');
    return {
      sent: 0,
      pending: 0,
      failed: 0
    };
  }
}

export async function waRoutes(fastify: FastifyInstance) {
  const adminOnly = authorize('ADMIN_KECAMATAN', 'ADMIN_RANTING', 'BENDAHARA');

  // GET /admin/wa/logs - Real Notification Logs from DB
  fastify.get('/wa/logs', { preHandler: [adminOnly] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
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

      // Scope ADMIN_RANTING: only notifications for cans in their branch
      if (user.role === 'ADMIN_RANTING' && user.branchId) {
        const rantingCanIdsSubquery = db
          .select({ canId: schema.cans.id })
          .from(schema.cans)
          .where(eq(schema.cans.branchId, user.branchId));

        const rantingCollectionIdsSubquery = db
          .select({ colId: schema.collections.id })
          .from(schema.collections)
          .where(inArray(schema.collections.canId, rantingCanIdsSubquery));

        conditions.push(inArray(schema.notifications.collectionId, rantingCollectionIdsSubquery));
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

      // Get safe BullMQ stats for the dashboard header
      const stats = await getSafeWhatsAppQueueStats(request);

      return sendSuccess(reply, {
        ...formatPaginatedResponse(logs, total, page, limit, 'logs'),
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

      request.auditContext = {
        oldData: { jobId: id, state: 'failed' },
        newData: { jobId: id, state: 'retried' },
      };

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

      request.auditContext = {
        oldData: null,
        newData: { action: 'flush_failed' },
      };

      return sendSuccess(reply, {
        message: 'Antrean job gagal berhasil dibersihkan',
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // GET /admin/wa/summary - Historical WA stats from DB
  fastify.get('/wa/summary', { preHandler: [adminOnly] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const query = request.query as { period?: string; year?: string; month?: string; branch_id?: string };
      const now = new Date();

      // Build scope conditions based on role
      const scopeConditions: any[] = [];
      if (user.role === 'ADMIN_RANTING' && user.branchId) {
        const rantingCanIdsSubquery = db
          .select({ canId: schema.cans.id })
          .from(schema.cans)
          .where(eq(schema.cans.branchId, user.branchId));

        const rantingCollectionIdsSubquery = db
          .select({ colId: schema.collections.id })
          .from(schema.collections)
          .where(inArray(schema.collections.canId, rantingCanIdsSubquery));

        scopeConditions.push(inArray(schema.notifications.collectionId, rantingCollectionIdsSubquery));
      } else if (user.role === 'ADMIN_KECAMATAN' && user.districtId && query.branch_id) {
        // Allow filtering by specific branch for kecamatan
        const branchCanIdsSubquery = db
          .select({ canId: schema.cans.id })
          .from(schema.cans)
          .where(eq(schema.cans.branchId, query.branch_id));

        const branchCollectionIdsSubquery = db
          .select({ colId: schema.collections.id })
          .from(schema.collections)
          .where(inArray(schema.collections.canId, branchCanIdsSubquery));

        scopeConditions.push(inArray(schema.notifications.collectionId, branchCollectionIdsSubquery));
      } else if (user.role === 'ADMIN_KECAMATAN' && user.districtId) {
        // All branches in district
        const districtBranchIdsSubquery = db
          .select({ id: schema.branches.id })
          .from(schema.branches)
          .where(eq(schema.branches.districtId, user.districtId));

        const districtCanIdsSubquery = db
          .select({ canId: schema.cans.id })
          .from(schema.cans)
          .where(inArray(schema.cans.branchId, districtBranchIdsSubquery));

        const districtCollectionIdsSubquery = db
          .select({ colId: schema.collections.id })
          .from(schema.collections)
          .where(inArray(schema.collections.canId, districtCanIdsSubquery));

        scopeConditions.push(inArray(schema.notifications.collectionId, districtCollectionIdsSubquery));
      }

      // Build date conditions based on period
      const dateConditions: any[] = [];
      if (query.period === 'month' && query.year && query.month) {
        const year = parseInt(query.year);
        const month = parseInt(query.month);
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 1);
        dateConditions.push(
          and(
            gte(schema.notifications.createdAt, monthStart),
            lt(schema.notifications.createdAt, monthEnd)
          )
        );
      } else if (query.period === 'week') {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 6);
        weekStart.setHours(0, 0, 0, 0);
        dateConditions.push(gte(schema.notifications.createdAt, weekStart));
      } else if (query.period === 'today') {
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        dateConditions.push(gte(schema.notifications.createdAt, todayStart));
      }

      const allConditions = [...scopeConditions, ...dateConditions];
      const whereClause = allConditions.length > 0 ? and(...allConditions) : undefined;

      // Overall counts by status
      const [sentCount, failedCount, pendingCount, totalCount] = await Promise.all([
        db.select({ count: sql<number>`count(*)` })
          .from(schema.notifications)
          .where(and(whereClause, eq(schema.notifications.status, 'SENT')))
          .then(res => Number(res[0].count)),
        db.select({ count: sql<number>`count(*)` })
          .from(schema.notifications)
          .where(and(whereClause, eq(schema.notifications.status, 'FAILED')))
          .then(res => Number(res[0].count)),
        db.select({ count: sql<number>`count(*)` })
          .from(schema.notifications)
          .where(and(whereClause, eq(schema.notifications.status, 'PENDING')))
          .then(res => Number(res[0].count)),
        db.select({ count: sql<number>`count(*)` })
          .from(schema.notifications)
          .where(whereClause)
          .then(res => Number(res[0].count)),
      ]);

      // Success rate
      const completedTotal = sentCount + failedCount;
      const successRate = completedTotal > 0 ? Math.round((sentCount / completedTotal) * 100) : 0;

      // Daily trend for last 7 days
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);

      const dailyStats = await db
        .select({
          date: sql<Date>`DATE(${schema.notifications.createdAt})`,
          sent: sql<number>`count(*) filter (where ${schema.notifications.status} = 'SENT')`,
          failed: sql<number>`count(*) filter (where ${schema.notifications.status} = 'FAILED')`,
          pending: sql<number>`count(*) filter (where ${schema.notifications.status} = 'PENDING')`,
        })
        .from(schema.notifications)
        .where(and(
          ...scopeConditions,
          gte(schema.notifications.createdAt, weekStart)
        ))
        .groupBy(sql`DATE(${schema.notifications.createdAt})`)
        .orderBy(sql`DATE(${schema.notifications.createdAt})`);

      // Fill missing days with zeros
      const daysMap = new Map<string, {
        date: string;
        sent: number;
        failed: number;
        pending: number;
      }>();
      dailyStats.forEach(d => {
        const dateStr = d.date instanceof Date ? d.date.toISOString().split('T')[0] : String(d.date);
        daysMap.set(dateStr, {
          date: dateStr,
          sent: Number(d.sent),
          failed: Number(d.failed),
          pending: Number(d.pending),
        });
      });

      const dailyTrends: Array<{
        date: string;
        day: string;
        sent: number;
        failed: number;
        pending: number;
      }> = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const dayName = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][d.getDay()];
        const existing = daysMap.get(dateStr);
        dailyTrends.push(existing ? { ...existing, day: dayName } : { date: dateStr, day: dayName, sent: 0, failed: 0, pending: 0 });
      }

      // Per ranting breakdown (only for ADMIN_KECAMATAN)
      let byBranch: Array<{
        branch_id: string;
        branch_name: string;
        sent: number;
        failed: number;
        pending: number;
        total: number;
      }> = [];
      if (user.role === 'ADMIN_KECAMATAN') {
        const branchStats = await db
          .select({
            branchId: schema.branches.id,
            branchName: schema.branches.name,
            sent: sql<number>`count(*) filter (where ${schema.notifications.status} = 'SENT')`,
            failed: sql<number>`count(*) filter (where ${schema.notifications.status} = 'FAILED')`,
            pending: sql<number>`count(*) filter (where ${schema.notifications.status} = 'PENDING')`,
          })
          .from(schema.notifications)
          .innerJoin(schema.collections, eq(schema.notifications.collectionId, schema.collections.id))
          .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
          .innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
          .where(and(
            ...scopeConditions,
            ...dateConditions
          ))
          .groupBy(schema.branches.id, schema.branches.name)
          .orderBy(schema.branches.name);

        byBranch = branchStats.map(b => ({
          branch_id: b.branchId,
          branch_name: b.branchName,
          sent: Number(b.sent),
          failed: Number(b.failed),
          pending: Number(b.pending),
          total: Number(b.sent) + Number(b.failed) + Number(b.pending),
        }));
      }

      return sendSuccess(reply, {
        summary: {
          total_sent: sentCount,
          total_failed: failedCount,
          total_pending: pendingCount,
          total: totalCount,
          success_rate: successRate,
        },
        daily_trends: dailyTrends,
        by_branch: byBranch,
        period: query.period || 'all',
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
