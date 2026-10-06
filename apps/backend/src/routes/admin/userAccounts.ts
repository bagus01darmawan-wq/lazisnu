import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { authorize } from '../../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../../utils/response';
import { getPaginationParams } from '../../utils/pagination';

const kecamatanOnly = { preHandler: [authorize('ADMIN_KECAMATAN')] };

/** Peran yang boleh dikelola dari UI ini. PETUGAS dikelola di halaman Users. */
const MANAGEABLE_ROLES = ['ADMIN_KECAMATAN', 'ADMIN_RANTING', 'STAF_KEUANGAN', 'STAF_PENGUMPULAN'] as const;

const createAccountSchema = z.object({
  full_name: z.string().min(3, 'Nama minimal 3 karakter').max(100),
  phone: z.string().min(10, 'Nomor HP minimal 10 digit').max(20),
  password: z.string().min(6, 'Password minimal 6 karakter').max(100),
  role: z.enum(MANAGEABLE_ROLES),
  branch_id: z.string().uuid().optional().nullable(),
});

const updateAccountSchema = z.object({
  full_name: z.string().min(3).max(100).optional(),
  phone: z.string().min(10).max(20).optional(),
  password: z.string().min(6).max(100).optional().nullable(),
  branch_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
});

/**
 * Daftar seluruh akun (login) dalam kecamatan — read-only.
 * Berbeda dengan /admin/officers (data petugas lapangan): endpoint ini
 * membaca tabel users sehingga akun ADMIN_KECAMATAN/RANTING ikut terlihat.
 * Paginasi + pencarian mengikuti pola /admin/officers. Kolom sensitif
 * (passwordHash, fcmToken) tidak pernah diekspos.
 */
