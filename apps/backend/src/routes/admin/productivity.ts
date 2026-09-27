import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { assertBranchAccess } from '../../middleware/ownership';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { parseOverviewPeriod, effectiveMonths } from '../../services/overviewService';
import { getOfficerProductivity } from '../../services/productivityService';
import { OPERATIONAL_TIMEZONE } from '../../utils/operationalTimeZone';

const anyAdmin = { preHandler: [authorize('ADMIN_KECAMATAN', 'ADMIN_RANTING')] };

/**
 * Tabel produktivitas per PPK.
 *
 * - ADMIN_KECAMATAN: seluruh kecamatan, opsional `branch_id` milik
 *   kecamatannya (drill-down, divalidasi).
 * - ADMIN_RANTING: rantingnya sendiri (tanpa `branch_id`).
 * - Periode `?year=&months=` sama dengan overview (default bulan berjalan).
 */
export async function productivityRoutes(fastify: FastifyInstance) {
  fastify.get('/productivity/officers', anyAdmin, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const query = request.query as { branch_id?: string; year?: string; months?: string };

      const period = parseOverviewPeriod(query.year, query.months);
      if (!period) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Parameter year/months tidak valid');
      }
      const months = effectiveMonths(period);
      let scope: { districtId: string; branchId?: string };
      let branchName: string | undefined;
      if (user.role === 'ADMIN_RANTING') {
        if (!user.branchId || !user.districtId) {
          return sendError(reply, 403, 'FORBIDDEN', 'Bukan admin ranting');
        }
        scope = { districtId: user.districtId, branchId: user.branchId };
      } else {
        if (!user.districtId) {
          return sendError(reply, 403, 'FORBIDDEN', 'Bukan admin kecamatan');
        }
        scope = { districtId: user.districtId };
        if (query.branch_id) {
          const branch = await db.query.branches.findFirst({
            where: eq(schema.branches.id, query.branch_id),
            columns: { id: true, name: true, districtId: true },
          });
          if (!branch || branch.districtId !== user.districtId) {
            return sendError(reply, 403, 'FORBIDDEN_SCOPE', 'Ranting bukan bagian dari kecamatan Anda');
          }
          await assertBranchAccess(user, branch.id);
          scope = { districtId: user.districtId, branchId: branch.id };
          branchName = branch.name;
        }
      }

      const officers = await getOfficerProductivity(scope, period.year, months);

      return sendSuccess(reply, {
        scope: {
          type: scope.branchId ? 'branch' : 'district',
          district_id: scope.districtId,
          ...(scope.branchId ? { branch_id: scope.branchId } : {}),
          ...(branchName ? { branch_name: branchName } : {}),
        },
        period: {
          year: period.year,
          month: period.month,
          months,
          timezone: OPERATIONAL_TIMEZONE,
          generated_at: new Date().toISOString(),
        },
        officers,
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
