import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import { getRoleScope } from '../../utils/role-scope';
import { getPaginationParams, formatPaginatedResponse } from '../../utils/pagination';
import { assertBranchAccess } from '../../middleware/ownership';
import { ALL_REASON_CODES, CONDITION_LABELS } from '../../services/conditionRules';
import {
  approveConditionProposal,
  createConditionProposal,
  evaluateEmptyStreakForScope,
  rejectConditionProposal,
} from '../../services/conditionProposalService';

const rantingOrKec = { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')] };

const conditionEnum = z.enum(['AKTIF', 'NON_AKTIF', 'RUSAK', 'HILANG', 'DIKEMBALIKAN']);
const reasonCodeSchema = z.string().refine((v) => ALL_REASON_CODES.includes(v), {
  message: 'Kode alasan tidak dikenal',
});

/**
 * Usulan perubahan kondisi kaleng (fase operasional).
 *
 * Otorisasi:
 * - daftar dibatasi scope peran lewat `getRoleScope` pada tabel `cans`;
 * - persetujuan/penolakan memeriksa kepemilikan di service (`assertCanAccess`),
 *   jadi admin tidak bisa menyetujui kaleng di luar wilayahnya walau ID-nya diketahui.
 */
export async function canProposalsRoutes(fastify: FastifyInstance) {
  fastify.get('/can-proposals', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const query = request.query as { status?: string; page?: string; limit?: string };
      const { page, limit, offset } = getPaginationParams(query);
      const status = query.status ?? 'PENDING';

      const roleScope = await getRoleScope(user, schema.cans);

      const conditions: any[] = [];
      if (roleScope) conditions.push(roleScope);
      if (status !== 'ALL') conditions.push(eq(schema.canConditionProposals.status, status));
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, total] = await Promise.all([
        db.select({
          id: schema.canConditionProposals.id,
          canId: schema.canConditionProposals.canId,
          fromCondition: schema.canConditionProposals.fromCondition,
          toCondition: schema.canConditionProposals.toCondition,
          triggerSource: schema.canConditionProposals.triggerSource,
          reasonCode: schema.canConditionProposals.reasonCode,
          reasonNote: schema.canConditionProposals.reasonNote,
          evidenceCount: schema.canConditionProposals.evidenceCount,
          status: schema.canConditionProposals.status,
          approvedAt: schema.canConditionProposals.approvedAt,
          createdAt: schema.canConditionProposals.createdAt,
          can: {
            qrCode: schema.cans.qrCode,
            ownerName: schema.cans.ownerName,
            branchId: schema.cans.branchId,
            condition: schema.cans.condition,
          },
          branchName: schema.branches.name,
        })
          .from(schema.canConditionProposals)
          .innerJoin(schema.cans, eq(schema.canConditionProposals.canId, schema.cans.id))
          .innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
          .where(whereClause)
          .orderBy(desc(schema.canConditionProposals.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: schema.canConditionProposals.id })
          .from(schema.canConditionProposals)
          .innerJoin(schema.cans, eq(schema.canConditionProposals.canId, schema.cans.id))
          .where(whereClause)
          .then((res) => res.length),
      ]);

      return sendSuccess(reply, formatPaginatedResponse(rows, total, page, limit, 'proposals'));
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/can-proposals', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const body = z.object({
        can_id: z.string().uuid(),
        to_condition: conditionEnum,
        reason_code: reasonCodeSchema,
        reason_note: z.string().max(500).optional().nullable(),
      }).parse(request.body);

      // Usulan manual tetap harus berada di scope admin.
      const can = await db.query.cans.findFirst({
        where: eq(schema.cans.id, body.can_id),
        columns: { id: true, branchId: true },
      });
      if (!can) return sendError(reply, 404, 'NOT_FOUND', 'Kaleng tidak ditemukan');

      if (user.role === 'ADMIN_RANTING') {
        if (can.branchId !== user.branchId) {
          return sendError(reply, 403, 'FORBIDDEN_SCOPE', 'Kaleng bukan milik ranting Anda');
        }
      } else {
        const branch = await db.query.branches.findFirst({
          where: eq(schema.branches.id, can.branchId),
          columns: { districtId: true },
        });
        if (!branch || branch.districtId !== user.districtId) {
          return sendError(reply, 403, 'FORBIDDEN_SCOPE', 'Kaleng bukan bagian dari kecamatan Anda');
        }
      }

      const proposal = await createConditionProposal({
        canId: body.can_id,
        toCondition: body.to_condition,
        triggerSource: 'MANUAL',
        reasonCode: body.reason_code,
        reasonNote: body.reason_note ?? null,
      });

      if (!proposal) {
        return sendError(reply, 409, 'NO_TRANSITION', 'Kondisi kaleng sudah sama dengan tujuan usulan');
      }

      request.auditContext = { newData: proposal };
      return sendSuccess(reply, proposal, 201);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      if (error instanceof AppError) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/can-proposals/:id/approve', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const { id } = request.params as { id: string };
      const body = z.object({ reason_note: z.string().max(500).optional().nullable() })
        .parse(request.body ?? {});

      const result = await approveConditionProposal(id, user, body.reason_note ?? null);

      request.auditContext = {
        oldData: { proposal_id: id, condition: result.from_condition },
        newData: { proposal_id: id, condition: result.to_condition },
      };
      return sendSuccess(reply, { ...result, condition_label: CONDITION_LABELS[result.to_condition] });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      if (error instanceof AppError) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/can-proposals/:id/reject', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const { id } = request.params as { id: string };
      const body = z.object({ reason_note: z.string().max(500).optional().nullable() })
        .parse(request.body ?? {});

      const updated = await rejectConditionProposal(id, user, body.reason_note ?? null);

      request.auditContext = { oldData: { status: 'PENDING' }, newData: updated };
      return sendSuccess(reply, updated);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      if (error instanceof AppError) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  /**
   * Evaluasi ambang "enam penjemputan kosong" untuk scope admin, dipicu manual.
   * Penjadwalan otomatis belum dinyalakan — keputusan penjadwalan ada di fase rilis.
   */
  fastify.post('/can-proposals/evaluate-empty-streak', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const body = z.object({
        branch_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      }).parse(request.body ?? {});

      let branchId: string | undefined;
      if (user.role === 'ADMIN_RANTING') {
        if (!user.branchId) return sendError(reply, 403, 'FORBIDDEN', 'Bukan admin ranting');
        if (body.branch_id && body.branch_id !== user.branchId) {
          return sendError(reply, 403, 'FORBIDDEN_SCOPE', 'Ranting di luar akses Anda');
        }
        branchId = user.branchId;
      } else if (body.branch_id) {
        await assertBranchAccess(user, body.branch_id);
        branchId = body.branch_id;
      }

      if (!user.districtId) return sendError(reply, 403, 'FORBIDDEN', 'Akun tanpa kecamatan');

      const result = await evaluateEmptyStreakForScope(
        branchId ? { districtId: user.districtId, branchId } : { districtId: user.districtId },
        body.limit ?? 200,
      );

      return sendSuccess(reply, {
        evaluated: result.evaluated,
        proposed_inactive: result.proposed_inactive,
        restored_active: result.restored_active,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      if (error instanceof AppError) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });
}