export async function userAccountsRoutes(fastify: FastifyInstance) {
  fastify.get('/user-accounts', kecamatanOnly, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const query = request.query as {
        page?: string; limit?: string; search?: string; role?: string; branch_id?: string;
      };
      const { page, limit, offset } = getPaginationParams(query);

      if (!user.districtId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan admin kecamatan');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conditions: any[] = [eq(schema.users.districtId, user.districtId as string)];
      if (query.branch_id) conditions.push(eq(schema.users.branchId, query.branch_id));
      if (query.role) conditions.push(eq(schema.users.role, query.role as 'ADMIN_KECAMATAN' | 'ADMIN_RANTING' | 'PETUGAS'));
      if (query.search) {
        conditions.push(or(
          ilike(schema.users.fullName, `%${query.search}%`),
          ilike(schema.users.email, `%${query.search}%`),
          ilike(schema.users.phone, `%${query.search}%`),
        ));
      }
      const whereClause = and(...conditions);

      const [rows, totalRows] = await Promise.all([
        db.select({
          id: schema.users.id,
          full_name: schema.users.fullName,
          email: schema.users.email,
          phone: schema.users.phone,
          role: schema.users.role,
          is_active: schema.users.isActive,
          last_login: schema.users.lastLogin,
          branch_id: schema.users.branchId,
          branch_name: schema.branches.name,
        })
          .from(schema.users)
          .leftJoin(schema.branches, eq(schema.users.branchId, schema.branches.id))
          .where(whereClause)
          .orderBy(desc(schema.users.createdAt))
          .offset(offset)
          .limit(limit),
        db.select({ count: sql<number>`count(*)::int` })
          .from(schema.users)
          .where(whereClause),
      ]);

      return sendSuccess(reply, {
        items: rows,
        pagination: { page, limit, total: Number(totalRows[0]?.count ?? 0) },
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.post('/user-accounts', kecamatanOnly, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      if (!user.districtId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan admin kecamatan');
      }
      const body = createAccountSchema.parse(request.body);

      // ADMIN_RANTING wajib terikat satu ranting; ADMIN_KECAMATAN tanpa ranting.
      let branchId: string | null = null;
      if (body.role === 'ADMIN_RANTING') {
        if (!body.branch_id) {
          return sendError(reply, 400, 'MISSING_BRANCH', 'Admin ranting wajib punya ranting');
        }
        const branch = await db.query.branches.findFirst({
          where: eq(schema.branches.id, body.branch_id),
          columns: { id: true, districtId: true },
        });
        if (!branch || branch.districtId !== user.districtId) {
          return sendError(reply, 403, 'FORBIDDEN_SCOPE', 'Ranting bukan bagian dari kecamatan Anda');
        }
        branchId = branch.id;
      } else if (body.role === 'ADMIN_KECAMATAN') {
        branchId = null;
      } else if (body.branch_id) {
        // STAF_* boleh terikat ranting (mis. bendahara seranting), boleh juga kecamatan.
        const branch = await db.query.branches.findFirst({
          where: eq(schema.branches.id, body.branch_id),
          columns: { id: true, districtId: true },
        });
        if (!branch || branch.districtId !== user.districtId) {
          return sendError(reply, 403, 'FORBIDDEN_SCOPE', 'Ranting bukan bagian dari kecamatan Anda');
        }
        branchId = branch.id;
      }

      const email = `${body.phone}@admin.lazisnu.id`;
      const clash = await db.query.users.findFirst({
        where: or(eq(schema.users.email, email), eq(schema.users.phone, body.phone)),
        columns: { id: true },
      });
      if (clash) {
        return sendError(reply, 409, 'DUPLICATE', 'Nomor HP sudah dipakai akun lain');
      }

      const [created] = await db.insert(schema.users).values({
        email,
        passwordHash: await bcrypt.hash(body.password, 10),
        fullName: body.full_name,
        phone: body.phone,
        role: body.role,
        districtId: user.districtId,
        branchId,
        isActive: true,
      }).returning({
        id: schema.users.id,
        full_name: schema.users.fullName,
        email: schema.users.email,
        phone: schema.users.phone,
        role: schema.users.role,
      });

      request.auditContext = { newData: { id: created.id, role: created.role } };
      return sendSuccess(reply, created, 201);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.put('/user-accounts/:id', kecamatanOnly, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      if (!user.districtId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan admin kecamatan');
      }
      const { id } = request.params as { id: string };
      const body = updateAccountSchema.parse(request.body);

      const target = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
      if (!target || target.districtId !== user.districtId) {
        return sendError(reply, 404, 'NOT_FOUND', 'Akun tidak ditemukan');
      }
      if (target.role === 'PETUGAS') {
        return sendError(reply, 403, 'FORBIDDEN_ROLE', 'Akun petugas dikelola di halaman Users');
      }
      if (id === user.userId && body.is_active === false) {
        return sendError(reply, 403, 'FORBIDDEN_SELF', 'Tidak bisa menonaktifkan akun sendiri');
      }

      const patch: Partial<{ fullName: string; phone: string; passwordHash: string; branchId: string | null; isActive: boolean }> = {};
      if (body.full_name !== undefined) patch.fullName = body.full_name;
      if (body.phone !== undefined) {
        const clash = await db.query.users.findFirst({
          where: and(eq(schema.users.phone, body.phone), sql`${schema.users.id} <> ${id}`),
          columns: { id: true },
        });
        if (clash) return sendError(reply, 409, 'DUPLICATE', 'Nomor HP sudah dipakai akun lain');
        patch.phone = body.phone;
      }
      if (body.password) patch.passwordHash = await bcrypt.hash(body.password, 10);
      if (body.branch_id !== undefined) {
        if (target.role === 'ADMIN_KECAMATAN' && body.branch_id) {
          return sendError(reply, 400, 'VALIDATION_ERROR', 'Admin kecamatan tidak terikat ranting');
        }
        if (target.role === 'ADMIN_RANTING' && !body.branch_id) {
          return sendError(reply, 400, 'VALIDATION_ERROR', 'Admin ranting wajib punya ranting');
        }
        if (body.branch_id) {
          const branch = await db.query.branches.findFirst({
            where: eq(schema.branches.id, body.branch_id),
            columns: { id: true, districtId: true },
          });
          if (!branch || branch.districtId !== user.districtId) {
            return sendError(reply, 403, 'FORBIDDEN_SCOPE', 'Ranting bukan bagian dari kecamatan Anda');
          }
        }
        patch.branchId = body.branch_id;
      }
      if (body.is_active !== undefined) patch.isActive = body.is_active;

      const [updated] = await db.update(schema.users).set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.users.id, id))
        .returning({
          id: schema.users.id,
          full_name: schema.users.fullName,
          phone: schema.users.phone,
          role: schema.users.role,
          is_active: schema.users.isActive,
        });

      request.auditContext = { oldData: { id }, newData: patch };
      return sendSuccess(reply, updated);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.delete('/user-accounts/:id', kecamatanOnly, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      if (!user.districtId) {
        return sendError(reply, 403, 'FORBIDDEN', 'Bukan admin kecamatan');
      }
      const { id } = request.params as { id: string };

      const target = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
      if (!target || target.districtId !== user.districtId) {
        return sendError(reply, 404, 'NOT_FOUND', 'Akun tidak ditemukan');
      }
      if (id === user.userId) {
        return sendError(reply, 403, 'FORBIDDEN_SELF', 'Tidak bisa menghapus akun sendiri');
      }
      if (target.role === 'PETUGAS') {
        return sendError(reply, 403, 'FORBIDDEN_ROLE', 'Akun petugas dikelola di halaman Users');
      }
      if (target.role === 'ADMIN_KECAMATAN') {
        const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
          .from(schema.users)
          .where(and(
            eq(schema.users.districtId, user.districtId),
            eq(schema.users.role, 'ADMIN_KECAMATAN'),
            eq(schema.users.isActive, true),
          ));
        if (Number(count) <= 1) {
          return sendError(reply, 403, 'LAST_ADMIN', 'Tidak bisa menghapus satu-satunya admin kecamatan aktif');
        }
      }
      // Kunci pengaman: akun yang masih terikat officer tidak bisa dihapus
      // (hapus/arsipkan petugasnya dulu di halaman Users).
      const linked = await db.query.officers.findFirst({
        where: eq(schema.officers.userId, id),
        columns: { id: true },
      });
      if (linked) {
        return sendError(reply, 409, 'LINKED_OFFICER', 'Akun terikat data petugas — arsipkan petugasnya dulu');
      }

      await db.delete(schema.users).where(eq(schema.users.id, id));
      request.auditContext = { oldData: { id, role: target.role } };
      return sendSuccess(reply, null);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
