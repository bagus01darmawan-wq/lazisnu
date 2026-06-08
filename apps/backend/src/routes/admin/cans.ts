import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { getPaginationParams, formatPaginatedResponse } from '../../utils/pagination';
import { createCanSchema, updateCanSchema } from './schemas';
import { z } from 'zod';
import { AppError } from '../../utils/AppError';
import * as canService from '../../services/canService';
import { generateSingleQRPDF, generateBatchQRPDF } from '../../services/qrPdfService';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { inArray } from 'drizzle-orm';
import { getSignedDownloadUrl } from '../../services/r2';

const rantingOrKec = { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')] };

export async function cansRoutes(fastify: FastifyInstance) {
  fastify.get('/cans', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const query = request.query as { page?: string; limit?: string; search?: string; status?: string; branch_id?: string };
      const { page, limit, offset } = getPaginationParams(query);

      const { cans, total } = await canService.getCans({
        page, limit, offset, search: query.search, status: query.status, branch_id: query.branch_id
      }, user);

      return sendSuccess(reply, formatPaginatedResponse(cans, total, page, limit, 'cans'));
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/cans', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const body = createCanSchema.parse(request.body);

      const newCan = await canService.createCan(body, user);

      request.auditContext = { newData: newCan };
      return sendSuccess(reply, newCan, 201);
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

  fastify.get('/cans/:id', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const user = request.currentUser!;
      
      const can = await canService.getCanDetail(id, user);

      return sendSuccess(reply, can);
    } catch (error) {
      if (error instanceof AppError) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.put('/cans/:id', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = updateCanSchema.parse(request.body);
      const user = request.currentUser!;
      
      const { can, oldData } = await canService.updateCan(id, body, user);

      request.auditContext = {
        oldData,
        newData: can
      };
      return sendSuccess(reply, can);
    } catch (error) {
       if (error instanceof AppError) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.delete('/cans/:id', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const user = request.currentUser!;
      const { permanent } = request.query as { permanent?: string };

      const { deleted, oldData, newData } = await canService.deleteCan(id, permanent === 'true', user);

      request.auditContext = {
        oldData,
        newData: deleted ? null : newData
      };
      
      return sendSuccess(reply, null);
    } catch (error) {
      if (error instanceof AppError) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/cans/:id/generate-qr', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      
      const result = await generateSingleQRPDF(id);

      return sendSuccess(reply, result);
    } catch (error) {
      if (error instanceof AppError) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/cans/bulk', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const { branch_id, items } = request.body as {
        branch_id: string;
        items: Array<{
          owner_name: string;
          owner_whatsapp: string;
          dukuh_id?: string;
          rt?: string;
          rw?: string;
          qr_code?: string;
        }>
      };

      if (!branch_id) return sendError(reply, 400, 'MISSING_BRANCH', 'ID Ranting wajib disertakan');
      if (!items || !Array.isArray(items) || items.length === 0) {
        return sendError(reply, 400, 'INVALID_ITEMS', 'Data kaleng kosong');
      }

      const inserted = await canService.createBulkCans(branch_id, items, user);

      request.auditContext = { newData: inserted };
      return sendSuccess(reply, { count: inserted.length });
    } catch (error) {
      if (error instanceof AppError) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/cans/bulk-delete', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const { ids, permanent } = request.body as { ids: string[], permanent?: boolean };

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return sendError(reply, 400, 'INVALID_IDS', 'Daftar ID tidak boleh kosong');
      }

      const result = await canService.deleteBulkCans(ids, permanent || false, user);

      return sendSuccess(reply, result);
    } catch (error) {
      if (error instanceof AppError) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/cans/bulk-generate-qr', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const { ids } = request.body as { ids: string[] };

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return sendError(reply, 400, 'INVALID_IDS', 'Daftar ID kaleng tidak boleh kosong');
      }

      if (ids.length > 500) {
        return sendError(reply, 400, 'PAYLOAD_TOO_LARGE', 'Maksimal 500 kaleng per request. Silakan batch request Anda agar tidak menyebabkan server timeout.');
      }

      // First retrieve the cans data

      const cans = await db.query.cans.findMany({
        where: inArray(schema.cans.id, ids),
        with: { branch: { columns: { code: true } }, dukuhDetails: { columns: { name: true } } },
      });

      if (cans.length === 0) {
        return sendError(reply, 404, 'NOT_FOUND', 'Kaleng tidak ditemukan');
      }

      // Check role access
      if (user.role === 'ADMIN_RANTING') {
        const unauthorized = cans.some(c => c.branchId !== user.branchId);
        if (unauthorized) return sendError(reply, 403, 'FORBIDDEN', 'Beberapa kaleng bukan milik ranting Anda');
      }

      const mappedCans = cans.map(c => ({
        qrCode: c.qrCode,
        ownerName: c.ownerName,
        dukuhName: c.dukuhDetails?.name || c.dukuh,
        rt: c.rt,
        rw: c.rw
      }));

      const branchCode = cans[0].branch?.code || 'XX';
      
      const { pdfBuffer, r2Key } = await generateBatchQRPDF(mappedCans, branchCode);
      
      let printUrl = '';
      if (r2Key) {
        printUrl = await getSignedDownloadUrl(r2Key) || '';
      }
      
      if (!printUrl) {
        printUrl = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
      }

      return sendSuccess(reply, {
        count: cans.length,
        print_url: printUrl
      });
    } catch (error) {
       if (error instanceof AppError) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
