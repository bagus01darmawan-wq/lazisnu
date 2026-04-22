import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, desc, gte } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendInternalError } from '../../utils/response';

const ranting = { preHandler: [authorize('ADMIN_RANTING')] };

export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get('/branch/dashboard', ranting, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const branchId = user.branchId;

      if (!branchId) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Bukan admin ranting' },
        });
      }

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [canCount, officerCount, monthCollections, pendingCount, recentCollections] =
        await Promise.all([
          db.$count(schema.cans, eq(schema.cans.branchId, branchId)),
          db.$count(schema.officers, and(eq(schema.officers.branchId, branchId), eq(schema.officers.isActive, true))),
          db.query.collections.findMany({
            where: and(
              gte(schema.collections.collectedAt, monthStart),
              eq(schema.collections.syncStatus, 'COMPLETED')
            ),
            with: { officer: { columns: { id: true, fullName: true } }, can: true },
          }).then(cols => cols.filter(c => c.can?.branchId === branchId)),
          db.$count(schema.assignments, and(
            eq(schema.assignments.status, 'ACTIVE')
          )),
          db.query.collections.findMany({
            where: eq(schema.collections.syncStatus, 'COMPLETED'),
            with: {
              can: { columns: { qrCode: true, ownerName: true, branchId: true } },
              officer: { columns: { fullName: true } },
            },
            orderBy: [desc(schema.collections.collectedAt)],
            limit: 5,
          }).then(cols => cols.filter(c => c.can?.branchId === branchId)),
        ]);

      const byOfficer = monthCollections.reduce(
        (acc: Record<string, any>, c) => {
          const key = c.officerId;
          if (!acc[key]) acc[key] = { name: c.officer.fullName, count: 0, nominal: 0 };
          acc[key].count++;
          acc[key].nominal += Number(c.nominal);
          return acc;
        },
        {}
      );

      return sendSuccess(reply, {
        summary: {
          total_cans: canCount,
          total_officers: officerCount,
          month_collection: monthCollections.reduce((s, c) => s + Number(c.nominal), 0),
          month_count: monthCollections.length,
          pending_tasks: pendingCount,
        },
        recent_collections: recentCollections.map((c) => ({
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
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
