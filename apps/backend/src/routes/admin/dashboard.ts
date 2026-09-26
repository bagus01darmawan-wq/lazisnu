import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { getOverview, parseOverviewPeriod } from '../../services/overviewService';

const ranting = { preHandler: [authorize('ADMIN_RANTING')] };

/**
 * Overview admin ranting.
 *
 * Scope ditentukan server dari token (`user.branchId`) — endpoint ini tidak menerima
 * `branch_id` sama sekali, sehingga scope tidak dapat dimanipulasi dari query string.
 *
 * Blok `district` (agregat kecamatan) dihapus dari respons: admin ranting tidak
 * memerlukannya, dan sebelumnya route ini mengirimkannya kembali ke admin ranting.
 */
export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get('/branch/dashboard', ranting, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const branchId = user.branchId;

      if (!branchId || !user.districtId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan admin ranting');
      }

      const query = request.query as { year?: string; months?: string };
      const period = parseOverviewPeriod(query.year, query.months);
      if (!period) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Parameter year/months tidak valid');
      }

      const branch = await db.query.branches.findFirst({
        where: eq(schema.branches.id, branchId),
        columns: { id: true, name: true, districtId: true },
      });

      // Ranting di luar kecamatan pada token tidak boleh menghasilkan data lintas scope.
      if (!branch || branch.districtId !== user.districtId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Ranting tidak sesuai dengan akun Anda');
      }

      const data = await getOverview(
        { districtId: user.districtId, branchId },
        period,
        { scopeType: 'branch', branchName: branch.name },
      );

      return sendSuccess(reply, data);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}