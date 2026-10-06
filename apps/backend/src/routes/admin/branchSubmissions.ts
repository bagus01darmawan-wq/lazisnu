import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { assertBranchAccess } from '../../middleware/ownership';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { isAppError } from '../../utils/AppError';
import { signBranchSchema, reopenBranchSchema } from './schemas';
import {
  ensureBranchSubmission,
  toBranchResponse,
} from '../../services/ppkSubmissions';
import {
  deleteBaPdf,
  generateBaPdf,
  getBaDownload,
  getBranchBeritaAcara,
  signBranchSubmission,
  type RequestContext,
} from '../../services/cosign';
import { reopenBranchSubmission } from '../../services/reopen';
import { listBranchBaVersions } from '../../services/baPdfService';

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

      // Nama ranting diambil sekali untuk semua baris. Tanpa ini MWC melihat
      // beberapa baris periode yang sama tanpa pembeda — `toBranchResponse`
      // hanya memuat `branch_id`, bukan nama.
      const branchRows = await db
        .select({ id: schema.branches.id, name: schema.branches.name })
        .from(schema.branches)
        .where(inArray(schema.branches.id, branchIds));
      const nameOf = new Map<string, string>();
      for (const b of branchRows) nameOf.set(b.id, b.name);

      const out: (ReturnType<typeof toBranchResponse> & { branch_name: string | null })[] = [];
      for (const branchId of branchIds) {
        const sub = await ensureBranchSubmission(branchId, year, month);
        out.push({ ...toBranchResponse(sub), branch_name: nameOf.get(branchId) ?? null });
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

  // POST /v1/admin/branch-submissions/:id/sign — Bendahara Ranting pemilik
  // menandatangani di sesinya (+ angka T4); status tetap DRAFT menunggu MWC.
  // signer_id = pemilik sesi (bukan body).
  // Koreksi Pion 23 Sep 2026: BUKAN Admin Ranting. Bendahara Ranting =
  // STAF_KEUANGAN bercakupan ranting (sama dengan peng-counter-sign BA PPK).
  // Prasyarat semua PPK FINAL ditegakkan di service.
  fastify.post(
    '/branch-submissions/:id/sign',
    { preHandler: [authorize('STAF_KEUANGAN')] },
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

  // POST /v1/admin/branch-submissions/:id/reopen — C1-T7 (§14.8): Admin
  // Ranting pemilik / MWC membuka FINAL/FINAL_NOL → DRAFT + jendela 48 jam.
  fastify.post(
    '/branch-submissions/:id/reopen',
    { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const body = reopenBranchSchema.parse(request.body);
        const result = await reopenBranchSubmission(actorOf(request), {
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

  // GET /v1/admin/branch-submissions/:id/pdf-versions — C1-T9 (H3 review-T7):
  // riwayat versi BA (live + arsip). Gerbang baca = gerbang berita-acara.
  fastify.get(
    '/branch-submissions/:id/pdf-versions',
    baReadRoles,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        await getBranchBeritaAcara(actorOf(request), id);
        return sendSuccess(reply, await listBranchBaVersions(id));
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );

  // POST /v1/admin/branch-submissions/:id/pdf/generate
  // Permintaan Pion 23 Sep 2026: pisahkan Generate dari Unduh. Web hanya
  // menampilkan laporan BA yang sudah terbit; tombol Unduh **nonaktif** sampai
  // Generate ditekan. Idempoten — generate ulang tidak menumpuk berkas.
  fastify.post(
    '/branch-submissions/:id/pdf/generate',
    {
      ...baReadRoles,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        return sendSuccess(reply, await generateBaPdf(actorOf(request), 'branch', id, ctxOf(request)));
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );

  // DELETE /v1/admin/branch-submissions/:id/pdf
  // Permintaan Pion 23 Sep 2026: "pdf terhapus otomatis begitu modal ditutup".
  // Mengosongkan `pdf_url`/`pdf_hash` sekalian (pola reopen) supaya tidak
  // meninggalkan key hantu. `deleted:false` bukan error — berkas mungkin sudah
  // tidak ada / belum pernah di-generate.
  fastify.delete(
    '/branch-submissions/:id/pdf',
    {
      ...baReadRoles,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await deleteBaPdf(actorOf(request), 'branch', id, ctxOf(request));
        if (result.had_pdf && !result.deleted) {
          request.log.warn({ submissionId: id }, 'PDF BA gagal dihapus dari R2 — berkas masih tersimpan');
        }
        return sendSuccess(reply, result);
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );
}
