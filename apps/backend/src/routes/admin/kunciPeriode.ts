import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { isAppError } from '../../utils/AppError';
import { kunciPeriodeSchema } from './schemas';
import { kunciPeriode } from '../../services/kunciPeriode';

/**
 * C1-T6 (§14.7) — Kunci Periode MWC 2 tahap.
 * - 27 00:00–9 23:59 → REKAP (tarik FINAL saja, tanpa men-nolkan).
 * - ≥10 00:00 → KUNCI_KERAS (FINAL_NOL massal ranting diam + LOCKED).
 * - <27 00:00 → VALIDATION_ERROR (belum saatnya).
 * Hanya ADMIN_KECAMATAN sedistrik; PROGRAM_MWC tidak ikut massal.
 */
export async function kunciPeriodeRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/kunci-periode',
    { preHandler: [authorize('ADMIN_KECAMATAN')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = kunciPeriodeSchema.parse(request.body);
        const user = request.currentUser!;
        const result = await kunciPeriode(
          {
            userId: user.userId,
            role: user.role,
            branchId: user.branchId ?? null,
            districtId: user.districtId ?? null,
          },
          { year: body.year, month: body.month },
          new Date(),
        );
        return sendSuccess(reply, result);
      } catch (error: unknown) {
        if (isAppError(error)) {
          return sendError(reply, error.statusCode, error.code, error.message, error.details);
        }
        if (error instanceof z.ZodError) {
          return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
        }
        return sendInternalError(reply, error, fastify.log);
      }
    },
  );
}
