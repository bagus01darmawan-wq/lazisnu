import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, desc, asc, gte, lte, or, sql } from 'drizzle-orm';
import { isValidQRCode } from '../../utils/qr';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { getLatestCollectionCondition } from '../../services/collectionSubmission';
import { skipAssignmentSchema } from './schemas';
import { AppError, isAppError } from '../../utils/AppError';
import { parseStatsRange, computeMonthsCovered } from '../../utils/statsRange';

export async function tasksRoutes(fastify: FastifyInstance) {
  // GET /mobile/dashboard
  fastify.get('/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');
      }

      const latestCollectionCondition = getLatestCollectionCondition();

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodYear = now.getFullYear();
      const periodMonth = now.getMonth() + 1;

      const [todayStats, weekStats, monthStats, pendingAssignments, latestRecent, remainingCount] = await Promise.all([
        db.select({
          collected: sql<number>`count(*)::int`,
          total_nominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
        }).from(schema.collections)
          .where(and(
            eq(schema.collections.officerId, officerId),
            gte(schema.collections.collectedAt, today),
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          )).then(r => r[0]),
        db.select({
          collected: sql<number>`count(*)::int`,
          total_nominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
        }).from(schema.collections)
          .where(and(
            eq(schema.collections.officerId, officerId),
            gte(schema.collections.collectedAt, weekStart),
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          )).then(r => r[0]),
        // Statistik bulan berjalan: penjemputan + progres tugas periode berjalan
        Promise.all([
          db.select({
            collected: sql<number>`count(*)::int`,
            total_nominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
          }).from(schema.collections)
            .where(and(
              eq(schema.collections.officerId, officerId),
              gte(schema.collections.collectedAt, monthStart),
              eq(schema.collections.syncStatus, 'COMPLETED'),
              latestCollectionCondition
            )).then(r => r[0]),
          db.select({
            status: schema.assignments.status,
            count: sql<number>`count(*)::int`,
          }).from(schema.assignments)
            .where(and(
              eq(schema.assignments.officerId, officerId),
              eq(schema.assignments.periodYear, periodYear),
              eq(schema.assignments.periodMonth, periodMonth)
            ))
            .groupBy(schema.assignments.status),
        ]).then(([colRes, taskRows]) => {
          const completed = taskRows.find((r) => r.status === 'COMPLETED')?.count ?? 0;
          const active = taskRows.find((r) => r.status === 'ACTIVE')?.count ?? 0;
          return {
            collected: colRes.collected,
            total_nominal: colRes.total_nominal,
            task_total: completed + active,
            task_completed: completed,
          };
        }),
        db.query.assignments.findMany({
          where: and(eq(schema.assignments.officerId, officerId), eq(schema.assignments.status, 'ACTIVE')),
          with: {
            can: {
              columns: { id: true, qrCode: true, ownerName: true, ownerAddress: true, latitude: true, longitude: true },
            },
          },
          limit: 10,
          orderBy: [asc(schema.assignments.assignedAt)],
        }),
        db.query.collections.findMany({
          where: and(
            eq(schema.collections.officerId, officerId),
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          ),
          with: { can: { columns: { qrCode: true, ownerName: true } } },
          orderBy: [desc(schema.collections.collectedAt)],
          limit: 5,
        }),
        // Hitung jumlah AKTUAL tugas yang belum selesai (tidak dibatasi limit)
        db.$count(
          schema.assignments,
          and(eq(schema.assignments.officerId, officerId), eq(schema.assignments.status, 'ACTIVE'))
        ),
      ]);

      return sendSuccess(reply, {
        today_stats: {
          collected: todayStats.collected,
          total_nominal: Number(todayStats.total_nominal),
          remaining: remainingCount, // Jumlah aktual dari DB, bukan panjang array yang dibatasi limit 10
        },
        week_stats: {
          collected: weekStats.collected,
          total_nominal: Number(weekStats.total_nominal),
        },
        month_stats: {
          collected: monthStats.collected,
          total_nominal: Number(monthStats.total_nominal),
          task_total: monthStats.task_total,
          task_completed: monthStats.task_completed,
        },
        pending_tasks: pendingAssignments.map((a) => ({
          id: a.id,
          can_id: a.can.id,
          qr_code: a.can.qrCode,
          owner_name: a.can.ownerName,
          address: a.can.ownerAddress,
          latitude: a.can.latitude,
          longitude: a.can.longitude,
          assigned_at: a.assignedAt,
        })),
        recent_collections: latestRecent.map((c) => ({
          id: c.id,
          qr_code: c.can.qrCode,
          owner_name: c.can.ownerName,
          nominal: Number(c.nominal),
          collected_at: c.collectedAt,
        })),
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // GET /mobile/tasks
  fastify.get('/tasks', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const officerId = user.officerId;
      const query = request.query as { status?: string; page?: string; limit?: string };

      if (!officerId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');
      }

      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '20');
      const status = query.status || 'ACTIVE';
      const skip = (page - 1) * limit;
      const currentPeriod = new Date();
      const currentYear = currentPeriod.getFullYear();
      const currentMonth = currentPeriod.getMonth() + 1;

      const conditions: any[] = [
        eq(schema.assignments.officerId, officerId!),
        eq(schema.assignments.status, status as any),
      ];
      const whereClause = and(...conditions);

      const [assignments, total] = await Promise.all([
        db.query.assignments.findMany({
          where: whereClause,
          with: {
            can: {
              columns: { id: true, qrCode: true, ownerName: true, ownerPhone: true, ownerAddress: true, latitude: true, longitude: true },
            },
          },
          orderBy: [
            status === 'COMPLETED'
              ? desc(schema.assignments.completedAt)
              : asc(schema.assignments.assignedAt),
          ],
          offset: skip,
          limit,
        }),
        db.$count(schema.assignments, whereClause),
      ]);

      let totalNominal = 0;
      if (status === 'COMPLETED') {
        const nominalResult = await db.select({
          total_nominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`
        })
        .from(schema.collections)
        .innerJoin(schema.assignments, eq(schema.collections.assignmentId, schema.assignments.id))
        .where(and(
          eq(schema.collections.officerId, officerId),
          eq(schema.collections.syncStatus, 'COMPLETED'),
          eq(schema.assignments.periodYear, currentYear),
          eq(schema.assignments.periodMonth, currentMonth),
          getLatestCollectionCondition()
        ));

        totalNominal = Number(nominalResult[0]?.total_nominal || 0);
      }

      const items = assignments.map((a) => ({
        id: a.id,
        can_id: a.can.id,
        qr_code: a.can.qrCode,
        owner_name: a.can.ownerName,
        owner_phone: a.can.ownerPhone,
        owner_address: a.can.ownerAddress,
        latitude: a.can.latitude,
        longitude: a.can.longitude,
        status: a.status,
        assigned_at: a.assignedAt,
        period: `${a.periodYear}-${String(a.periodMonth).padStart(2, '0')}`,
      }));

      return sendSuccess(reply, {
        items,
        tasks: items,
        total_nominal: totalNominal,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // GET /mobile/tasks/stats-range?start=YYYY-MM-DD&end=YYYY-MM-DD
  // Akumulasi penjemputan dalam rentang tanggal + progres tugas dari semua
  // periode (bulan) yang tersentuh rentang.
  fastify.get('/tasks/stats-range', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');
      }

      const query = request.query as { start?: string; end?: string };
      const parsed = parseStatsRange(query.start, query.end);
      if (!parsed.ok) {
        return sendError(reply, 400, 'BAD_REQUEST', parsed.error!);
      }
      const startDate = parsed.startDate!;
      const endDate = parsed.endDate!;

      // Daftar periode (YYYY-MM) yang tersentuh rentang — dipakai untuk filter
      // tugas dan dilaporkan kembali sebagai months_covered.
      const monthsCovered = computeMonthsCovered(startDate, endDate);
      const periodConditions = monthsCovered.map((period) => {
        const [y, m] = period.split('-').map(Number);
        return and(eq(schema.assignments.periodYear, y), eq(schema.assignments.periodMonth, m));
      });

      const latestCollectionCondition = getLatestCollectionCondition();

      const [colRes, taskRows] = await Promise.all([
        db.select({
          collected: sql<number>`count(*)::int`,
          total_nominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
        }).from(schema.collections)
          .where(and(
            eq(schema.collections.officerId, officerId),
            gte(schema.collections.collectedAt, startDate),
            lte(schema.collections.collectedAt, endDate),
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          )).then(r => r[0]),
        db.select({
          status: schema.assignments.status,
          count: sql<number>`count(*)::int`,
        }).from(schema.assignments)
          .where(and(
            eq(schema.assignments.officerId, officerId),
            or(...periodConditions)
          ))
          .groupBy(schema.assignments.status),
      ]);

      const completedCount = taskRows.find((r) => r.status === 'COMPLETED')?.count ?? 0;
      const activeCount = taskRows.find((r) => r.status === 'ACTIVE')?.count ?? 0;

      return sendSuccess(reply, {
        collected: colRes.collected,
        total_nominal: Number(colRes.total_nominal),
        task_active: activeCount,
        task_completed: completedCount,
        task_total: activeCount + completedCount,
        months_covered: monthsCovered,
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // GET /mobile/scan/:qrCode
  fastify.get('/scan/:qrCode', {
    config: {
      rateLimit: { max: 30, timeWindow: '1 minute' },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { qrCode } = request.params as { qrCode: string };
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');
      }

      if (!isValidQRCode(qrCode)) {
        return sendError(reply, 400, 'QR_INVALID', 'Format kode QR tidak valid');
      }

      const can = await db.query.cans.findFirst({
        where: eq(schema.cans.qrCode, qrCode),
        with: {
          collections: { orderBy: [desc(schema.collections.collectedAt)], limit: 1 },
          assignments: {
            where: and(
              eq(schema.assignments.officerId, officerId!),
              eq(schema.assignments.status, 'ACTIVE'),
              eq(schema.assignments.periodYear, new Date().getFullYear()),
              eq(schema.assignments.periodMonth, new Date().getMonth() + 1)
            ),
          },
        },
      });

      if (!can) {
        return sendError(reply, 404, 'CAN_NOT_FOUND', 'Kaleng tidak ditemukan');
      }

      if (!can.isActive) {
        return sendError(reply, 400, 'QR_INVALID', 'Kaleng tidak aktif');
      }

      const lastCollection = can.collections[0];
      const activeAssignment = can.assignments[0];

      if (!activeAssignment) {
        return sendError(reply, 403, 'QR_NOT_ASSIGNED', 'Kaleng ini bukan tugas Anda pada periode berjalan');
      }

      return sendSuccess(reply, {
        id: activeAssignment.id,
        can_id: can.id,
        qr_code: can.qrCode,
        owner_name: can.ownerName,
        owner_phone: can.ownerPhone,
        owner_address: can.ownerAddress,
        latitude: can.latitude ? Number(can.latitude) : undefined,
        longitude: can.longitude ? Number(can.longitude) : undefined,
        last_collection: lastCollection
          ? { nominal: Number(lastCollection.nominal), date: lastCollection.collectedAt }
          : null,
        status: activeAssignment.status,
        assigned_at: activeAssignment.assignedAt,
        period: `${activeAssignment.periodYear}-${String(activeAssignment.periodMonth).padStart(2, '0')}`,
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // POST /mobile/assignments/:id/skip
  fastify.post('/assignments/:id/skip', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = skipAssignmentSchema.parse(request.body || {});
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');
      }

      const assignment = await db.query.assignments.findFirst({
        where: and(
          eq(schema.assignments.id, id),
          eq(schema.assignments.officerId, officerId),
          eq(schema.assignments.status, 'ACTIVE')
        ),
      });

      if (!assignment) {
        return sendError(reply, 403, 'ASSIGNMENT_INVALID', 'Assignment tidak valid, bukan milik Anda, atau sudah selesai');
      }

      await db.update(schema.assignments)
        .set({
          status: 'UNCOLLECTED',
          notes: body.notes || null,
          updatedAt: new Date(),
          completedAt: new Date(),
        })
        .where(eq(schema.assignments.id, id));

      return sendSuccess(reply, {
        id,
        status: 'UNCOLLECTED',
        message: 'Kaleng ditandai tidak dijemput',
      });
    } catch (error) {
      if (error instanceof AppError || isAppError(error)) {
        return sendError(reply, (error as AppError).statusCode, (error as AppError).code, (error as AppError).message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // POST /mobile/periods/complete
  fastify.post('/periods/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');
      }

      const now = new Date();
      const periodYear = now.getFullYear();
      const periodMonth = now.getMonth() + 1;

      const activeCount = await db.$count(
        schema.assignments,
        and(
          eq(schema.assignments.officerId, officerId),
          eq(schema.assignments.periodYear, periodYear),
          eq(schema.assignments.periodMonth, periodMonth),
          eq(schema.assignments.status, 'ACTIVE')
        )
      );

      if (activeCount === 0) {
        return sendSuccess(reply, {
          period: `${periodYear}-${String(periodMonth).padStart(2, '0')}`,
          skipped_count: 0,
          message: 'Tidak ada kaleng yang perlu ditandai',
        });
      }

      await db.update(schema.assignments)
        .set({
          status: 'UNCOLLECTED',
          updatedAt: new Date(),
          completedAt: new Date(),
        })
        .where(and(
          eq(schema.assignments.officerId, officerId),
          eq(schema.assignments.periodYear, periodYear),
          eq(schema.assignments.periodMonth, periodMonth),
          eq(schema.assignments.status, 'ACTIVE')
        ));

      return sendSuccess(reply, {
        period: `${periodYear}-${String(periodMonth).padStart(2, '0')}`,
        skipped_count: activeCount,
        message: `${activeCount} kaleng ditandai tidak dijemput untuk periode berjalan`,
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
