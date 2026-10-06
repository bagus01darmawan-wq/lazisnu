import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { isAppError } from '../../utils/AppError';
import { insertActivityLog } from '../../services/auditLogService';
import { purgeSignatureFile } from '../../services/cosign';
import { purgeSignatureSchema } from './schemas';

// C1-T5 (UU 27/2022): hapus coretan TTD — Admin MWC beralasan + audit.
// Hanya key signatures/… (PDF tak bisa dihapus jalur ini). Catatan: arsip
// hash tetap untuk verifikasi; PDF lama tak bisa di-render ulang identik.
export async function signaturesRoutes(fastify: FastifyInstance) {
  fastify.delete(
    '/signatures',
    { preHandler: [authorize('ADMIN_KECAMATAN')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = purgeSignatureSchema.parse(request.body);
        const user = request.currentUser!;
        const deleted = await purgeSignatureFile(body.key);
        try {
          await insertActivityLog({
            userId: user.userId,
            officerId: null,
            actionType: 'SIGNATURE_PURGED',
            entityType: 'signature_file',
            entityId: null,
            oldData: { key: body.key },
            newData: { reason: body.reason, deleted },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'] || null,
          });
        } catch {
          // Audit tidak boleh menggagalkan hapus yang sah.
        }
        return sendSuccess(reply, { key: body.key, deleted });
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
