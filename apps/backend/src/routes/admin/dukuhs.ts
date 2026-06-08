import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { assertBranchAccess } from '../../middleware/ownership';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { AppError, isAppError } from '../../utils/AppError';
import { Errors } from '../../utils/errorCatalog';
import { z } from 'zod';

const rantingOrKec = { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')] };

export async function dukuhsRoutes(fastify: FastifyInstance) {
  // Get all dukuhs
  fastify.get('/dukuhs', {
    ...rantingOrKec,
    schema: {
      tags: ['Admin'],
      summary: 'Ambil daftar dukuh',
      querystring: {
        type: 'object',
        properties: {
          branch_id: { type: 'string', format: 'uuid' },
          filter_assigned: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      let { branch_id, filter_assigned } = request.query as { branch_id?: string, filter_assigned?: boolean };
      const user = request.currentUser!;
      
      // ADMIN_RANTING: paksa branch_id dari JWT
      if (user.role === 'ADMIN_RANTING') {
        branch_id = user.branchId;
      }
      // ADMIN_KECAMATAN: validasi akses
      else if (branch_id) {
        await assertBranchAccess(user, branch_id);
      }

      // Jika branch_id tidak ada, kembalikan array kosong untuk keamanan
      if (!branch_id) {
        return sendSuccess(reply, []);
      }

      const conditions = [eq(schema.dukuhs.branchId, branch_id)];
      
      let data = await db.query.dukuhs.findMany({
        where: and(...conditions),
        orderBy: (dukuhs, { asc }) => [asc(dukuhs.name)]
      });

      if (filter_assigned && branch_id) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        // Find dukuhs that have AT LEAST one active can NOT assigned for this month
        // We do this by finding all active cans in the branch, joined with their current month assignments
        const cansStatus = await db.select({
          dukuhId: schema.cans.dukuhId,
          assignmentId: schema.assignments.id
        })
        .from(schema.cans)
        .leftJoin(schema.assignments, and(
          eq(schema.assignments.canId, schema.cans.id),
          eq(schema.assignments.periodYear, year),
          eq(schema.assignments.periodMonth, month)
        ))
        .where(and(
          eq(schema.cans.branchId, branch_id),
          eq(schema.cans.isActive, true)
        ));

        // We want to HIDE dukuhs where (total active cans > 0) AND (all are assigned)
        const stats: Record<string, { total: number, assigned: number }> = {};
        
        cansStatus.forEach(c => {
          if (!c.dukuhId) return;
          if (!stats[c.dukuhId]) stats[c.dukuhId] = { total: 0, assigned: 0 };
          stats[c.dukuhId].total++;
          if (c.assignmentId) stats[c.dukuhId].assigned++;
        });

        const fullyAssignedDukuhIds = Object.keys(stats).filter(id => 
          stats[id].total > 0 && stats[id].total === stats[id].assigned
        );

        data = data.filter(d => !fullyAssignedDukuhIds.includes(d.id));
      }

      return sendSuccess(reply, data);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // Create new dukuh
  fastify.post('/dukuhs', {
    ...rantingOrKec,
    schema: {
      tags: ['Admin'],
      summary: 'Tambah dukuh baru',
      body: {
        type: 'object',
        required: ['branch_id', 'name'],
        properties: {
          branch_id: { type: 'string', format: 'uuid' },
          name: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const body = z.object({
        branch_id: z.string().uuid(),
        name: z.string().min(1),
      }).parse(request.body);

      // Paksa branchId dari JWT untuk ADMIN_RANTING
      const branchId = user.role === 'ADMIN_RANTING' ? user.branchId : body.branch_id;
      if (!branchId) {
        return sendError(reply, 400, 'MISSING_BRANCH', 'branchId tidak tersedia');
      }

      // ADMIN_KECAMATAN: validasi akses ke branch
      if (user.role === 'ADMIN_KECAMATAN') {
        await assertBranchAccess(user, branchId);
      }

      const inserted = await db.insert(schema.dukuhs).values({
        branchId,
        name: body.name.toUpperCase(),
      }).returning();

      request.auditContext = { newData: inserted[0] };
      return sendSuccess(reply, inserted[0], 201);
    } catch (error) {
      if (isAppError(error)) return sendError(reply, error.statusCode, error.code, error.message);
      return sendInternalError(reply, error, fastify.log);
    }
  });
  // Delete dukuh
  fastify.delete('/dukuhs/:id', {
    ...rantingOrKec,
    schema: {
      tags: ['Admin'],
      summary: 'Hapus dukuh',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const user = request.currentUser!;

      // Ownership check: cari dukuh dulu, lalu validasi akses branch
      const [dukuhToDelete] = await db.select().from(schema.dukuhs).where(eq(schema.dukuhs.id, id));
      if (!dukuhToDelete) {
        throw new AppError('NOT_FOUND', 'Dukuh tidak ditemukan', 404);
      }
      await assertBranchAccess(user, dukuhToDelete.branchId);

      // Check if dukuh is used in ACTIVE cans
      const activeCans = await db.query.cans.findFirst({
        where: and(
          eq(schema.cans.dukuhId, id),
          eq(schema.cans.isActive, true)
        )
      });

      if (activeCans) {
        throw Errors.DUKUH_IN_USE();
      }

      // If there are only inactive cans, we allow deletion but must set their dukuhId to NULL
      // to avoid foreign key constraint violation
      await db.update(schema.cans)
        .set({ dukuhId: null })
        .where(eq(schema.cans.dukuhId, id));
 
      await db.delete(schema.dukuhs).where(eq(schema.dukuhs.id, id));

      // Set audit context
      request.auditContext = {
        oldData: dukuhToDelete,
        newData: null
      };

      return sendSuccess(reply, { message: 'Dukuh berhasil dihapus' });
    } catch (error) {
      if (isAppError(error)) return sendError(reply, error.statusCode, error.code, error.message);
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
