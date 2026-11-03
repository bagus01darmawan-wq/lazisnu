import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { isAppError } from '../../utils/AppError';
import { getPeriodState, scopeForUser } from '../../services/periodState';

/**
 * GET /v1/mobile/period-context
 *
 * Periode tampilan berbasis aksi: periode tertua yang belum tuntas untuk
 * cakupan pengguna (petugas → officer, bendahara → ranting, staf → distrik).
 * Mobile memakai `display_period` sebagai default layar periode, dan membaca
 * `unsettled` untuk banner. Tanggal kalender hanya badge, bukan gerbang.
 */
export async function periodContextRoutes(fastify: FastifyInstance) {
  fastify.get('/period-context', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const scope = scopeForUser(user);
      if (!scope) {
        return sendError(reply, 400, 'SCOPE_MISSING', 'Akun tidak memiliki cakupan periode');
      }
      return sendSuccess(reply, await getPeriodState(scope));
    } catch (error: unknown) {
      if (isAppError(error)) {
        return sendError(reply, error.statusCode, error.code, error.message, error.details);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
