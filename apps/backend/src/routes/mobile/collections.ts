import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { sendWhatsAppNotification } from '../../services/whatsapp';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { collectionSchema, resubmitSchema } from './schemas';

export async function collectionsRoutes(fastify: FastifyInstance) {
  // POST /mobile/collections
  fastify.post('/collections', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = collectionSchema.parse(request.body);
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');

      if (body.offline_id) {
        const existing = await db.query.collections.findFirst({
          where: eq(schema.collections.offlineId, body.offline_id),
        });
        if (existing) return sendError(reply, 409, 'DUPLICATE', 'Data sudah pernah di-submit');
      }

      const result = await db.transaction(async (tx) => {
        const insertedColls = await tx.insert(schema.collections).values({
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

        await tx.update(schema.assignments).set({ status: 'COMPLETED', completedAt: new Date() }).where(eq(schema.assignments.id, body.assignment_id));

        await tx.update(schema.cans).set({
          lastCollectedAt: new Date(body.collected_at),
          totalCollected: sql`${schema.cans.totalCollected} + ${BigInt(body.nominal)}`,
          collectionCount: sql`${schema.cans.collectionCount} + 1`
        }).where(eq(schema.cans.id, body.can_id));

        return collection;
      });

      const insertedCan = await db.query.cans.findFirst({ where: eq(schema.cans.id, body.can_id) });
      const officer = await db.query.officers.findFirst({ where: eq(schema.officers.id, officerId) });

      let whatsappStatus = 'SKIPPED';
      if (insertedCan?.ownerWhatsapp) {
        try {
          await sendWhatsAppNotification(
            insertedCan.ownerWhatsapp,
            insertedCan.ownerName,
            body.nominal,
            officer?.fullName || 'Petugas Lazisnu',
            { collectionId: result.id, collectedAt: body.collected_at }
          );
          whatsappStatus = 'ENQUEUED';
        } catch (waError) {
          fastify.log.error({ err: waError }, 'WhatsApp send failed');
          whatsappStatus = 'FAILED';
        }
      }

      return sendSuccess(reply, {
        id: result.id,
        sync_status: 'COMPLETED',
        whatsapp_status: whatsappStatus,
        message: 'Penjemputan berhasil disimpan',
      }, 201);
    } catch (error: any) {
      if (error instanceof z.ZodError) return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // GET /mobile/history
  fastify.get('/history', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const officerId = user.officerId;
      const query = request.query as { page?: string; limit?: string };

      if (!officerId) return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');

      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '20');
      const skip = (page - 1) * limit;

      const [collections, total] = await Promise.all([
        db.query.collections.findMany({
          where: and(eq(schema.collections.officerId, officerId), eq(schema.collections.syncStatus, 'COMPLETED')),
          with: { can: { columns: { qrCode: true, ownerName: true, ownerAddress: true } } },
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
          pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
        },
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // POST /mobile/collections/:id/resubmit
  fastify.post('/collections/:id/resubmit', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = resubmitSchema.parse(request.body);
      const user = request.currentUser!;
      const officerId = user.officerId;

      if (!officerId) return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');

      const oldCollection = await db.query.collections.findFirst({
        where: and(eq(schema.collections.id, id), eq(schema.collections.officerId, officerId)),
        with: { can: true }
      });

      if (!oldCollection) return sendError(reply, 404, 'NOT_FOUND', 'Data koleksi tidak ditemukan');
      if (!oldCollection.isLatest) return sendError(reply, 400, 'NOT_LATEST', 'Hanya record terbaru yang bisa di-resubmit');

      const newCollection = await db.transaction(async (tx) => {
        await tx.update(schema.collections).set({ isLatest: false, updatedAt: new Date() }).where(eq(schema.collections.id, id));

        const inserted = await tx.insert(schema.collections).values({
          assignmentId: oldCollection.assignmentId,
          canId: oldCollection.canId,
          officerId: oldCollection.officerId,
          nominal: BigInt(body.nominal),
          paymentMethod: body.payment_method,
          collectedAt: oldCollection.collectedAt,
          submittedAt: new Date(),
          syncedAt: new Date(),
          syncStatus: 'COMPLETED',
          serverTimestamp: new Date(),
          submitSequence: oldCollection.submitSequence + 1,
          isLatest: true,
          alasanResubmit: body.alasan_resubmit,
          deviceInfo: oldCollection.deviceInfo,
          latitude: oldCollection.latitude,
          longitude: oldCollection.longitude,
        }).returning();

        await tx.update(schema.cans).set({
          totalCollected: sql`${schema.cans.totalCollected} - ${oldCollection.nominal} + ${BigInt(body.nominal)}`,
          updatedAt: new Date()
        }).where(eq(schema.cans.id, oldCollection.canId));

        return inserted[0];
      });

      let whatsappStatus = 'SKIPPED';
      if (oldCollection.can?.ownerWhatsapp) {
        try {
          const officer = await db.query.officers.findFirst({ where: eq(schema.officers.id, officerId) });
          await sendWhatsAppNotification(
            oldCollection.can.ownerWhatsapp,
            oldCollection.can.ownerName,
            body.nominal,
            officer?.fullName || 'Petugas Lazisnu',
            { collectionId: newCollection.id, collectedAt: oldCollection.collectedAt.toISOString(), isResubmit: true }
          );
          whatsappStatus = 'ENQUEUED';
        } catch (waError) {
          fastify.log.error({ err: waError }, 'WhatsApp resubmit send failed');
          whatsappStatus = 'FAILED';
        }
      }

      return sendSuccess(reply, {
        id: newCollection.id,
        submit_sequence: newCollection.submitSequence,
        whatsapp_status: whatsappStatus,
        message: 'Koreksi data berhasil disimpan',
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
