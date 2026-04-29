import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendInternalError } from '../../utils/response';
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
      const { branch_id, filter_assigned } = request.query as { branch_id?: string, filter_assigned?: boolean };
      const conditions = branch_id ? [eq(schema.dukuhs.branchId, branch_id)] : [];
      
      let data = await db.query.dukuhs.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
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
        required: ['branchId', 'name'],
        properties: {
          branchId: { type: 'string', format: 'uuid' },
          name: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = z.object({
        branchId: z.string().uuid(),
        name: z.string().min(1),
      }).parse(request.body);

      const inserted = await db.insert(schema.dukuhs).values({
        branchId: body.branchId,
        name: body.name.toUpperCase(),
      }).returning();

      return sendSuccess(reply, inserted[0], 201);
    } catch (error) {
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

      // Check if dukuh is used in cans
      const usedInCans = await db.query.cans.findFirst({
        where: eq(schema.cans.dukuhId, id)
      });

      if (usedInCans) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'DUKUH_IN_USE',
            message: 'Dukuh tidak bisa dihapus karena masih digunakan oleh data kaleng'
          }
        });
      }

      await db.delete(schema.dukuhs).where(eq(schema.dukuhs.id, id));
      return sendSuccess(reply, { message: 'Dukuh berhasil dihapus' });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
