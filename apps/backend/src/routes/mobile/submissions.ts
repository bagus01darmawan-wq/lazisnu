import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { isAppError } from '../../utils/AppError';
import { countersignBranchSchema, forceFinalizePpkSchema, reopenSubmissionSchema, signSubmissionSchema } from './schemas';
import {
  ensurePpkSubmission,
  toPpkResponse,
} from '../../services/ppkSubmissions';
import {
  countersignBranchSubmission,
  countersignPpkSubmission,
  forceFinalizePpkSubmission,
  getBaDownload,
  getBranchBeritaAcara,
  getPpkBeritaAcara,
  signPpkSubmission,
  type RequestContext,
} from '../../services/cosign';
import { listPpkBaVersions } from '../../services/baPdfService';
import { reopenPpkSubmission } from '../../services/reopen';

function actorOf(request: FastifyRequest) {
  const user = request.currentUser!;
  return {
    userId: user.userId,
    role: user.role,
    branchId: user.branchId ?? null,
    districtId: user.districtId ?? null,
    officerId: user.officerId ?? null,
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

export async function submissionsRoutes(fastify: FastifyInstance) {
  // GET /mobile/submissions?year=&month= — setoran PPK miliknya (hitung ulang
  // otomatis selama DRAFT; baris FINAL beku).
  fastify.get('/submissions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const officerId = user.officerId;
      if (!officerId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan akun petugas');
      }
      const query = request.query as { year?: string; month?: string };
      const now = new Date();
      const year = query.year ? z.coerce.number().int().min(2020).max(2100).parse(query.year) : now.getFullYear();
      const month = query.month ? z.coerce.number().int().min(1).max(12).parse(query.month) : now.getMonth() + 1;

      const officer = await db.query.officers.findFirst({
        where: eq(schema.officers.id, officerId),
        columns: { id: true, branchId: true },
      });
      if (!officer) {
        return sendError(reply, 403, 'FORBIDDEN', 'Petugas tidak ditemukan');
      }
      const sub = await ensurePpkSubmission(officerId, officer.branchId, year, month);
      return sendSuccess(reply, toPpkResponse(sub));
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // POST /mobile/submissions/:id/sign — PPK menandatangani di HP-nya.
  // signer_id = pemilik sesi (bukan dari body — jebakan T5 #1).
  fastify.post(
    '/submissions/:id/sign',
    { preHandler: [authorize('PETUGAS')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const body = signSubmissionSchema.parse(request.body);
        const result = await signPpkSubmission(actorOf(request), {
          submissionId: id,
          signaturePng: body.signature_png,
          consent: body.consent,
          expectedVersion: body.expected_version,
        }, ctxOf(request));
        return sendSuccess(reply, result);
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );

  // POST /mobile/submissions/:id/countersign — bendahara ranting (STAF_KEUANGAN
  // seranting) menandatangani di HP-nya → FINAL bila lengkap, atau PPK_SIGNED.
  fastify.post(
    '/submissions/:id/countersign',
    { preHandler: [authorize('STAF_KEUANGAN')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const body = signSubmissionSchema.parse(request.body);
        const result = await countersignPpkSubmission(actorOf(request), {
          submissionId: id,
          signaturePng: body.signature_png,
          consent: body.consent,
          expectedVersion: body.expected_version,
        }, ctxOf(request));
        return sendSuccess(reply, result);
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );

  // POST /mobile/submissions/:id/force-finalize — Admin Ranting pemilik,
  // mensyaratkan PPK_SIGNED + kedua TTD (force menimpa gerbang ACTIVE saja).
  fastify.post(
    '/submissions/:id/force-finalize',
    { preHandler: [authorize('ADMIN_RANTING')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const body = forceFinalizePpkSchema.parse(request.body);
        const result = await forceFinalizePpkSubmission(actorOf(request), {
          submissionId: id,
          forceReason: body.force_reason,
          expectedVersion: body.expected_version,
        }, ctxOf(request));
        return sendSuccess(reply, result);
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );

  // POST /mobile/submissions/:id/reopen — C1-T7 (§14.8): Admin Ranting
  // pemilik / MWC membuka FINAL → DRAFT (menular ke ranting) + jendela 48 jam.
  fastify.post(
    '/submissions/:id/reopen',
    { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const body = reopenSubmissionSchema.parse(request.body);
        const result = await reopenPpkSubmission(actorOf(request), {
          submissionId: id,
          reason: body.reason,
          expectedVersion: body.expected_version,
        }, new Date());
        return sendSuccess(reply, result);
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );

  // POST /mobile/branch-submissions/:id/countersign — Bendahara MWC
  // (STAF_KEUANGAN sedistrik) → FINAL / FINAL_NOL.
  fastify.post(
    '/branch-submissions/:id/countersign',
    { preHandler: [authorize('STAF_KEUANGAN')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const body = countersignBranchSchema.parse(request.body);
        const result = await countersignBranchSubmission(actorOf(request), {
          submissionId: id,
          signaturePng: body.signature_png,
          consent: body.consent,
          expectedVersion: body.expected_version,
        }, ctxOf(request));
        return sendSuccess(reply, result);
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );

  // GET /mobile/submissions/:id/berita-acara — teks readable dari snapshot.
  fastify.get(
    '/submissions/:id/berita-acara',
    { preHandler: [authorize('PETUGAS', 'STAF_KEUANGAN', 'ADMIN_RANTING', 'ADMIN_KECAMATAN')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        return sendSuccess(reply, await getPpkBeritaAcara(actorOf(request), id));
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );

  // GET /mobile/submissions/:id/pdf — unduh BA (FINAL saja; lazy + audit).
  fastify.get(
    '/submissions/:id/pdf',
    {
      preHandler: [authorize('PETUGAS', 'STAF_KEUANGAN', 'ADMIN_RANTING', 'ADMIN_KECAMATAN')],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        return sendSuccess(reply, await getBaDownload(actorOf(request), 'ppk', id, ctxOf(request)));
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );

  // GET /mobile/submissions/:id/pdf-versions — C1-T9 (H3 review-T7): riwayat
  // versi BA (live + arsip). Gerbang baca = gerbang berita-acara (scope sama).
  fastify.get(
    '/submissions/:id/pdf-versions',
    { preHandler: [authorize('PETUGAS', 'STAF_KEUANGAN', 'ADMIN_RANTING', 'ADMIN_KECAMATAN')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        await getPpkBeritaAcara(actorOf(request), id);
        return sendSuccess(reply, await listPpkBaVersions(id));
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );
}
