import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { and, eq } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { assertBranchAccess } from '../../middleware/ownership';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { isAppError } from '../../utils/AppError';
import { finalizeBranchSchema } from './schemas';
import {
  ensureBranchSubmission,
  finalizeBranchSubmission,
  toBranchResponse,
} from '../../services/ppkSubmissions';

// C1-T4: Kunci Ranting = Manager Subarea. Orkestrasi berlapis MWC + FINAL_NOL
// massal = T6 (memakai service finalize di bawah).
const rantingOnly = { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')] };

export async function branchSubmissionsRoutes(fastify: FastifyInstance) {
  // GET /v1/admin/branch-submissions?year=&month= — daftar scope-nya.
  fastify.get('/branch-submissions', rantingOnly, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const query = request.query as { year?: string; month?: string };
      const now = new Date();
      const year = query.year ? z.coerce.number().int().min(2020).max(2100).parse(query.year) : now.getFullYear();
      const month = query.month ? z.coerce.number().int().min(1).max(12).parse(query.month) : now.getMonth() + 1;

      // Daftar branch dalam scope: ranting → miliknya; kecamatan → sedistrik.
      let branchIds: string[];
      if (user.role === 'ADMIN_RANTING' && user.branchId) {
        branchIds = [user.branchId];
      } else if (user.role === 'ADMIN_KECAMATAN' && user.districtId) {
        const rows = await db.select({ id: schema.branches.id }).from(schema.branches).where(eq(schema.branches.districtId, user.districtId));
        branchIds = rows.map((r) => r.id);
      } else {
        return sendError(reply, 403, 'FORBIDDEN', 'Tidak punya akses');
      }

      const out: ReturnType<typeof toBranchResponse>[] = [];
      for (const branchId of branchIds) {
        const sub = await ensureBranchSubmission(branchId, year, month);
        out.push(toBranchResponse(sub));
      }
      return sendSuccess(reply, out);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // GET /v1/admin/branch-submissions/:id — rincian + penyusun PPK.
  fastify.get('/branch-submissions/:id', rantingOnly, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const { id } = request.params as { id: string };
      const sub = await db.query.branchSubmissions.findFirst({
        where: eq(schema.branchSubmissions.id, id),
      });
      if (!sub) {
        return sendError(reply, 404, 'VALIDATION_ERROR', 'Setoran ranting tidak ditemukan');
      }
      await assertBranchAccess(
        { userId: user.userId, role: user.role, branchId: user.branchId, districtId: user.districtId },
        sub.branchId,
      );
      const ensured = await ensureBranchSubmission(sub.branchId, sub.periodYear, sub.periodMonth);
      const ppks = await db.query.ppkSubmissions.findMany({
        where: and(
          eq(schema.ppkSubmissions.branchId, sub.branchId),
          eq(schema.ppkSubmissions.periodYear, sub.periodYear),
          eq(schema.ppkSubmissions.periodMonth, sub.periodMonth),
        ),
        with: { officer: { columns: { fullName: true } } },
      });
      return sendSuccess(reply, {
        ...toBranchResponse(ensured.status === 'DRAFT' ? ensured : sub),
        ppk_penyusun: ppks.map((p) => ({
          officer_name: p.officer?.fullName ?? p.officerId,
          total: Number(p.totalAmount),
          status: p.status,
        })),
      });
    } catch (error: unknown) {
      if (isAppError(error)) {
        return sendError(reply, error.statusCode, error.code, error.message, error.details);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // POST /v1/admin/branch-submissions/:id/finalize — Kunci Ranting (T4 mekanik).
  fastify.post(
    '/branch-submissions/:id/finalize',
    { preHandler: [authorize('ADMIN_RANTING')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const body = finalizeBranchSchema.parse(request.body);
        const user = request.currentUser!;
        const result = await finalizeBranchSubmission(
          {
            userId: user.userId,
            role: user.role,
            branchId: user.branchId ?? null,
            districtId: user.districtId ?? null,
          },
          {
            submissionId: id,
            shareMwc: body.share_mwc,
            varianceReason: body.variance_reason,
            linkedPeriods: body.linked_periods,
            rantingSignerId: body.ranting_signer_id,
            mwcBendaharaSignerId: body.mwc_bendahara_signer_id,
            expectedVersion: body.expected_version,
            asNol: body.as_nol,
          },
        );
        return sendSuccess(reply, result);
      } catch (error: unknown) {
        if (isAppError(error)) {
          return sendError(reply, error.statusCode, error.code, error.message, error.details);
        }
        if (error instanceof z.ZodError) {
          return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
        }
        return sendInternalError(reply, error, fastify.log);
      }
    },
  );
}
