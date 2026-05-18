import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, desc, gte, lt, sql, inArray } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendInternalError } from '../../utils/response';
import { getLatestCollectionCondition } from '../../services/collectionSubmission';

const ranting = { preHandler: [authorize('ADMIN_RANTING')] };

export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get('/branch/dashboard', ranting, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const branchId = user.branchId;

      const latestCollectionCondition = getLatestCollectionCondition();

      if (!branchId) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Bukan admin ranting' },
        });
      }

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const dayOfWeek = now.getDay() || 7;
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1);
      weekStart.setHours(0, 0, 0, 0);

      const [
        canCount,
        activeCanCount,
        officerCount,
        latestMonthCollections,
        lastMonthCollections,
        weekCollections,
        pendingCount,
        latestRecentCollections,
        // District-level data
        districtBranches,
        districtCanCount,
        districtActiveCanCount,
        districtOfficerCount,
        districtMonthCollections,
        districtWeekCollections,
        districtLastMonthCollections,
      ] = await Promise.all([
        db.$count(schema.cans, eq(schema.cans.branchId, branchId)),
        db.$count(schema.cans, and(eq(schema.cans.branchId, branchId), eq(schema.cans.isActive, true))),
        db.$count(schema.officers, and(eq(schema.officers.branchId, branchId), eq(schema.officers.isActive, true))),
        db.query.collections.findMany({
          where: and(
            gte(schema.collections.collectedAt, monthStart),
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          ),
          with: { officer: { columns: { id: true, fullName: true } }, can: true },
        }).then(cols => cols.filter(c => c.can?.branchId === branchId)),
        db.query.collections.findMany({
          where: and(
            gte(schema.collections.collectedAt, lastMonthStart),
            lt(schema.collections.collectedAt, monthStart),
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          ),
          with: { can: true },
        }).then(cols => cols.filter(c => c.can?.branchId === branchId)),
        db.query.collections.findMany({
          where: and(
            gte(schema.collections.collectedAt, weekStart),
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          ),
          with: { can: true },
        }).then(cols => cols.filter(c => c.can?.branchId === branchId)),
        db.$count(schema.assignments, and(
          eq(schema.assignments.status, 'ACTIVE')
        )),
        db.query.collections.findMany({
          where: and(
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          ),
          with: {
            can: { columns: { qrCode: true, ownerName: true, branchId: true } },
            officer: { columns: { fullName: true } },
          },
          orderBy: [desc(schema.collections.collectedAt)],
          limit: 5,
        }).then(cols => cols.filter(c => c.can?.branchId === branchId)),
        // District queries
        db.query.branches.findMany({
          where: eq(schema.branches.districtId, user.districtId!),
          columns: { id: true, name: true },
        }),
        db.$count(schema.cans, inArray(schema.cans.branchId, db.select({ id: schema.branches.id }).from(schema.branches).where(eq(schema.branches.districtId, user.districtId!)))),
        db.$count(schema.cans, and(inArray(schema.cans.branchId, db.select({ id: schema.branches.id }).from(schema.branches).where(eq(schema.branches.districtId, user.districtId!))), eq(schema.cans.isActive, true))),
        db.$count(schema.officers, and(inArray(schema.officers.branchId, db.select({ id: schema.branches.id }).from(schema.branches).where(eq(schema.branches.districtId, user.districtId!))), eq(schema.officers.isActive, true))),
        db.query.collections.findMany({
          where: and(
            gte(schema.collections.collectedAt, monthStart),
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          ),
          with: { can: { columns: { branchId: true, ownerName: true }, with: { branch: { columns: { name: true } } } } },
        }),
        db.query.collections.findMany({
          where: and(
            gte(schema.collections.collectedAt, weekStart),
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          ),
          with: { can: { columns: { branchId: true } } },
        }),
        db.query.collections.findMany({
          where: and(
            gte(schema.collections.collectedAt, lastMonthStart),
            lt(schema.collections.collectedAt, monthStart),
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          ),
          with: { can: { columns: { branchId: true } } },
        }),
      ]);

      const districtBranchIds = new Set(districtBranches.map(b => b.id));

      const districtMonthFiltered = districtMonthCollections.filter(c => districtBranchIds.has(c.can.branchId));
      const districtWeekFiltered = districtWeekCollections.filter(c => districtBranchIds.has(c.can.branchId));
      const districtLastMonthFiltered = districtLastMonthCollections.filter(c => districtBranchIds.has(c.can.branchId));

      const byOfficer = latestMonthCollections.reduce(
        (acc: Record<string, any>, c) => {
          const key = c.officerId;
          if (!acc[key]) acc[key] = { name: c.officer.fullName, count: 0, nominal: 0 };
          acc[key].count++;
          acc[key].nominal += Number(c.nominal);
          return acc;
        },
        {}
      );

      const daysStr = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
      const dailyTrends = daysStr.map(day => ({ day, nominal: 0 }));

      weekCollections.forEach(c => {
        const d = new Date(c.collectedAt);
        let dayIdx = d.getDay() - 1;
        if (dayIdx === -1) dayIdx = 6;
        dailyTrends[dayIdx].nominal += Number(c.nominal);
      });

      const byBranch = districtMonthFiltered.reduce(
        (acc: Record<string, any>, c) => {
          const key = c.can.branchId;
          if (!acc[key]) acc[key] = { name: c.can.branch?.name || key, count: 0, nominal: 0 };
          acc[key].count++;
          acc[key].nominal += Number(c.nominal);
          return acc;
        },
        {}
      );

      const districtDailyTrends = daysStr.map(day => ({ day, nominal: 0 }));
      districtWeekFiltered.forEach(c => {
        const d = new Date(c.collectedAt);
        let dayIdx = d.getDay() - 1;
        if (dayIdx === -1) dayIdx = 6;
        districtDailyTrends[dayIdx].nominal += Number(c.nominal);
      });

      return sendSuccess(reply, {
        summary: {
          total_cans: canCount,
          active_cans: activeCanCount,
          total_officers: officerCount,
          month_collection: latestMonthCollections.reduce((s, c) => s + Number(c.nominal), 0),
          last_month_collection: lastMonthCollections.reduce((s, c) => s + Number(c.nominal), 0),
          month_count: latestMonthCollections.length,
          last_month_count: lastMonthCollections.length,
          pending_tasks: pendingCount,
        },
        daily_trends: dailyTrends,
        recent_collections: latestRecentCollections.map((c) => ({
          id: c.id,
          qr_code: c.can.qrCode,
          owner_name: c.can.ownerName,
          nominal: Number(c.nominal),
          officer_name: c.officer.fullName,
          collected_at: c.collectedAt,
        })),
        by_officer: Object.entries(byOfficer).map(([id, d]) => {
          const od = d as { name: string; count: number; nominal: number };
          return { officer_id: id, officer_name: od.name, collected: od.count, nominal: od.nominal };
        }),
        district: {
          summary: {
             total_cans: districtCanCount,
             active_cans: districtActiveCanCount,
             total_officers: districtOfficerCount,
             total_branches: districtBranches.length,
             month_collection: districtMonthFiltered.reduce((s, c) => s + Number(c.nominal), 0),
             month_count: districtMonthFiltered.length,
             last_month_collection: districtLastMonthFiltered.reduce((s, c) => s + Number(c.nominal), 0),
             last_month_count: districtLastMonthFiltered.length,
           },
          daily_trends: districtDailyTrends,
          by_branch: Object.entries(byBranch).map(([id, d]) => {
            const bd = d as { name: string; count: number; nominal: number };
            return { branch_id: id, branch_name: bd.name, collected: bd.count, nominal: bd.nominal };
          }),
        },
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
