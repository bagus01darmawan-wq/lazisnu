import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { isAppError } from '../../utils/AppError';
import { finalizePpkSchema } from './schemas';
import {
  ensurePpkSubmission,
  finalizePpkSubmission,
  toPpkResponse,
} from '../../services/ppkSubmissions';

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

  // POST /mobile/submissions/:id/finalize — kunci setoran (PPK/bendahara/admin).
  // Upacara co-sign per sesi + PDF = T5; di sini gerbang FINAL-nya (T4).
  fastify.post(
    '/submissions/:id/finalize',
    { preHandler: [authorize('PETUGAS', 'STAF_KEUANGAN', 'ADMIN_RANTING')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const body = finalizePpkSchema.parse(request.body);
        const user = request.currentUser!;
        const result = await finalizePpkSubmission(
          {
            userId: user.userId,
            role: user.role,
            branchId: user.branchId ?? null,
            districtId: user.districtId ?? null,
            officerId: user.officerId ?? null,
          },
          {
            submissionId: id,
            ppkSignerId: body.ppk_signer_id,
            bendaharaSignerId: body.bendahara_signer_id,
            expectedVersion: body.expected_version,
            forceReason: body.force_reason,
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
