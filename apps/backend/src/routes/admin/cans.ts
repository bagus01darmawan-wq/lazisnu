import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, desc, ilike, or, sql } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import QRCode from 'qrcode';
import { signQRCode } from '../../utils/qr';
import { uploadQRCodePDF } from '../../services/r2';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { getPaginationParams, formatPaginatedResponse } from '../../utils/pagination';
import { getRoleScope } from '../../utils/role-scope';
import { createCanSchema, updateCanSchema } from './schemas';
import { z } from 'zod';

const rantingOrKec = { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')] };

export async function cansRoutes(fastify: FastifyInstance) {
  fastify.get('/cans', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const query = request.query as { page?: string; limit?: string; search?: string; status?: string; branch_id?: string };
      const { page, limit, offset } = getPaginationParams(query);

      const searchCondition = query.search ? or(
        ilike(schema.cans.ownerName, `%${query.search}%`),
        ilike(schema.cans.qrCode, `%${query.search}%`)
      ) : undefined;

      const roleScope = await getRoleScope(user, schema.cans);

      const whereClause = and(
        roleScope,
        query.branch_id ? eq(schema.cans.branchId, query.branch_id) : undefined,
        searchCondition,
        query.status === 'ACTIVE' ? eq(schema.cans.isActive, true) : undefined,
        query.status === 'INACTIVE' ? eq(schema.cans.isActive, false) : undefined
      );

      const [cansRaw, total] = await Promise.all([
        db.query.cans.findMany({
          where: whereClause,
          limit,
          offset,
          orderBy: [desc(schema.cans.createdAt)],
        }),
        db.$count(schema.cans, whereClause),
      ]);

      // Aggressively convert any BigInt to Number for serialization
      const cans = cansRaw.map(can => {
        const formattedCan = { ...can };
        for (const key in formattedCan) {
          if (typeof (formattedCan as any)[key] === 'bigint') {
            (formattedCan as any)[key] = Number((formattedCan as any)[key]);
          }
        }
        return formattedCan;
      });

      return sendSuccess(reply, formatPaginatedResponse(cans, total, page, limit));
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/cans', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const body = createCanSchema.extend({ branch_id: z.string().uuid().optional() }).parse(request.body);
      
      const targetBranchId = (user.role === 'ADMIN_KECAMATAN' ? body.branch_id : user.branchId);
      if (!targetBranchId) {
        return sendError(reply, 400, 'MISSING_BRANCH', 'ID Ranting wajib ditentukan');
      }

      const branch = await db.query.branches.findFirst({ where: eq(schema.branches.id, targetBranchId) });
      if (!branch) return sendError(reply, 404, 'NOT_FOUND', 'Ranting tidak ditemukan');

      const regionCode = branch.code || 'XX';
      
      // Use stable count query instead of db.$count
      const countRes = await db.select({ count: sql<number>`count(*)` })
        .from(schema.cans)
        .where(eq(schema.cans.branchId, targetBranchId));
        
      const count = Number(countRes[0]?.count || 0);
      const qrCode = `LZNU-${regionCode}-${String(count + 1).padStart(5, '0')}`;

      const inserted = await db.insert(schema.cans).values({
        branchId: targetBranchId,
        qrCode,
        ownerName: body.owner_name,
        ownerPhone: body.owner_phone,
        ownerAddress: body.owner_address,
        ownerWhatsapp: body.owner_whatsapp,
        latitude: body.latitude ? body.latitude.toString() : undefined,
        longitude: body.longitude ? body.longitude.toString() : undefined,
        locationNotes: body.location_notes,
      }).returning();
      
      return sendSuccess(reply, inserted[0], 201);
    } catch (error: any) {
      fastify.log.error('Can creation error:', error);
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.get('/cans/:id', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const user = request.currentUser!;
      const can = await db.query.cans.findFirst({
        where: eq(schema.cans.id, id),
        with: {
          collections: {
            orderBy: [desc(schema.collections.collectedAt)],
            limit: 10,
            with: { officer: { columns: { fullName: true } } },
          },
        },
      });

      if (!can) return reply.status(404).send({ success: false, error: { message: 'Kaleng tidak ditemukan' } });

      // Access control
      if (user.role === 'ADMIN_RANTING' && can.branchId !== user.branchId) {
        return reply.status(403).send({ success: false, error: { message: 'Bukan milik ranting ini' } });
      }
      if (user.role === 'ADMIN_KECAMATAN') {
        const branch = await db.query.branches.findFirst({ where: eq(schema.branches.id, can.branchId) });
        if (branch?.districtId !== user.districtId) return reply.status(403).send({ success: false, error: { message: 'Bukan milik kecamatan ini' } });
      }
      return reply.send({ success: true, data: can });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.put('/cans/:id', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = updateCanSchema.parse(request.body);
      const user = request.currentUser!;
      const existing = await db.query.cans.findFirst({ where: eq(schema.cans.id, id) });

      if (!existing) {
        return sendError(reply, 404, 'NOT_FOUND', 'Kaleng tidak ditemukan');
      }

      // Access control berbasis role
      if (user.role === 'ADMIN_RANTING') {
        if (existing.branchId !== user.branchId) {
          return sendError(reply, 403, 'FORBIDDEN', 'Kaleng bukan milik ranting Anda');
        }
      } else if (user.role === 'ADMIN_KECAMATAN') {
        const branch = await db.query.branches.findFirst({ where: eq(schema.branches.id, existing.branchId) });
        if (branch?.districtId !== user.districtId) {
          return sendError(reply, 403, 'FORBIDDEN', 'Kaleng bukan milik kecamatan Anda');
        }
      }

      const updated = await db.update(schema.cans).set({
        ownerName: body.owner_name,
        ownerPhone: body.owner_phone,
        ownerAddress: body.owner_address,
        ownerWhatsapp: body.owner_whatsapp,
        latitude: body.latitude ? body.latitude.toString() : null,
        longitude: body.longitude ? body.longitude.toString() : null,
        locationNotes: body.location_notes,
      }).where(eq(schema.cans.id, id)).returning();
      const can = updated[0];
      return sendSuccess(reply, can);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.delete('/cans/:id', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const existing = await db.query.cans.findFirst({ where: eq(schema.cans.id, id) });
      if (!existing || existing.branchId !== request.currentUser!.branchId) {
        return sendError(reply, 404, 'NOT_FOUND', 'Kaleng tidak ditemukan');
      }
      await db.update(schema.cans).set({ isActive: false }).where(eq(schema.cans.id, id));
      return reply.status(204).send();
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/cans/:id/generate-qr', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const can = await db.query.cans.findFirst({
        where: eq(schema.cans.id, id),
        with: { branch: { columns: { code: true } } },
      });
      if (!can) {
        return sendError(reply, 404, 'NOT_FOUND', 'Kaleng tidak ditemukan');
      }

      const signedToken = signQRCode(can.qrCode);
      const qrDataUrl = await QRCode.toDataURL(signedToken, {
        width: 300, margin: 2, color: { dark: '#000000', light: '#ffffff' },
      });

      let r2SignedUrl: string | undefined;
      try {
        const pngBuffer = await QRCode.toBuffer(signedToken, { type: 'png', width: 300, margin: 2 });
        const branchCode = (can as any).branch?.code || 'XX';
        const r2Result = await uploadQRCodePDF({
          qrCode: can.qrCode,
          branchCode,
          pdfBuffer: pngBuffer,
        });
        r2SignedUrl = r2Result.signedUrl;
      } catch (r2Err) {
        fastify.log.warn({ r2Err }, 'R2 upload gagal, menggunakan base64 fallback');
      }

      return sendSuccess(reply, { 
        qr_code: can.qrCode, 
        signed_token: signedToken,
        qr_image_url: qrDataUrl, 
        print_url: r2SignedUrl || qrDataUrl, 
        r2_url: r2SignedUrl || null,
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
