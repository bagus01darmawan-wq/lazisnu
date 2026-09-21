import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { isAppError } from '../../utils/AppError';
import { emergencyAggregateSchema, manualCollectionSchema } from './schemas';
import { recordEmergencyAggregate } from '../../services/emergencyAggregates';
import { recordManualCollection } from '../../services/manualCollections';

/**
 * C1-T8 — Jalur insiden admin (§14 #5b/#5c).
 * - POST /emergency-aggregates: 1 angka uang fisik + saksi + HP_HILANG.
 * - POST /collections/manual: salin per kaleng dari kertas + KOREKSI_ADMIN.
 * Scope di service (ranting pemilik / MWC sedistrik).
 */
function actorOf(request: FastifyRequest) {
  const user = request.currentUser!;
  return {
    userId: user.userId,
    role: user.role,
    branchId: user.branchId ?? null,
    districtId: user.districtId ?? null,
  };
}

function sendAppError(reply: FastifyReply, error: unknown, logger?: { error: (e: unknown) => void }) {
  if (isAppError(error)) {
    return sendError(reply, error.statusCode, error.code, error.message, error.details);
  }
  if (error instanceof z.ZodError) {
    return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
  }
  return sendInternalError(reply, error, logger);
}

export async function incidentRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/emergency-aggregates',
    { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = emergencyAggregateSchema.parse(request.body);
        const result = await recordEmergencyAggregate(
          actorOf(request),
          {
            officerId: body.officer_id,
            year: body.year,
            month: body.month,
            amount: body.amount,
            reason: body.reason,
            witnessUserId: body.witness_user_id,
            note: body.note,
          },
          new Date(),
        );
        return sendSuccess(reply, result, 201);
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );

  fastify.post(
    '/collections/manual',
    { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = manualCollectionSchema.parse(request.body);
        const result = await recordManualCollection(
          actorOf(request),
          {
            assignmentId: body.assignment_id,
            canId: body.can_id,
            officerId: body.officer_id,
            nominal: body.nominal,
            collectedAt: new Date(body.collected_at),
            reason: body.reason,
          },
          new Date(),
        );
        return sendSuccess(reply, result, 201);
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );
}
