// Mobile Routes - Petugas API Endpoints

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { sendWhatsAppNotification } from '../services/whatsapp';

// Request schemas
const collectionSchema = z.object({
  assignment_id: z.string().uuid(),
  can_id: z.string().uuid(),
  amount: z.number().positive(),
  payment_method: z.enum(['CASH', 'TRANSFER']),
  transfer_receipt_url: z.string().url().optional(),
  collected_at: z.string().datetime(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  device_info: z.object({
    model: z.string(),
    os_version: z.string(),
    app_version: z.string(),
  }).optional(),
  offline_id: z.string().optional(),
});

const batchCollectionSchema = z.object({
  collections: z.array(z.object({
    offline_id: z.string(),
    assignment_id: z.string().uuid(),
    can_id: z.string().uuid(),
    amount: z.number().positive(),
    payment_method: z.enum(['CASH', 'TRANSFER']),
    collected_at: z.string().datetime(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  })),
});

export async function mobileRoutes(fastify: FastifyInstance) {
  // Apply auth middleware to all routes
  fastify.addHook('preHandler', authenticate);

  // GET /mobile/dashboard
  fastify.get('/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
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

      // Get today's stats
      const todayCollections = await prisma.collections.findMany({
        where: {
          officer_id: officerId,
          collected_at: { gte: today.toISOString() },
          sync_status: 'COMPLETED',
        },
      });

      // Get week stats
      const weekCollections = await prisma.collections.findMany({
        where: {
          officer_id: officerId,
          collected_at: { gte: weekStart.toISOString() },
          sync_status: 'COMPLETED',
        },
      });

      // Get pending tasks
      const pendingAssignments = await prisma.assignments.findMany({
        where: {
          officer_id: officerId,
          status: 'ACTIVE',
        },
        include: {
          can: {
            select: {
              id: true,
              qr_code: true,
              owner_name: true,
              owner_address: true,
              latitude: true,
              longitude: true,
            },
          },
        },
        take: 10,
        orderBy: { assigned_at: 'asc' },
      });

      // Get recent collections
      const recentCollections = await prisma.collections.findMany({
        where: { officer_id: officerId, sync_status: 'COMPLETED' },
        include: {
          can: { select: { qr_code: true, owner_name: true } },
        },
        orderBy: { collected_at: 'desc' },
        take: 5,
      });

      return reply.send({
        success: true,
        data: {
          today_stats: {
            collected: todayCollections.length,
            total_amount: todayCollections.reduce((sum, c) => sum + Number(c.amount), 0),
            remaining: pendingAssignments.length,
          },
          week_stats: {
            collected: weekCollections.length,
            total_amount: weekCollections.reduce((sum, c) => sum + Number(c.amount), 0),
          },
          pending_tasks: pendingAssignments.map(a => ({
            id: a.id,
            qr_code: a.can.qr_code,
            owner_name: a.can.owner_name,
            address: a.can.owner_address,
            latitude: a.can.latitude,
            longitude: a.can.longitude,
            assigned_at: a.assigned_at,
          })),
          recent_collections: recentCollections.map(c => ({
            id: c.id,
            qr_code: c.can.qr_code,
            owner_name: c.can.owner_name,
            amount: Number(c.amount),
            collected_at: c.collected_at,
          })),
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });

  // GET /mobile/tasks
  fastify.get('/tasks', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
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

      const whereClause: any = { officer_id: officerId };
      if (status !== 'ALL') {
        whereClause.status = status;
      }

      const [assignments, total] = await Promise.all([
        prisma.assignments.findMany({
          where: whereClause,
          include: {
            can: {
              select: {
                id: true,
                qr_code: true,
                owner_name: true,
                owner_phone: true,
                owner_address: true,
                latitude: true,
                longitude: true,
              },
            },
          },
          orderBy: { assigned_at: 'asc' },
          skip,
          take: limit,
        }),
        prisma.assignments.count({ where: whereClause }),
      ]);

      return reply.send({
        success: true,
        data: {
          tasks: assignments.map(a => ({
            id: a.id,
            qr_code: a.can.qr_code,
            owner_name: a.can.owner_name,
            owner_phone: a.can.owner_phone,
            owner_address: a.can.owner_address,
            latitude: a.can.latitude,
            longitude: a.can.longitude,
            status: a.status,
            assigned_at: a.assigned_at,
            period: `${a.period_year}-${String(a.period_month).padStart(2, '0')}`,
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
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });

  // GET /mobile/scan/:qrCode
  fastify.get('/scan/:qrCode', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { qrCode } = request.params as { qrCode: string };
      const user = request.user!;
      const officerId = user.officerId;

      // Find can by QR code
      const can = await prisma.cans.findUnique({
        where: { qr_code: qrCode },
        include: {
          collections: {
            orderBy: { collected_at: 'desc' },
            take: 1,
          },
          assignments: {
            where: {
              officer_id: officerId,
              status: 'ACTIVE',
              period_year: new Date().getFullYear(),
              period_month: new Date().getMonth() + 1,
            },
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
          qr_code: can.qr_code,
          owner_name: can.owner_name,
          owner_phone: can.owner_phone,
          owner_address: can.owner_address,
          latitude: can.latitude,
          longitude: can.longitude,
          last_collection: lastCollection ? {
            amount: Number(lastCollection.amount),
            date: lastCollection.collected_at,
          } : null,
          status: activeAssignment?.status || 'UNASSIGNED',
          assignment_id: activeAssignment?.id,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });

  // POST /mobile/collections
  fastify.post('/collections', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = collectionSchema.parse(request.body);
      const user = request.user!;
      const officerId = user.officerId;

      if (!officerId) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Bukan akun petugas' },
        });
      }

      // Check if already submitted (by offline_id or can_id)
      if (body.offline_id) {
        const existing = await prisma.collections.findUnique({
          where: { offline_id: body.offline_id },
        });

        if (existing) {
          return reply.status(409).send({
            success: false,
            error: { code: 'DUPLICATE', message: 'Data sudah pernah di-submit' },
          });
        }
      }

      // Create collection record
      const collection = await prisma.collections.create({
        data: {
          assignment_id: body.assignment_id,
          can_id: body.can_id,
          officer_id: officerId,
          amount: body.amount,
          payment_method: body.payment_method,
          transfer_receipt_url: body.transfer_receipt_url,
          collected_at: body.collected_at,
          submitted_at: new Date(),
          synced_at: new Date(),
          sync_status: 'COMPLETED',
          server_timestamp: new Date(),
          device_info: body.device_info as any,
          latitude: body.latitude,
          longitude: body.longitude,
          offline_id: body.offline_id,
        },
        include: {
          can: true,
        },
      });

      // Update assignment status
      await prisma.assignments.update({
        where: { id: body.assignment_id },
        data: { status: 'COMPLETED', completed_at: new Date() },
      });

      // Update can's last collected info
      await prisma.cans.update({
        where: { id: body.can_id },
        data: {
          last_collected_at: body.collected_at,
          total_collected: { increment: body.amount },
          collection_count: { increment: 1 },
        },
      });

      // Send WhatsApp notification to owner
      let whatsappStatus = 'PENDING';
      try {
        if (collection.can.owner_whatsapp) {
          await sendWhatsAppNotification(
            collection.can.owner_whatsapp,
            collection.can.owner_name,
            body.amount,
            officerId // Need to get officer name from user
          );
          whatsappStatus = 'SENT';
        }
      } catch (waError) {
        fastify.log.error('WhatsApp send failed:', waError);
        whatsappStatus = 'FAILED';
      }

      return reply.status(201).send({
        success: true,
        data: {
          id: collection.id,
          sync_status: 'COMPLETED',
          whatsapp_status: whatsappStatus,
          message: 'Penjemputan berhasil disimpan',
        },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Input tidak valid', details: error.errors },
        });
      }

      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });

  // POST /mobile/collections/batch
  fastify.post('/collections/batch', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = batchCollectionSchema.parse(request.body);
      const user = request.user!;
      const officerId = user.officerId;

      if (!officerId) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Bukan akun petugas' },
        });
      }

      const results = [];
      let succeeded = 0;
      let failed = 0;

      for (const item of body.collections) {
        try {
          const collection = await prisma.collections.create({
            data: {
              assignment_id: item.assignment_id,
              can_id: item.can_id,
              officer_id: officerId,
              amount: item.amount,
              payment_method: item.payment_method,
              collected_at: item.collected_at,
              submitted_at: new Date(),
              synced_at: new Date(),
              sync_status: 'COMPLETED',
              server_timestamp: new Date(),
              latitude: item.latitude,
              longitude: item.longitude,
              offline_id: item.offline_id,
            },
          });

          results.push({
            offline_id: item.offline_id,
            server_id: collection.id,
            status: 'COMPLETED',
          });
          succeeded++;
        } catch (err) {
          results.push({
            offline_id: item.offline_id,
            status: 'FAILED',
            error: (err as Error).message,
          });
          failed++;
        }
      }

      return reply.send({
        success: true,
        data: {
          total: body.collections.length,
          succeeded,
          failed,
          results,
        },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Input tidak valid' },
        });
      }

      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });

  // GET /mobile/sync/status
  fastify.get('/sync/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const officerId = user.officerId;

      if (!officerId) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Bukan akun petugas' },
        });
      }

      const pendingCollections = await prisma.collections.count({
        where: {
          officer_id: officerId,
          sync_status: { in: ['PENDING', 'FAILED'] },
        },
      });

      const oldestPending = await prisma.collections.findFirst({
        where: {
          officer_id: officerId,
          sync_status: { in: ['PENDING', 'FAILED'] },
        },
        orderBy: { collected_at: 'asc' },
        select: { collected_at: true },
      });

      return reply.send({
        success: true,
        data: {
          pending_count: pendingCollections,
          last_sync_at: new Date().toISOString(),
          oldest_pending: oldestPending?.collected_at || null,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });

  // GET /mobile/profile
  fastify.get('/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const officerId = user.officerId;

      if (!officerId) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Bukan akun petugas' },
        });
      }

      const officer = await prisma.officers.findUnique({
        where: { id: officerId },
        include: {
          branch: { select: { id: true, name: true } },
          district: { select: { id: true, name: true } },
        },
      });

      if (!officer) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Data petugas tidak ditemukan' },
        });
      }

      // Get stats
      const totalCollections = await prisma.collections.count({
        where: { officer_id: officerId, sync_status: 'COMPLETED' },
      });

      const totalAmount = await prisma.collections.aggregate({
        where: { officer_id: officerId, sync_status: 'COMPLETED' },
        _sum: { amount: true },
      });

      return reply.send({
        success: true,
        data: {
          id: officer.id,
          employee_code: officer.employee_code,
          full_name: officer.full_name,
          phone: officer.phone,
          photo_url: officer.photo_url,
          branch: { id: officer.branch.id, name: officer.branch.name },
          district: { id: officer.district.id, name: officer.district.name },
          assigned_zone: officer.assigned_zone,
          stats: {
            total_collections: totalCollections,
            total_amount: totalAmount._sum.amount || 0,
          },
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });
}

export default mobileRoutes;