import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, gte } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendInternalError } from '../../utils/response';

const kecamatan = { preHandler: [authorize('ADMIN_KECAMATAN')] };
const rantingOrKec = { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')] };

export async function districtRoutes(fastify: FastifyInstance) {
  fastify.get('/branches', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const districtId = user.districtId;
      if (!districtId) return sendSuccess(reply, []);

      const branches = await db.select().from(schema.branches).where(eq(schema.branches.districtId, districtId));
      return sendSuccess(reply, branches);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.get('/district/dashboard', kecamatan, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const districtId = user.districtId;
      if (!districtId) {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Bukan admin kecamatan' } });
      }

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const monthCollectionsRows = await db.query.collections.findMany({
        where: and(gte(schema.collections.collectedAt, monthStart), eq(schema.collections.syncStatus, 'COMPLETED')),
        with: { can: { with: { branch: true } }, officer: true }
      });
      
      const monthCollections = monthCollectionsRows.filter(c => c.can.branch?.districtId === districtId);

      const [branchesList, totalCans, totalOfficers] = await Promise.all([
        db.query.branches.findMany({
          where: eq(schema.branches.districtId, districtId),
          with: { cans: { columns: { id: true } }, officers: { columns: { id: true } } },
        }),
        db.select().from(schema.cans).innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
          .where(eq(schema.branches.districtId, districtId)).then(r => r.length),
        db.$count(schema.officers, and(eq(schema.officers.districtId, districtId), eq(schema.officers.isActive, true))),
      ]);

      const branches = branchesList.map(b => ({ id: b.id, name: b.name, _count: { cans: b.cans.length, officers: b.officers.length } }));

      const byBranch = monthCollections.reduce((acc: Record<string, any>, c) => {
        const key = c.officer.branchId!;
        if (!acc[key]) acc[key] = { count: 0, nominal: 0 };
        acc[key].count++;
        acc[key].nominal += Number(c.nominal);
        return acc;
      }, {});

      return sendSuccess(reply, {
        summary: {
          total_branches: branches.length,
          total_cans: totalCans,
          total_officers: totalOfficers,
          month_collection: monthCollections.reduce((s, c) => s + Number(c.nominal), 0),
          month_count: monthCollections.length,
        },
        by_branch: branches.map((b) => ({
          branch_id: b.id,
          branch_name: b.name,
          cans: b._count.cans,
          officers: b._count.officers,
          collection: byBranch[b.id]?.nominal || 0,
          count: byBranch[b.id]?.count || 0,
        })),
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
