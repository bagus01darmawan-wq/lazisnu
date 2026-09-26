import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { assertBranchAccess, assertDukuhAccess } from '../../middleware/ownership';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { getPostgresError } from '../../utils/error-guards';
import { getOverview, parseOverviewPeriod } from '../../services/overviewService';
import { z } from 'zod';

const branchSchema = z.object({
  name: z.string().min(1, 'Nama ranting wajib diisi'),
  code: z.string().min(1, 'Kode ranting wajib diisi'),
});

const dukuhSchema = z.object({
  name: z.string().min(1, 'Nama dukuh wajib diisi'),
});

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
      const body = branchSchema.parse(request.body);
      const { name, code } = body;

      if (!user.districtId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Admin tidak memiliki ID Kecamatan di profilnya');
      }

      const [newBranch] = await db.insert(schema.branches).values({
        name: name.toUpperCase(),
        code: code.toUpperCase(),
        districtId: user.districtId
      }).returning();

      request.auditContext = { newData: newBranch };
      return sendSuccess(reply, newBranch);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      if (getPostgresError(error)?.code === '23505') {
        return sendError(reply, 400, 'DUPLICATE_CODE', 'Kode ranting sudah digunakan');
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.patch('/branches/:id', kecamatan, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const { id } = request.params as { id: string };
      const body = branchSchema.partial().parse(request.body);
      const { name, code } = body;

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

      if (!updatedBranch) return sendError(reply, 404, 'NOT_FOUND', 'Ranting tidak ditemukan');
      
      // Set audit context
      request.auditContext = {
        oldData: null, // Since we didn't fetch before, we can fetch it first if we want full detail
        newData: updatedBranch
      };

      return sendSuccess(reply, updatedBranch);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.get('/branches/:branchId/dukuhs', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const { branchId } = request.params as { branchId: string };

      // Ownership check
      await assertBranchAccess(user, branchId);

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
      const user = request.currentUser!;
      const { branchId } = request.params as { branchId: string };

      // Ownership check: pastikan branchId milik district user
      await assertBranchAccess(user, branchId);

      const body = dukuhSchema.parse(request.body);
      const { name } = body;

      const [newDukuh] = await db.insert(schema.dukuhs).values({
        name: name.toUpperCase(),
        branchId
      }).returning();

      request.auditContext = { newData: newDukuh };
      return sendSuccess(reply, newDukuh);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.patch('/dukuhs/:id', kecamatan, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const { id } = request.params as { id: string };

      // Ownership check
      await assertDukuhAccess(user, id);

      const body = dukuhSchema.partial().parse(request.body);
      const { name } = body;

      const [updatedDukuh] = await db.update(schema.dukuhs)
        .set({ name: name?.toUpperCase(), updatedAt: new Date() })
        .where(eq(schema.dukuhs.id, id))
        .returning();

      if (!updatedDukuh) return sendError(reply, 404, 'NOT_FOUND', 'Dukuh tidak ditemukan');

      return sendSuccess(reply, updatedDukuh);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  /**
   * Overview kecamatan.
   *
   * - Scope agregat: seluruh ranting pada `user.districtId`.
   * - `branch_id` opsional, WAJIB milik kecamatan pengguna (dicek ke tabel branches).
   * - Seluruh agregasi dikerjakan di SQL oleh overviewService (kontrak sama dengan
   *   endpoint ranting). Tidak ada lagi `findMany().then(rows => rows.filter(...))`
   *   dan tidak ada pengelompokan nominal berdasarkan ranting petugas.
   */
  fastify.get('/district/dashboard', kecamatan, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const districtId = user.districtId;
      if (!districtId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan admin kecamatan');
      }

      const query = request.query as { branch_id?: string; year?: string; months?: string };
      let branchId: string | undefined;
      let branchName: string | undefined;

      if (query.branch_id) {
        const branch = await db.query.branches.findFirst({
          where: eq(schema.branches.id, query.branch_id),
          columns: { id: true, name: true, districtId: true },
        });
        if (!branch || branch.districtId !== districtId) {
          return sendError(reply, 403, 'FORBIDDEN_SCOPE', 'Ranting bukan bagian dari kecamatan Anda');
        }
        branchId = branch.id;
        branchName = branch.name;
      }

      const now = new Date();
      const period = parseOverviewPeriod(query.year, query.months);
      if (!period) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Parameter year/months tidak valid');
      }

      const data = await getOverview(
        branchId ? { districtId, branchId } : { districtId },
        period,
        {
          scopeType: branchId ? 'branch' : 'district',
          branchName,
          includeBranchComparison: !branchId,
        },
      );

      return sendSuccess(reply, data);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.delete('/branches/:id', kecamatan, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const { id } = request.params as { id: string };

      // Ownership check
      await assertBranchAccess(user, id);

      // Check if branch has any dukuhs
      const dukuhsCount = await db.$count(schema.dukuhs, eq(schema.dukuhs.branchId, id));
      if (Number(dukuhsCount) > 0) {
        return sendError(reply, 400, 'HAS_DEPENDENCY', 'Ranting tidak bisa dihapus karena masih memiliki data dukuh terkait');
      }

      // Check if branch has any cans
      const cansCount = await db.$count(schema.cans, eq(schema.cans.branchId, id));
      if (Number(cansCount) > 0) {
        return sendError(reply, 400, 'HAS_DEPENDENCY', 'Ranting tidak bisa dihapus karena masih memiliki data kaleng terkait');
      }

      // Check if branch has any officers
      const officersCount = await db.$count(schema.officers, eq(schema.officers.branchId, id));
      if (Number(officersCount) > 0) {
        return sendError(reply, 400, 'HAS_DEPENDENCY', 'Ranting tidak bisa dihapus karena masih memiliki data petugas terkait');
      }

      const [branchToDelete] = await db.select().from(schema.branches).where(eq(schema.branches.id, id));
      const deleted = await db.delete(schema.branches)
        .where(eq(schema.branches.id, id))
        .returning();

      if (deleted.length === 0) return sendError(reply, 404, 'NOT_FOUND', 'Ranting tidak ditemukan');

      request.auditContext = {
        oldData: branchToDelete,
        newData: null
      };

      return sendSuccess(reply, { message: 'Ranting berhasil dihapus' });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
