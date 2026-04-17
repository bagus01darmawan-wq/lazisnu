// Mobile Routes - Petugas API Endpoints

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, desc, asc, gte, inArray, sql } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { sendWhatsAppNotification } from '../services/whatsapp';

// Request schemas
const collectionSchema = z.object({
  assignment_id: z.string().uuid(),
  can_id: z.string().uuid(),
  nominal: z.number().positive(),
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
    nominal: z.number().positive(),
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

      // Get today's stats
      const todayCollections = await db.query.collections.findMany({
        where: and(eq(schema.collections.officerId, officerId), gte(schema.collections.collectedAt, today), eq(schema.collections.syncStatus, 'COMPLETED')),
      });

      // Get week stats
      const weekCollections = await db.query.collections.findMany({
        where: and(eq(schema.collections.officerId, officerId), gte(schema.collections.collectedAt, weekStart), eq(schema.collections.syncStatus, 'COMPLETED')),
      });

      // Get pending tasks
      const pendingAssignments = await db.query.assignments.findMany({
        where: and(eq(schema.assignments.officerId, officerId), eq(schema.assignments.status, 'ACTIVE')),
        with: {
          can: {
            columns: {
              id: true, qrCode: true, ownerName: true, ownerAddress: true, latitude: true, longitude: true,
            },
          },
        },
        limit: 10,
        orderBy: [asc(schema.assignments.assignedAt)],
      });

      // Get recent collections
      const recentCollections = await db.query.collections.findMany({
        where: and(eq(schema.collections.officerId, officerId), eq(schema.collections.syncStatus, 'COMPLETED')),
        with: {
          can: { columns: { qrCode: true, ownerName: true } },
        },
        orderBy: [desc(schema.collections.collectedAt)],
        limit: 5,
      });

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
              columns: {
                id: true, qrCode: true, ownerName: true, ownerPhone: true, ownerAddress: true, latitude: true, longitude: true,
              },
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
      const user = request.currentUser!;
      const officerId = user.officerId;

      // Find can by QR code
      const can = await db.query.cans.findFirst({
        where: eq(schema.cans.qrCode, qrCode),
        with: {
          collections: {
            orderBy: [desc(schema.collections.collectedAt)],
            limit: 1,
          },
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
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Bukan akun petugas' },
        });
      }

      // Idempotency check via offline_id
      if (body.offline_id) {
        const existing = await db.query.collections.findFirst({
          where: eq(schema.collections.offlineId, body.offline_id),
        });
        if (existing) {
          return reply.status(409).send({
            success: false,
            error: { code: 'DUPLICATE', message: 'Data sudah pernah di-submit' },
          });
        }
      }

      // Create collection record
      const insertedColls = await db.insert(schema.collections).values({
          assignmentId: body.assignment_id,
          canId: body.can_id,
          officerId,
          nominal: BigInt(body.nominal),
          paymentMethod: body.payment_method,
          transferReceiptUrl: body.transfer_receipt_url,
          collectedAt: new Date(body.collected_at),
          submittedAt: new Date(),
          syncedAt: new Date(),
          syncStatus: 'COMPLETED',
          serverTimestamp: new Date(),
          deviceInfo: body.device_info as any,
          latitude: body.latitude?.toString(),
          longitude: body.longitude?.toString(),
          offlineId: body.offline_id,
      }).returning();
      const collection = insertedColls[0];

      const insertedOfficer = await db.query.officers.findFirst({ where: eq(schema.officers.id, officerId) });
      const insertedCan = await db.query.cans.findFirst({ where: eq(schema.cans.id, body.can_id) });

      // Update assignment status
      await db.update(schema.assignments).set({ status: 'COMPLETED', completedAt: new Date() }).where(eq(schema.assignments.id, body.assignment_id));

      // Update can's last collected info
      await db.update(schema.cans).set({
          lastCollectedAt: new Date(body.collected_at),
          totalCollected: sql`${schema.cans.totalCollected} + ${BigInt(body.nominal)}`,
          collectionCount: sql`${schema.cans.collectionCount} + 1`
      }).where(eq(schema.cans.id, body.can_id));

      // Send WhatsApp notification to owner
      let whatsappStatus = 'SKIPPED';
      if (insertedCan?.ownerWhatsapp) {
        try {
          const waResult = await sendWhatsAppNotification(
            insertedCan.ownerWhatsapp,
            insertedCan.ownerName,
            body.nominal,
            insertedOfficer!.fullName,
            {
              collectionId: collection.id,
              collectedAt: body.collected_at,
            }
          );
          whatsappStatus = waResult.status;
        } catch (waError) {
          fastify.log.error({ err: waError }, 'WhatsApp send failed');
          whatsappStatus = 'FAILED';
        }
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

  // POST /mobile/collections/batch (offline sync)
  fastify.post('/collections/batch', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = batchCollectionSchema.parse(request.body);
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Bukan akun petugas' },
        });
      }

      const results: any[] = [];
      let succeeded = 0;
      let failed = 0;

      for (const item of body.collections) {
        try {
          // Idempotency check
          const existing = await db.query.collections.findFirst({
            where: eq(schema.collections.offlineId, item.offline_id),
          });

          if (existing) {
            results.push({
              offline_id: item.offline_id,
              server_id: existing.id,
              status: 'ALREADY_SYNCED',
            });
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

          // Update assignment
          await db.update(schema.assignments).set({ status: 'COMPLETED', completedAt: new Date() }).where(eq(schema.assignments.id, item.assignment_id)).catch(() => {});

          // Update can totals
          await db.update(schema.cans).set({
              lastCollectedAt: new Date(item.collected_at),
              totalCollected: sql`${schema.cans.totalCollected} + ${BigInt(item.nominal)}`,
              collectionCount: sql`${schema.cans.collectionCount} + 1`
          }).where(eq(schema.cans.id, item.can_id));

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
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Bukan akun petugas' },
        });
      }

      const [pendingCount, oldestPending] = await Promise.all([
        db.$count(schema.collections, and(eq(schema.collections.officerId, officerId), inArray(schema.collections.syncStatus, ['PENDING', 'FAILED']))),
        db.query.collections.findFirst({
          where: and(eq(schema.collections.officerId, officerId), inArray(schema.collections.syncStatus, ['PENDING', 'FAILED'])),
          orderBy: [asc(schema.collections.collectedAt)],
          columns: { collectedAt: true },
        }),
      ]);

      return reply.send({
        success: true,
        data: {
          pending_count: pendingCount,
          last_sync_at: new Date().toISOString(),
          oldest_pending: oldestPending?.collectedAt || null,
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
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Bukan akun petugas' },
        });
      }

      const [officer, totalCollections, sumResult] = await Promise.all([
        db.query.officers.findFirst({
          where: eq(schema.officers.id, officerId),
          with: {
            branch: { columns: { id: true, name: true } },
            district: { columns: { id: true, name: true } },
          },
        }),
        db.$count(schema.collections, and(eq(schema.collections.officerId, officerId), eq(schema.collections.syncStatus, 'COMPLETED'))),
        db.select({ total: sql<string>`sum(${schema.collections.nominal})` }).from(schema.collections)
          .where(and(eq(schema.collections.officerId, officerId), eq(schema.collections.syncStatus, 'COMPLETED')))
      ]);
      const totalAmount = Number(sumResult[0]?.total || 0);

      if (!officer) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Data petugas tidak ditemukan' },
        });
      }

      return reply.send({
        success: true,
        data: {
          id: officer.id,
          employee_code: officer.employeeCode,
          full_name: officer.fullName,
          phone: officer.phone,
          photo_url: officer.photoUrl,
          branch: officer.branch ? { id: officer.branch.id, name: officer.branch.name } : { id: '', name: '' },
          district: officer.district ? { id: officer.district.id, name: officer.district.name } : { id: '', name: '' },
          assigned_zone: officer.assignedZone,
          stats: {
            total_collections: totalCollections,
            total_amount: totalAmount,
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

  // GET /mobile/history
  fastify.get('/history', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const officerId = user.officerId;
      const query = request.query as { page?: string; limit?: string };

      if (!officerId) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Bukan akun petugas' },
        });
      }

      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '20');
      const skip = (page - 1) * limit;

      const [collections, total] = await Promise.all([
        db.query.collections.findMany({
          where: and(eq(schema.collections.officerId, officerId), eq(schema.collections.syncStatus, 'COMPLETED')),
          with: {
            can: { columns: { qrCode: true, ownerName: true, ownerAddress: true } },
          },
          orderBy: [desc(schema.collections.collectedAt)],
          offset: skip,
          limit,
        }),
        db.$count(schema.collections, and(eq(schema.collections.officerId, officerId), eq(schema.collections.syncStatus, 'COMPLETED'))),
      ]);

      return reply.send({
        success: true,
        data: {
          collections: collections.map((c) => ({
            id: c.id,
            qr_code: c.can.qrCode,
            owner_name: c.can.ownerName,
            owner_address: c.can.ownerAddress,
            nominal: Number(c.nominal),
            payment_method: c.paymentMethod,
            collected_at: c.collectedAt,
            sync_status: c.syncStatus,
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
}

export default mobileRoutes;
