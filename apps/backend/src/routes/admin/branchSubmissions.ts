import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { and, eq } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { assertBranchAccess } from '../../middleware/ownership';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { isAppError } from '../../utils/AppError';
import { signBranchSchema } from './schemas';
import {
  ensureBranchSubmission,
  toBranchResponse,
} from '../../services/ppkSubmissions';
import {
  getBaDownload,
  getBranchBeritaAcara,
  signBranchSubmission,
  type RequestContext,
} from '../../services/cosign';

// C1-T5: Kunci Ranting = upacara sign (Admin Ranting) + countersign (MWC).
// Orkestrasi berlapis MWC + FINAL_NOL massal = T6.
const rantingOnly = { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')] };
const baReadRoles = { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN', 'STAF_KEUANGAN')] };

function actorOf(request: FastifyRequest) {
  const user = request.currentUser!;
  return {
    userId: user.userId,
    role: user.role,
    branchId: user.branchId ?? null,
    districtId: user.districtId ?? null,
  };
}

function ctxOf(request: FastifyRequest): RequestContext {
  return { ipAddress: request.ip, userAgent: request.headers['user-agent'] || null };
}

function sendAppError(reply: FastifyReply, error: unknown, logger?: { error: (e: unknown) => void }) {
  if (isAppError(error)) {
    return sendError(reply, error.statusCode, error.code, error.message, error.details);
  }
  if (error instanceof z.ZodError) {
    return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
  }
  return sendInternalError(reply, error, logger);
}

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

  // POST /v1/admin/branch-submissions/:id/sign — Admin Ranting pemilik
  // menandatangani di sesinya (+ angka T4); status tetap DRAFT menunggu MWC.
  // signer_id = pemilik sesi (bukan body).
  fastify.post(
    '/branch-submissions/:id/sign',
    { preHandler: [authorize('ADMIN_RANTING')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const body = signBranchSchema.parse(request.body);
        const result = await signBranchSubmission(actorOf(request), {
          submissionId: id,
          signaturePng: body.signature_png,
          consent: body.consent,
          expectedVersion: body.expected_version,
          shareMwc: body.share_mwc,
          varianceReason: body.variance_reason,
          linkedPeriods: body.linked_periods,
          asNol: body.as_nol,
        }, ctxOf(request));
        return sendSuccess(reply, result);
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );

  // GET /v1/admin/branch-submissions/:id/berita-acara — teks readable snapshot.
  fastify.get(
    '/branch-submissions/:id/berita-acara',
    baReadRoles,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        return sendSuccess(reply, await getBranchBeritaAcara(actorOf(request), id));
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );

  // GET /v1/admin/branch-submissions/:id/pdf — unduh BA (FINAL/FINAL_NOL saja).
  fastify.get(
    '/branch-submissions/:id/pdf',
    {
      ...baReadRoles,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        return sendSuccess(reply, await getBaDownload(actorOf(request), 'branch', id, ctxOf(request)));
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );
}
