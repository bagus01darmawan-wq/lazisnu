import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, desc, ilike, or, sql, inArray } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { getPaginationParams, formatPaginatedResponse } from '../../utils/pagination';
import { getRoleScope } from '../../utils/role-scope';
import { createOfficerSchema, updateOfficerSchema } from './schemas';
import { z } from 'zod';

const rantingOrKec = { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')] };

export async function officersRoutes(fastify: FastifyInstance) {
  fastify.get('/officers', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const query = request.query as any;
      const { page, limit, offset } = getPaginationParams(query);

      const roleScope = await getRoleScope(user, schema.officers);

      const conditions = [roleScope];
      
      if (query.branch_id) {
        conditions.push(eq(schema.officers.branchId, query.branch_id));
      }

      if (query.status === 'NON_ACTIVE' || query.status === 'INACTIVE') {
        conditions.push(eq(schema.officers.isActive, false));
      } else if (query.status === 'ALL') {
        // No isActive filter
      } else {
        // Default: ACTIVE
        conditions.push(eq(schema.officers.isActive, true));
      }

      if (query.search) {
        conditions.push(or(
          ilike(schema.officers.fullName, `%${query.search}%`),
          ilike(schema.officers.employeeCode, `%${query.search}%`)
        ));
      }

      const whereClause = and(...conditions.filter(Boolean));

      const [officers, total] = await Promise.all([
        db.query.officers.findMany({
          where: whereClause, 
          offset, 
          limit, 
          orderBy: [desc(schema.officers.createdAt)],
          with: {
            branch: {
              columns: { name: true }
            }
          },
        }),
        db.$count(schema.officers, whereClause),
      ]);

      return sendSuccess(reply, formatPaginatedResponse(officers, total, page, limit));
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/officers', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const body = createOfficerSchema.extend({ branch_id: z.string().uuid().optional() }).parse(request.body);
      
      const targetBranchId = (user.role === 'ADMIN_KECAMATAN' ? body.branch_id : user.branchId);
      if (!targetBranchId) return sendError(reply, 400, 'MISSING_BRANCH', 'Ranting wajib diisi');

      const branchRes = await db.query.branches.findFirst({ where: eq(schema.branches.id, targetBranchId) });
      if (!branchRes) return sendError(reply, 404, 'NOT_FOUND', 'Ranting tidak ditemukan');

      if (user.role === 'ADMIN_KECAMATAN' && !user.districtId) {
        return sendError(reply, 400, 'MISSING_DISTRICT', 'Data wilayah admin tidak ditemukan. Silakan coba login ulang.');
      }

      const { insertedOfficer } = await db.transaction(async (tx) => {
        const countRes = await tx.select({ count: sql<number>`count(*)` }).from(schema.officers)
          .where(eq(schema.officers.branchId, targetBranchId));
        const count = Number(countRes[0].count);
        const employeeCode = `${branchRes.code || 'XX'}-${String(count + 1).padStart(4, '0')}`;

        const [userRecord] = await tx.insert(schema.users).values({
          email: `${body.phone}@petugas.lazisnu.id`,
          passwordHash: '',
          fullName: body.full_name,
          phone: body.phone,
          role: 'PETUGAS',
          branchId: targetBranchId,
          districtId: user.districtId,
        }).returning();

        const [newOfficer] = await tx.insert(schema.officers).values({
          userId: userRecord.id,
          employeeCode,
          fullName: body.full_name,
          phone: body.phone,
          districtId: user.districtId!,
          branchId: targetBranchId,
        }).returning();

        return { insertedOfficer: newOfficer };
      });
      
      return sendSuccess(reply, insertedOfficer, 201);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      
      // Handle Unique Constraint Violations (Postgres 23505)
      if (error.code === '23505') {
        const detail = error.detail || '';
        let message = 'Data petugas sudah terdaftar';
        
        if (detail.includes('phone')) {
          message = 'Nomor HP sudah terdaftar. Gunakan nomor lain.';
        } else if (detail.includes('email')) {
          message = 'Email (berdasarkan nomor HP) sudah terdaftar.';
        } else if (detail.includes('employee_code')) {
          message = 'Kode petugas sudah terdaftar. Silakan coba simpan kembali.';
        }
        
        return sendError(reply, 400, 'DUPLICATE_ERROR', message);
      }

      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.put('/officers/:id', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const user = request.currentUser!;
      const body = updateOfficerSchema.parse(request.body);
      const existing = await db.query.officers.findFirst({ where: eq(schema.officers.id, id) });
      
      if (!existing) return sendError(reply, 404, 'NOT_FOUND', 'Petugas tidak ditemukan');

      if (user.role === 'ADMIN_RANTING' && existing.branchId !== user.branchId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak');
      }
      if (user.role === 'ADMIN_KECAMATAN' && existing.districtId !== user.districtId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak');
      }
      const [updated] = await db.transaction(async (tx) => {
        const updatedOfficers = await tx.update(schema.officers).set({ 
          fullName: body.full_name ?? existing.fullName, 
          phone: body.phone ?? existing.phone, 
          isActive: body.is_active !== undefined ? body.is_active : existing.isActive
        }).where(eq(schema.officers.id, id)).returning();

        if (body.is_active !== undefined) {
          await tx.update(schema.users).set({ isActive: body.is_active }).where(eq(schema.users.id, existing.userId));
        }

        return updatedOfficers;
      });
      
      // Set audit context for middleware
      request.auditContext = {
        oldData: existing,
        newData: updated
      };
      
      return sendSuccess(reply, updated);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.delete('/officers/:id', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const { permanent } = request.query as { permanent?: string };
      const user = request.currentUser!;
      const existing = await db.query.officers.findFirst({ where: eq(schema.officers.id, id) });

      if (!existing) return sendError(reply, 404, 'NOT_FOUND', 'Petugas tidak ditemukan');

      if (user.role === 'ADMIN_RANTING' && existing.branchId !== user.branchId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak');
      }
      if (user.role === 'ADMIN_KECAMATAN' && existing.districtId !== user.districtId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak');
      }

      if (permanent === 'true') {
        // Deleting the user will cascade delete the officer
        await db.delete(schema.users).where(eq(schema.users.id, existing.userId));
      } else {
        await db.transaction(async (tx) => {
          await tx.update(schema.officers).set({ isActive: false }).where(eq(schema.officers.id, id));
          await tx.update(schema.users).set({ isActive: false }).where(eq(schema.users.id, existing.userId));
        });
      }
      
      // Set audit context for middleware
      request.auditContext = {
        oldData: existing,
        newData: permanent === 'true' ? null : { ...existing, isActive: false }
      };

      return sendSuccess(reply, null);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/officers/bulk-delete', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const { ids, permanent } = request.body as { ids: string[], permanent?: boolean };

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return sendError(reply, 400, 'INVALID_IDS', 'Daftar ID tidak boleh kosong');
      }

      const officersToDelete = await db.query.officers.findMany({
        where: inArray(schema.officers.id, ids)
      });

      if (officersToDelete.length === 0) return sendSuccess(reply, { success: true });

      // Permission check & Filtering
      const validOfficerIds = officersToDelete.filter(o => {
        if (user.role === 'ADMIN_RANTING') return o.branchId === user.branchId;
        if (user.role === 'ADMIN_KECAMATAN') return o.districtId === user.districtId;
        return true;
      }).map(o => o.id);

      const validUserIds = officersToDelete.filter(o => {
        if (user.role === 'ADMIN_RANTING') return o.branchId === user.branchId;
        if (user.role === 'ADMIN_KECAMATAN') return o.districtId === user.districtId;
        return true;
      }).map(o => o.userId);

      if (validOfficerIds.length === 0) {
        return sendError(reply, 403, 'FORBIDDEN', 'Tidak memiliki akses untuk menghapus data ini');
      }

      if (permanent) {
        await db.delete(schema.users).where(inArray(schema.users.id, validUserIds));
      } else {
        await db.transaction(async (tx) => {
          await tx.update(schema.officers).set({ isActive: false }).where(inArray(schema.officers.id, validOfficerIds));
          await tx.update(schema.users).set({ isActive: false }).where(inArray(schema.users.id, validUserIds));
        });
      }

      return sendSuccess(reply, { success: true });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
