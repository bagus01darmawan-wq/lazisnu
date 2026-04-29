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
        ilike(schema.cans.qrCode, `%${query.search}%`),
        ilike(schema.cans.dukuh, `%${query.search}%`)
      ) : undefined;

      const roleScope = await getRoleScope(user, schema.cans);

      const whereClause = and(
        roleScope,
        query.branch_id ? eq(schema.cans.branchId, query.branch_id) : undefined,
        searchCondition,
        query.status === 'INACTIVE' ? eq(schema.cans.isActive, false) : eq(schema.cans.isActive, true)
      );

      const [cans, total] = await Promise.all([
        db.query.cans.findMany({
          where: whereClause,
          limit,
          offset,
          orderBy: [desc(schema.cans.createdAt)],
          with: {
            branch: { columns: { name: true } },
            dukuhDetails: { columns: { name: true } },
          }
        }),
        db.select({ count: sql<number>`count(*)` })
          .from(schema.cans)
          .where(whereClause)
          .then(res => Number(res[0].count))
      ]);

      return sendSuccess(reply, formatPaginatedResponse(cans, total, page, limit));
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/cans', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const body = createCanSchema.parse(request.body);
      
      const targetBranchId = (user.role === 'ADMIN_KECAMATAN' ? body.branch_id : user.branchId);
      if (!targetBranchId || !z.string().uuid().safeParse(targetBranchId).success) {
        return sendError(reply, 400, 'INVALID_ID', 'ID Ranting tidak valid');
      }
      
      const branchId = targetBranchId as string;

      const branch = await db.query.branches.findFirst({ where: eq(schema.branches.id, branchId) });
      if (!branch) return sendError(reply, 404, 'NOT_FOUND', 'Ranting tidak ditemukan');

      const regionCode = branch.code || 'XX';
      
      // Auto-generate QR if not provided
      let qrCode = body.qr_code;
      if (!qrCode || qrCode === '') {
        const countRes = await db.select({ count: sql<number>`count(*)` })
          .from(schema.cans)
          .where(eq(schema.cans.branchId, branchId));
          
        const count = Number(countRes[0]?.count || 0);
        // Add a small random suffix to avoid collisions during concurrent tests
        const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        qrCode = `LAZ-${regionCode}-${String(count + 1).padStart(5, '0')}-${suffix}`;
      }

      const inserted = await db.insert(schema.cans).values({
        branchId: branchId,
        dukuhId: (body.dukuh_id && body.dukuh_id !== '') ? body.dukuh_id : null,
        qrCode: qrCode.substring(0, 50),
        ownerName: body.owner_name.substring(0, 100),
        ownerPhone: (body.owner_whatsapp || body.owner_phone || '').substring(0, 20), 
        ownerWhatsapp: (body.owner_whatsapp || body.owner_phone || '0000000000').substring(0, 20),
        ownerAddress: body.owner_address || '', // Fix not-null constraint
        rt: (body.rt || '').substring(0, 10),
        rw: (body.rw || '').substring(0, 10),
        dukuh: (body.owner_address || '').substring(0, 100), 
        latitude: (body.latitude !== undefined && body.latitude !== null) ? body.latitude.toString() : null,
        longitude: (body.longitude !== undefined && body.longitude !== null) ? body.longitude.toString() : null,
      }).returning();
      
      return sendSuccess(reply, inserted[0], 201);
    } catch (error: any) {
      fastify.log.error('Can creation error:', error);
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      // Provide more info in dev if possible, or just log it
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
          branch: { columns: { name: true } },
          dukuhDetails: { columns: { name: true } },
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
        ownerPhone: body.owner_whatsapp || body.owner_phone || existing.ownerPhone, 
        ownerAddress: body.owner_address ?? existing.ownerAddress ?? '',
        ownerWhatsapp: body.owner_whatsapp || existing.ownerWhatsapp || '0000000000',
        dukuhId: body.dukuh_id !== undefined ? (body.dukuh_id === '' ? null : body.dukuh_id) : existing.dukuhId,
        rt: body.rt !== undefined ? body.rt : existing.rt,
        rw: body.rw !== undefined ? body.rw : existing.rw,
        latitude: body.latitude !== undefined ? (body.latitude ? body.latitude.toString() : null) : existing.latitude,
        longitude: body.longitude !== undefined ? (body.longitude ? body.longitude.toString() : null) : existing.longitude,
        locationNotes: body.location_notes !== undefined ? body.location_notes : existing.locationNotes,
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
      const user = request.currentUser!;
      const existing = await db.query.cans.findFirst({ where: eq(schema.cans.id, id) });
      
      if (!existing) {
        return sendError(reply, 404, 'NOT_FOUND', 'Kaleng tidak ditemukan');
      }

      // Role-based access control
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

      if (!can.qrCode) {
        return sendError(reply, 400, 'MISSING_QR', 'Kaleng tidak memiliki nomor QR');
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
