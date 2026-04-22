import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, desc, asc, gte } from 'drizzle-orm';
import { verifyQRCode } from '../../utils/qr';
import { sendInternalError } from '../../utils/response';

export async function tasksRoutes(fastify: FastifyInstance) {
  // GET /mobile/dashboard
  fastify.get('/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Bukan akun petugas' },
        });
      }

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());

      const [todayCollections, weekCollections, pendingAssignments, recentCollections] = await Promise.all([
        db.query.collections.findMany({
          where: and(eq(schema.collections.officerId, officerId), gte(schema.collections.collectedAt, today), eq(schema.collections.syncStatus, 'COMPLETED')),
        }),
        db.query.collections.findMany({
          where: and(eq(schema.collections.officerId, officerId), gte(schema.collections.collectedAt, weekStart), eq(schema.collections.syncStatus, 'COMPLETED')),
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
          where: and(eq(schema.collections.officerId, officerId), eq(schema.collections.syncStatus, 'COMPLETED')),
          with: { can: { columns: { qrCode: true, ownerName: true } } },
          orderBy: [desc(schema.collections.collectedAt)],
          limit: 5,
        }),
      ]);

      return reply.send({
        success: true,
        data: {
          today_stats: {
            collected: todayCollections.length,
            total_amount: todayCollections.reduce((sum, c) => sum + Number(c.nominal), 0),
            remaining: pendingAssignments.length,
          },
          week_stats: {
            collected: weekCollections.length,
            total_amount: weekCollections.reduce((sum, c) => sum + Number(c.nominal), 0),
          },
          pending_tasks: pendingAssignments.map((a) => ({
            id: a.id,
            qr_code: a.can.qrCode,
            owner_name: a.can.ownerName,
            address: a.can.ownerAddress,
            latitude: a.can.latitude,
            longitude: a.can.longitude,
            assigned_at: a.assignedAt,
          })),
          recent_collections: recentCollections.map((c) => ({
            id: c.id,
            qr_code: c.can.qrCode,
            owner_name: c.can.ownerName,
            nominal: Number(c.nominal),
            collected_at: c.collectedAt,
          })),
        },
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
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Bukan akun petugas' },
        });
      }

      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '20');
      const status = query.status || 'ACTIVE';
      const skip = (page - 1) * limit;

      const conditions: any[] = [eq(schema.assignments.officerId, officerId!)];
      if (status !== 'ALL') {
        conditions.push(eq(schema.assignments.status, status as any));
      }
      const whereClause = and(...conditions);

      const [assignments, total] = await Promise.all([
        db.query.assignments.findMany({
          where: whereClause,
          with: {
            can: {
              columns: { id: true, qrCode: true, ownerName: true, ownerPhone: true, ownerAddress: true, latitude: true, longitude: true },
            },
          },
          orderBy: [asc(schema.assignments.assignedAt)],
          offset: skip,
          limit,
        }),
        db.$count(schema.assignments, whereClause),
      ]);

      return reply.send({
        success: true,
        data: {
          tasks: assignments.map((a) => ({
            id: a.id,
            qr_code: a.can.qrCode,
            owner_name: a.can.ownerName,
            owner_phone: a.can.ownerPhone,
            owner_address: a.can.ownerAddress,
            latitude: a.can.latitude,
            longitude: a.can.longitude,
            status: a.status,
            assigned_at: a.assignedAt,
            period: `${a.periodYear}-${String(a.periodMonth).padStart(2, '0')}`,
          })),
          pagination: {
            page,
            limit,
            total,
            total_pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // GET /mobile/scan/:qrCode
  fastify.get('/scan/:qrCode', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { qrCode: qrToken } = request.params as { qrCode: string };
      const user = request.currentUser!;
      const officerId = user.officerId;

      const qrCode = verifyQRCode(qrToken);
      if (!qrCode) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_QR', message: 'QR Code tidak valid atau tanda tangan digital salah' },
        });
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
        return reply.status(404).send({
          success: false,
          error: { code: 'CAN_NOT_FOUND', message: 'Kaleng tidak ditemukan' },
        });
      }

      const lastCollection = can.collections[0];
      const activeAssignment = can.assignments[0];

      return reply.send({
        success: true,
        data: {
          id: can.id,
          qr_code: can.qrCode,
          owner_name: can.ownerName,
          owner_phone: can.ownerPhone,
          owner_address: can.ownerAddress,
          latitude: can.latitude,
          longitude: can.longitude,
          last_collection: lastCollection
            ? { nominal: Number(lastCollection.nominal), date: lastCollection.collectedAt }
            : null,
          status: activeAssignment?.status || 'UNASSIGNED',
          assignment_id: activeAssignment?.id,
        },
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
