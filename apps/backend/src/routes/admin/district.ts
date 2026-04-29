import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
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

      const c2 = alias(schema.collections, 'c2');
      const latestCollectionCondition = eq(
        schema.collections.submitSequence,
        db.select({ maxSeq: sql<number>`max(${c2.submitSequence})` })
          .from(c2)
          .where(and(
            eq(c2.assignmentId, schema.collections.assignmentId),
            eq(c2.canId, schema.collections.canId)
          ))
      );

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const monthCollections = await db.query.collections.findMany({
        where: and(
          gte(schema.collections.collectedAt, monthStart), 
          eq(schema.collections.syncStatus, 'COMPLETED'),
          latestCollectionCondition
        ),
        with: { can: { with: { branch: true } }, officer: true }
      }).then(rows => rows.filter(c => c.can.branch?.districtId === districtId));

      const [branchesList, totalCans, totalOfficers] = await Promise.all([
        db.query.branches.findMany({
          where: eq(schema.branches.districtId, districtId),
          with: { cans: { columns: { id: true } }, officers: { columns: { id: true } } },
        }),
        db.select().from(schema.cans).innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
          .where(eq(schema.branches.districtId, districtId)).then(r => r.length),
        db.$count(schema.officers, and(eq(schema.officers.districtId, districtId), eq(schema.officers.isActive, true))).then(c => Number(c)),
      ]);

      const branches = branchesList.map(b => ({ id: b.id, name: b.name, _count: { cans: b.cans.length, officers: b.officers.length } }));

      const byBranch = monthCollections.reduce((acc: Record<string, any>, c) => {
        const key = c.officer.branchId!;
        if (!acc[key]) acc[key] = { count: 0, nominal: 0 };
        acc[key].count++;
        acc[key].nominal += Number(c.nominal);
        return acc;
      }, {});

      // Fetch recent collections for the whole district
      const recentCollections = await db.query.collections.findMany({
        where: and(
          eq(schema.collections.syncStatus, 'COMPLETED'),
          latestCollectionCondition
        ),
        with: {
          can: { 
            columns: { qrCode: true, ownerName: true, branchId: true },
            with: { branch: true }
          },
          officer: { columns: { fullName: true } },
        },
        orderBy: [desc(schema.collections.collectedAt)],
      }).then(rows => rows.filter(c => c.can.branch?.districtId === districtId).slice(0, 10));

      return sendSuccess(reply, {
        summary: {
          total_branches: branches.length,
          total_cans: totalCans,
          total_officers: totalOfficers,
          month_collection: monthCollections.reduce((s, c) => s + Number(c.nominal), 0),
          month_count: monthCollections.length,
        },
        recent_collections: recentCollections.map((c) => ({
          id: c.id,
          qr_code: c.can.qrCode,
          owner_name: c.can.ownerName,
          nominal: Number(c.nominal),
          officer_name: c.officer.fullName,
          collected_at: c.collectedAt,
        })),
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
