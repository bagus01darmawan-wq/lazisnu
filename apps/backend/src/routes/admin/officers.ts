import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, and, desc, ilike, or, inArray } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { getPaginationParams, formatPaginatedResponse } from '../../utils/pagination';
import { getRoleScope } from '../../utils/role-scope';
import { createOfficerSchema, updateOfficerSchema } from './schemas';
import { getOfficerDetailWithStats } from '../../services/officerService';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getPostgresError } from '../../utils/error-guards';
import { buildNextEmployeeCode } from '../../utils/employee-code';

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

  fastify.get('/officers/:id', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const user = request.currentUser!;
      const query = request.query as { year?: string; month?: string; months?: string };

      const existing = await db.query.officers.findFirst({
        where: eq(schema.officers.id, id),
        columns: { id: true, branchId: true, districtId: true },
      });

      if (!existing) {
        return sendError(reply, 404, 'NOT_FOUND', 'Petugas tidak ditemukan');
      }

      if (user.role === 'ADMIN_RANTING' && existing.branchId !== user.branchId) {
        return sendError(reply, 404, 'NOT_FOUND', 'Petugas tidak ditemukan');
      }
      if (user.role === 'ADMIN_KECAMATAN' && existing.districtId !== user.districtId) {
        return sendError(reply, 404, 'NOT_FOUND', 'Petugas tidak ditemukan');
      }

      const year = query.year ? parseInt(query.year) : new Date().getFullYear();
      const months = query.months
        ? query.months.split(',').map(Number).filter(n => n >= 1 && n <= 12)
        : query.month
          ? [parseInt(query.month)]
          : undefined;

      const officer = await getOfficerDetailWithStats(id, { year, months });

      if (!officer) {
        return sendError(reply, 404, 'NOT_FOUND', 'Petugas tidak ditemukan');
      }

      return sendSuccess(reply, officer);
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
        // Kunci baris ranting agar dua admin yang menyimpan bersamaan tidak
        // membaca nomor terakhir yang sama lalu menghasilkan kode kembar.
        await tx
          .select({ id: schema.branches.id })
          .from(schema.branches)
          .where(eq(schema.branches.id, targetBranchId))
          .for('update');

        const existingCodes = await tx
          .select({ employeeCode: schema.officers.employeeCode })
          .from(schema.officers)
          .where(eq(schema.officers.branchId, targetBranchId));

        // Nomor dari suffix terakhir, bukan jumlah petugas: petugas yang pernah
        // dihapus meninggalkan celah nomor, dan pola "jumlah + 1" akan menabrak
        // kode yang masih ada.
        const employeeCode = buildNextEmployeeCode(
          branchRes.code,
          existingCodes.map(row => row.employeeCode),
        );

        const randomPassword = crypto.randomBytes(16).toString('hex');
        const hashedPassword = await bcrypt.hash(randomPassword, 10);

        const [userRecord] = await tx.insert(schema.users).values({
          email: `${body.phone}@petugas.lazisnu.id`,
          passwordHash: hashedPassword,
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
      
      request.auditContext = { newData: insertedOfficer };
      return sendSuccess(reply, insertedOfficer, 201);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.issues);
      }
      
      // Handle Unique Constraint Violations (Postgres 23505)
      // drizzle membungkus error driver dalam DrizzleQueryError, jadi unwrap dulu via getPostgresError
      const pgError = getPostgresError(error);
      if (pgError && pgError.code === '23505') {
        const detail = pgError.detail || '';
        let message = 'Data petugas sudah terdaftar';
        
        if (detail.includes('phone')) {
          message = 'Nomor HP sudah terdaftar. Gunakan nomor lain.';
        } else if (detail.includes('email')) {
          message = 'Email (berdasarkan nomor HP) sudah terdaftar.';
        } else if (detail.includes('employee_code')) {
          // Normalnya tidak tercapai: kode dibuat dari nomor terakhir di dalam
          // transaksi yang dikunci. Kalau tetap terjadi, ini kegagalan sistem —
          // mengulang simpan tidak akan mengubah hasil.
          message = 'Gagal membuat kode petugas otomatis. Silakan hubungi admin sistem.';
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

        // Nomor HP juga kunci login (identifier users.phone) dan target OTP.
        // Tanpa sinkron ini kedua tabel menyimpang: OTP pakai officers.phone,
        // login password pakai users.phone (kasus nyata 2026-10-27).
        if (body.phone && body.phone !== existing.phone) {
          // Email akun petugas dibentuk dari nomor HP saat dibuat
          // (`${phone}@petugas.lazisnu.id`, lihat POST /officers) dan kolomnya
          // UNIQUE. Kalau tidak ikut diperbarui, nomor lama tetap "terkunci"
          // oleh email itu: nomor tersebut tidak bisa dipakai petugas baru
          // walau kolom phone-nya sudah kosong. Email hanya diganti bila
          // nilainya memang pola hasil generate — email yang diubah manual
          // tidak boleh ditimpa.
          const [targetUser] = await tx
            .select({ email: schema.users.email })
            .from(schema.users)
            .where(eq(schema.users.id, existing.userId))
            .limit(1);
          const emailTerbentuk = `${existing.phone}@petugas.lazisnu.id`;
          const emailBaru =
            targetUser?.email === emailTerbentuk ? `${body.phone}@petugas.lazisnu.id` : undefined;

          await tx
            .update(schema.users)
            .set({
              phone: body.phone,
              updatedAt: new Date(),
              ...(emailBaru ? { email: emailBaru } : {}),
            })
            .where(eq(schema.users.id, existing.userId));
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
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.issues);
      }

      // Nomor HP dan email dikunci UNIQUE di `users` maupun `officers`. Sebelum
      // ini bentrok nomor jatuh ke sendInternalError → pengguna melihat
      // "kesalahan server" dan menyangka aplikasinya rusak, padahal datanya
      // memang ditolak (transaksi rollback, nomor lama tetap terpakai).
      // Hanya POST /officers yang punya penanganan 23505; jalur edit tidak.
      const pgError = getPostgresError(error);
      if (pgError && pgError.code === '23505') {
        const detail = pgError.detail || '';
        const message = detail.includes('phone')
          ? 'Nomor HP sudah dipakai akun lain. Gunakan nomor lain.'
          : detail.includes('email')
            ? 'Email akun (dibentuk dari nomor HP) sudah dipakai akun lain.'
            : 'Data petugas sudah terdaftar.';
        return sendError(reply, 409, 'DUPLICATE', message);
      }

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
