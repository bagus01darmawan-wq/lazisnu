import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { isAppError } from '../../utils/AppError';
import { deviceTokenSchema } from './schemas';
import {
  getKeuanganInbox,
  getPeriodInfo,
  getStafSummary,
  saveDeviceToken,
} from '../../services/mobileRoles';
import { resolveDisplayPeriod } from '../../services/periodState';
import { currentOperationalPeriod } from '../../utils/operationalTimeZone';

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

function periodOf(request: FastifyRequest): { year: number; month: number } {
  const query = request.query as { year?: string; month?: string };
  const now = currentOperationalPeriod();
  return {
    year: query.year ? z.coerce.number().int().min(2020).max(2100).parse(query.year) : now.year,
    month: query.month ? z.coerce.number().int().min(1).max(12).parse(query.month) : now.month,
  };
}

/**
 * Default periode untuk layar berbasis aksi (mis. Persetujuan staf): pakai
 * `display_period` cakupan pengguna; query eksplisit tetap menang.
 */
async function displayPeriodOf(request: FastifyRequest): Promise<{ year: number; month: number }> {
  const query = request.query as { year?: string; month?: string };
  if (query.year || query.month) return periodOf(request);
  const actor = actorOf(request);
  const display = await resolveDisplayPeriod({
    role: actor.role,
    officerId: actor.officerId ?? undefined,
    branchId: actor.branchId ?? undefined,
    districtId: actor.districtId ?? undefined,
  });
  return display ?? currentOperationalPeriod();
}

function sendAppError(reply: FastifyReply, error: unknown, logger?: { error: (e: unknown) => void }) {
  if (isAppError(error)) {
    return sendError(reply, error.statusCode, error.code, error.message, error.details);
  }
  if (error instanceof z.ZodError) {
    return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.issues);
  }
  return sendInternalError(reply, error, logger);
}

/**
 * C1-T9 — endpoint peran mobile (1 APK, tampil beda per kartu).
 * Penjaga peran ganda: authorize() di route + cek scope di service.
 */
export async function rolesRoutes(fastify: FastifyInstance) {
  // GET /mobile/period-info?year=&month= — batas + status + countdown.
  // Semua peran terautentikasi (chip toleransi & countdown semua kartu).
  fastify.get('/period-info', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { year, month } = periodOf(request);
      return sendSuccess(reply, getPeriodInfo(year, month, new Date()));
    } catch (error: unknown) {
      return sendAppError(reply, error, fastify.log);
    }
  });

  // POST /mobile/device-token — simpan fcm_token milik sendiri (fondasi T11).
  fastify.post('/device-token', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = deviceTokenSchema.parse(request.body);
      const user = request.currentUser!;
      return sendSuccess(reply, await saveDeviceToken(user.userId, body.fcm_token));
    } catch (error: unknown) {
      return sendAppError(reply, error, fastify.log);
    }
  });

  // GET /mobile/staf/ringkasan — Staf Pengumpulan (setuju/monitor).
  fastify.get(
    '/staf/ringkasan',
    { preHandler: [authorize('STAF_PENGUMPULAN')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { year, month } = await displayPeriodOf(request);
        return sendSuccess(reply, await getStafSummary(actorOf(request), year, month, new Date()));
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );

  // GET /mobile/keuangan/inbox — Bendahara/Sekretaris (TTD kedua + unduh).
  fastify.get(
    '/keuangan/inbox',
    { preHandler: [authorize('STAF_KEUANGAN')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { year, month } = periodOf(request);
        return sendSuccess(reply, await getKeuanganInbox(actorOf(request), year, month));
      } catch (error: unknown) {
        return sendAppError(reply, error, fastify.log);
      }
    },
  );
}
