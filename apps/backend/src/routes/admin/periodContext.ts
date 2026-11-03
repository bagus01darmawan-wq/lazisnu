import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { isAppError } from '../../utils/AppError';
import { getPeriodState, scopeForUser } from '../../services/periodState';

/**
 * GET /v1/admin/period-context
 *
 * Sumber yang sama dengan mobile: admin ranting melihat periode belum tuntas
 * untuk rantingnya, admin kecamatan untuk distriknya. Web memakai
 * `display_period` sebagai nilai awal pemilih periode — bukan mengganti
 * kalender operasional.
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
