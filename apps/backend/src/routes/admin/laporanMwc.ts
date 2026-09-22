import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { isAppError } from '../../utils/AppError';
import { getMwcRecap } from '../../services/mwcRecap';

/**
 * C1-T8 — Rekap MWC (§8 + §7.2 + §8b): 2 kartu (Ranting vs Program),
 * hanya FINAL/FINAL_NOL (DRAFT tak berangka), flag selisih + belum-lapor.
 */
export async function laporanMwcRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/laporan-mwc',
    { preHandler: [authorize('ADMIN_KECAMATAN')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as { year?: string; month?: string };
        const now = new Date();
        const year = query.year ? z.coerce.number().int().min(2020).max(2100).parse(query.year) : now.getFullYear();
        const month = query.month ? z.coerce.number().int().min(1).max(12).parse(query.month) : now.getMonth() + 1;
        const user = request.currentUser!;
        const result = await getMwcRecap(
          {
            userId: user.userId,
            role: user.role,
            branchId: user.branchId ?? null,
            districtId: user.districtId ?? null,
          },
          year,
          month,
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
