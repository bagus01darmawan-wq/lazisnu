import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { sendWhatsAppNotification } from '../../services/whatsapp';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { collectionSchema, resubmitSchema } from './schemas';

import { validateAssignmentForSubmit, submitCollection, getLatestCollectionCondition } from '../../services/collectionSubmission';

export async function collectionsRoutes(fastify: FastifyInstance) {
  const latestCollectionCondition = getLatestCollectionCondition();

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
        try {
          await validateAssignmentForSubmit(tx, body.assignment_id, body.can_id, officerId);
        } catch (err: any) {
          if (err.message.includes('can_id')) {
            throw { status: 400, code: 'MISMATCH', message: err.message };
          }
          throw { status: 403, code: 'FORBIDDEN', message: err.message };
        }

        return await submitCollection(tx, {
          assignmentId: body.assignment_id,
          canId: body.can_id,
          officerId,
          nominal: body.nominal,
          paymentMethod: body.payment_method as any,
          transferReceiptUrl: body.transfer_receipt_url,
          collectedAt: new Date(body.collected_at),
          latitude: body.latitude?.toString(),
          longitude: body.longitude?.toString(),
          offlineId: body.offline_id,
          deviceInfo: body.device_info as any,
        });
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
      if (error.status) return sendError(reply, error.status, error.code, error.message);
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
          where: and(
            eq(schema.collections.officerId, officerId),
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          ),
          with: { can: { columns: { qrCode: true, ownerName: true, ownerAddress: true } } },
          orderBy: [desc(schema.collections.collectedAt)],
          offset: skip,
          limit,
        }),
        db.$count(
          schema.collections,
          and(
            eq(schema.collections.officerId, officerId),
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          )
        ),
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
            total_pages: Math.ceil(total / limit)
          },
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

      if (!oldCollection) return sendError(reply, 404, 'NOT_FOUND', 'Data perolehan tidak ditemukan');

      // Check if this ID is indeed the latest version for this assignment
      const [latestRecord] = await db.select({ maxSeq: sql<number>`max(${schema.collections.submitSequence})` })
        .from(schema.collections)
        .where(and(
          eq(schema.collections.assignmentId, oldCollection.assignmentId),
          eq(schema.collections.canId, oldCollection.canId)
        ));

      if (oldCollection.submitSequence !== Number(latestRecord?.maxSeq || 0)) {
        return sendError(reply, 400, 'NOT_LATEST', 'Hanya record terbaru yang bisa di-resubmit');
      }

      const newCollection = await db.transaction(async (tx) => {
        // NOTE: Table collections is STRICTLY IMMUTABLE. No UPDATE or DELETE allowed.

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
