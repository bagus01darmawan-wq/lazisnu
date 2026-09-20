import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { isAppError } from '../../utils/AppError';
import {
  approveDraft,
  deleteDraftItem,
  getDraftDetail,
  listDrafts,
  updateDraftItem,
  type DraftActor,
} from '../../services/periodDrafts';
import { updateDraftItemSchema } from './schemas';

// C1-T3 (§14.12–14.13): draft hanya dikelola Staf Bid. Pengumpulan (siapkan/
// edit/setujui) dan Staf Bid. Keuangan (setujui eskalasi 24 jam). Izin FINAL/
// kunci tetap milik Manager (T4/T6) — bukan di sini.
const stafOnly = { preHandler: [authorize('STAF_PENGUMPULAN', 'STAF_KEUANGAN')] };

function actorOf(request: FastifyRequest): DraftActor {
  const user = request.currentUser!;
  return {
    userId: user.userId,
    role: user.role,
    branchId: user.branchId ?? null,
    districtId: user.districtId ?? null,
  };
}

function sendAppError(reply: FastifyReply, error: unknown) {
  if (isAppError(error)) {
    return sendError(reply, error.statusCode, error.code, error.message, error.details);
  }
  if (error instanceof z.ZodError) {
    return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
  }
  return sendInternalError(reply, error);
}

export async function periodDraftsRoutes(fastify: FastifyInstance) {
  // GET /v1/admin/period-drafts?year=&month= — daftar draft scope-nya
  // (rantingnya / program MWC distriknya) + hitung item + status eskalasi.
  fastify.get('/period-drafts', stafOnly, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { year?: string; month?: string };
      const filter: { year?: number; month?: number } = {};
      if (query.year !== undefined) {
        const year = z.coerce.number().int().min(2020).max(2100).parse(query.year);
        filter.year = year;
      }
      if (query.month !== undefined) {
        const month = z.coerce.number().int().min(1).max(12).parse(query.month);
        filter.month = month;
      }
      return sendSuccess(reply, await listDrafts(actorOf(request), filter));
    } catch (error) {
      return sendAppError(reply, error);
    }
  });

  // GET /v1/admin/period-drafts/:id — rincian draft + item (kaleng → petugas).
  fastify.get('/period-drafts/:id', stafOnly, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      return sendSuccess(reply, await getDraftDetail(actorOf(request), id));
    } catch (error) {
      return sendAppError(reply, error);
    }
  });

  // POST /v1/admin/period-drafts/:id/approve — setujui → tugas aktif (sekali).
  fastify.post('/period-drafts/:id/approve', stafOnly, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      return sendSuccess(reply, await approveDraft(actorOf(request), id));
    } catch (error) {
      return sendAppError(reply, error);
    }
  });

  // PATCH /v1/admin/period-drafts/items/:itemId — ganti petugas (DRAFT saja).
  fastify.patch('/period-drafts/items/:itemId', stafOnly, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { itemId } = request.params as { itemId: string };
      const body = updateDraftItemSchema.parse(request.body);
      return sendSuccess(reply, await updateDraftItem(actorOf(request), itemId, { officerId: body.officer_id }));
    } catch (error) {
      return sendAppError(reply, error);
    }
  });

  // DELETE /v1/admin/period-drafts/items/:itemId — keluarkan kaleng dari draft.
  fastify.delete('/period-drafts/items/:itemId', stafOnly, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { itemId } = request.params as { itemId: string };
      return sendSuccess(reply, await deleteDraftItem(actorOf(request), itemId));
    } catch (error) {
      return sendAppError(reply, error);
    }
  });
}
