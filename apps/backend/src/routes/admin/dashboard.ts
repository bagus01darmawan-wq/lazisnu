import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, gte, lt, inArray, SQL } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import {
  getBranchCollectionsByPeriod,
  getBranchRecentCollections,
  getBranchCollectionSummary,
  getDistrictCollectionsByPeriod,
  getDistrictCollectionSummary,
  getBranchNominalByOfficer,
  getDistrictNominalByBranch,
} from '../../services/dashboardService';

const ranting = { preHandler: [authorize('ADMIN_RANTING')] };

export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get('/branch/dashboard', ranting, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const branchId = user.branchId;

      if (!branchId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan admin ranting');
      }

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = monthStart; // eksklusif

      const dayOfWeek = now.getDay() || 7;
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1);
      weekStart.setHours(0, 0, 0, 0);

      const [
        canCount,
        activeCanCount,
        officerCount,
        pendingCount,
        // Branch-level collections — filter branchId di SQL via dashboardService
        byOfficer,
        weekCollections,
        recentCollections,
        monthSummary,
        lastMonthSummary,
        // District-level data
        districtBranches,
        districtCanCount,
        districtActiveCanCount,
        districtOfficerCount,
        byBranch,
        districtWeekCollections,
        districtMonthSummary,
        districtLastMonthSummary,
      ] = await Promise.all([
        db.$count(schema.cans, eq(schema.cans.branchId, branchId)),
        db.$count(schema.cans, and(eq(schema.cans.branchId, branchId), eq(schema.cans.isActive, true))),
        db.$count(schema.officers, and(eq(schema.officers.branchId, branchId), eq(schema.officers.isActive, true))),
        db.$count(schema.assignments, and(eq(schema.assignments.status, 'ACTIVE'))),
        // Branch: bulan ini (aggregated per officer by SQL)
        getBranchNominalByOfficer(branchId, gte(schema.collections.collectedAt, monthStart)),
        // Branch: minggu ini (full rows for daily trends)
        getBranchCollectionsByPeriod(branchId, gte(schema.collections.collectedAt, weekStart)),
        // Branch: 5 terbaru
        getBranchRecentCollections(branchId, 5),
        // Branch: summary bulan ini
        getBranchCollectionSummary(branchId, gte(schema.collections.collectedAt, monthStart)),
        // Branch: summary bulan lalu
        getBranchCollectionSummary(branchId, and(
          gte(schema.collections.collectedAt, lastMonthStart),
          lt(schema.collections.collectedAt, lastMonthEnd),
        )! as SQL<unknown>),
        // District queries
        db.query.branches.findMany({
          where: eq(schema.branches.districtId, user.districtId!),
          columns: { id: true, name: true },
        }),
        db.$count(schema.cans, inArray(schema.cans.branchId, db.select({ id: schema.branches.id }).from(schema.branches).where(eq(schema.branches.districtId, user.districtId!)))),
        db.$count(schema.cans, and(inArray(schema.cans.branchId, db.select({ id: schema.branches.id }).from(schema.branches).where(eq(schema.branches.districtId, user.districtId!))), eq(schema.cans.isActive, true))),
        db.$count(schema.officers, and(inArray(schema.officers.branchId, db.select({ id: schema.branches.id }).from(schema.branches).where(eq(schema.branches.districtId, user.districtId!))), eq(schema.officers.isActive, true))),
        // District: bulan ini (aggregated per branch by SQL)
        getDistrictNominalByBranch(user.districtId!, gte(schema.collections.collectedAt, monthStart)),
        // District: minggu ini (full rows for daily trends)
        getDistrictCollectionsByPeriod(user.districtId!, gte(schema.collections.collectedAt, weekStart)),
        // District: summary bulan ini
        getDistrictCollectionSummary(user.districtId!, gte(schema.collections.collectedAt, monthStart)),
        // District: summary bulan lalu
        getDistrictCollectionSummary(user.districtId!, and(
          gte(schema.collections.collectedAt, lastMonthStart),
          lt(schema.collections.collectedAt, lastMonthEnd),
        )! as SQL<unknown>),
      ]);

      // --- Branch-level aggregations (data sudah ter-filter di SQL) ---

      // --- Branch-level aggregations (data sudah ter-filter di SQL) ---

      const daysStr = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
      const dailyTrends = daysStr.map(day => ({ day, nominal: 0 }));

      weekCollections.forEach(c => {
        const d = new Date(c.collectedAt);
        let dayIdx = d.getDay() - 1;
        if (dayIdx === -1) dayIdx = 6;
        dailyTrends[dayIdx].nominal += c.nominal;
      });

      // --- District-level aggregations (data sudah ter-filter di SQL) ---

      // --- District-level aggregations (data sudah ter-filter di SQL) ---

      const districtDailyTrends = daysStr.map(day => ({ day, nominal: 0 }));
      districtWeekCollections.forEach(c => {
        const d = new Date(c.collectedAt);
        let dayIdx = d.getDay() - 1;
        if (dayIdx === -1) dayIdx = 6;
        districtDailyTrends[dayIdx].nominal += c.nominal;
      });

      return sendSuccess(reply, {
        summary: {
          total_cans: canCount,
          active_cans: activeCanCount,
          total_officers: officerCount,
          month_collection: monthSummary.total_nominal,
          last_month_collection: lastMonthSummary.total_nominal,
          month_count: monthSummary.count,
          last_month_count: lastMonthSummary.count,
          pending_tasks: pendingCount,
        },
        daily_trends: dailyTrends,
        recent_collections: recentCollections,
        by_officer: byOfficer,
        district: {
          summary: {
             total_cans: districtCanCount,
             active_cans: districtActiveCanCount,
             total_officers: districtOfficerCount,
             total_branches: districtBranches.length,
             month_collection: districtMonthSummary.total_nominal,
             month_count: districtMonthSummary.count,
             last_month_collection: districtLastMonthSummary.total_nominal,
             last_month_count: districtLastMonthSummary.count,
           },
          daily_trends: districtDailyTrends,
          by_branch: byBranch,
        },
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
