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

      const branches = await db.select().from(schema.branches)
        .where(eq(schema.branches.districtId, districtId))
        .orderBy(schema.branches.name);
      return sendSuccess(reply, branches);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/branches', kecamatan, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const { name, code } = request.body as { name: string; code: string };
      
      if (!name || !code) return reply.status(400).send({ success: false, message: 'Nama dan kode ranting wajib diisi' });

      if (!user.districtId) {
        return reply.status(403).send({ 
          success: false, 
          error: { code: 'FORBIDDEN', message: 'Admin tidak memiliki ID Kecamatan di profilnya' } 
        });
      }

      const [newBranch] = await db.insert(schema.branches).values({
        name: name.toUpperCase(),
        code: code.toUpperCase(),
        districtId: user.districtId
      }).returning();

      return sendSuccess(reply, newBranch);
    } catch (error: any) {
      if (error.code === '23505') {
        return reply.status(400).send({ 
          success: false, 
          error: { code: 'DUPLICATE_CODE', message: 'Kode ranting sudah digunakan' } 
        });
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.patch('/branches/:id', kecamatan, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const { id } = request.params as { id: string };
      const { name, code } = request.body as { name: string; code: string };

      const [updatedBranch] = await db.update(schema.branches)
        .set({ 
          name: name?.toUpperCase(), 
          code: code?.toUpperCase(),
          updatedAt: new Date() 
        })
        .where(and(
          eq(schema.branches.id, id),
          eq(schema.branches.districtId, user.districtId!)
        ))
        .returning();

      if (!updatedBranch) return reply.status(404).send({ success: false, message: 'Ranting tidak ditemukan' });

      return sendSuccess(reply, updatedBranch);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.get('/branches/:branchId/dukuhs', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { branchId } = request.params as { branchId: string };
      const dukuhs = await db.select().from(schema.dukuhs)
        .where(eq(schema.dukuhs.branchId, branchId))
        .orderBy(schema.dukuhs.name);
      return sendSuccess(reply, dukuhs);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/branches/:branchId/dukuhs', kecamatan, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { branchId } = request.params as { branchId: string };
      const { name } = request.body as { name: string };

      if (!name) return reply.status(400).send({ success: false, message: 'Nama dukuh wajib diisi' });

      const [newDukuh] = await db.insert(schema.dukuhs).values({
        name: name.toUpperCase(),
        branchId
      }).returning();

      return sendSuccess(reply, newDukuh);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.patch('/dukuhs/:id', kecamatan, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const { name } = request.body as { name: string };

      const [updatedDukuh] = await db.update(schema.dukuhs)
        .set({ name: name?.toUpperCase(), updatedAt: new Date() })
        .where(eq(schema.dukuhs.id, id))
        .returning();

      if (!updatedDukuh) return reply.status(404).send({ success: false, message: 'Dukuh tidak ditemukan' });

      return sendSuccess(reply, updatedDukuh);
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
          nominal: byBranch[b.id]?.nominal || 0,
          count: byBranch[b.id]?.count || 0,
        })),
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.delete('/branches/:id', kecamatan, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      // Check if branch has any dukuhs
      const dukuhsCount = await db.$count(schema.dukuhs, eq(schema.dukuhs.branchId, id));
      if (Number(dukuhsCount) > 0) {
        return reply.status(400).send({ 
          success: false, 
          message: 'Ranting tidak bisa dihapus karena masih memiliki data dukuh terkait' 
        });
      }

      // Check if branch has any cans
      const cansCount = await db.$count(schema.cans, eq(schema.cans.branchId, id));
      if (Number(cansCount) > 0) {
        return reply.status(400).send({ 
          success: false, 
          message: 'Ranting tidak bisa dihapus karena masih memiliki data kaleng terkait' 
        });
      }

      // Check if branch has any officers
      const officersCount = await db.$count(schema.officers, eq(schema.officers.branchId, id));
      if (Number(officersCount) > 0) {
        return reply.status(400).send({ 
          success: false, 
          message: 'Ranting tidak bisa dihapus karena masih memiliki data petugas terkait' 
        });
      }

      const deleted = await db.delete(schema.branches)
        .where(eq(schema.branches.id, id))
        .returning();

      if (deleted.length === 0) return reply.status(404).send({ success: false, message: 'Ranting tidak ditemukan' });

      return sendSuccess(reply, { message: 'Ranting berhasil dihapus' });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
