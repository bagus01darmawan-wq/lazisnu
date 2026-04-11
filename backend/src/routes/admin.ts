// Admin Routes - Admin Ranting & Kecamatan API

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import QRCode from 'qrcode';

// Request schemas
const createCanSchema = z.object({
  owner_name: z.string().min(1).max(100),
  owner_phone: z.string().min(10).max(20),
  owner_address: z.string().min(1),
  owner_whatsapp: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  location_notes: z.string().optional(),
});

const updateCanSchema = createCanSchema.partial();

const createOfficerSchema = z.object({
  full_name: z.string().min(1).max(100),
  phone: z.string().min(10).max(20),
  assigned_zone: z.string().optional(),
  photo_url: z.string().url().optional(),
});

const createAssignmentSchema = z.object({
  can_id: z.string().uuid(),
  officer_id: z.string().uuid(),
  backup_officer_id: z.string().uuid().optional(),
  period_year: z.number().min(2020).max(2100),
  period_month: z.number().min(1).max(12),
});

const reportQuerySchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
  officer_id: z.string().uuid().optional(),
  branch_id: z.string().uuid().optional(),
  district_id: z.string().uuid().optional(),
  page: z.string().default('1'),
  limit: z.string().default('20'),
});

export async function adminRoutes(fastify: FastifyInstance) {
  // Apply auth middleware
  fastify.addHook('preHandler', authenticate);

  // ========== ADMIN RANTING ROUTES ==========

  // GET /admin/branch/dashboard
  fastify.get('/branch/dashboard',
    authorize('ADMIN_RANTING'),
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const branchId = user.branchId;

        if (!branchId) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Bukan admin ranting' },
          });
        }

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        // Get stats
        const [cans, officers, monthCollections] = await Promise.all([
          prisma.cans.count({ where: { branch_id: branchId } }),
          prisma.officers.count({ where: { branch_id: branchId, is_active: true } }),
          prisma.collections.findMany({
            where: {
              can: { branch_id: branchId },
              collected_at: { gte: monthStart.toISOString() },
              sync_status: 'COMPLETED',
            },
          }),
        ]);

        // Group by officer
        const byOfficer = monthCollections.reduce((acc, c) => {
          const key = c.officer_id;
          if (!acc[key]) acc[key] = { count: 0, amount: 0 };
          acc[key].count++;
          acc[key].amount += Number(c.amount);
          return acc;
        }, {} as Record<string, { count: number; amount: number }>);

        // Get officer names
        const officerIds = Object.keys(byOfficer);
        const officerData = await prisma.officers.findMany({
          where: { id: { in: officerIds } },
          select: { id: true, full_name: true },
        });

        const officerMap = new Map(officerData.map(o => [o.id, o.full_name]));

        return reply.send({
          success: true,
          data: {
            summary: {
              total_cans: cans,
              active_cans: cans,
              total_officers: officers,
              active_officers: officers,
              month_collection: Object.values(byOfficer).reduce((s, o) => s + o.amount, 0),
              month_count: monthCollections.length,
            },
            recent_collections: [],
            pending_tasks: 0,
            by_officer: officerIds.map(id => ({
              officer_id: id,
              officer_name: officerMap.get(id) || 'Unknown',
              collected: byOfficer[id].count,
              amount: byOfficer[id].amount,
            })),
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
        });
      }
    }
  );

  // CRUD Cans
  fastify.get('/cans', authorize('ADMIN_RANTING'), async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const query = request.query as { page?: string; limit?: string; search?: string; status?: string };
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '20');
      const skip = (page - 1) * limit;

      const where: any = { branch_id: user.branchId };
      if (query.search) {
        where.OR = [
          { owner_name: { contains: query.search, mode: 'insensitive' } },
          { qr_code: { contains: query.search, mode: 'insensitive' } },
        ];
      }
      if (query.status === 'ACTIVE') where.is_active = true;
      if (query.status === 'INACTIVE') where.is_active = false;

      const [cans, total] = await Promise.all([
        prisma.cans.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' } }),
        prisma.cans.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: { cans, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });

  fastify.post('/cans', authorize('ADMIN_RANTING'), async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = createCanSchema.parse(request.body);

      // Generate QR code
      const branch = await prisma.branches.findUnique({ where: { id: user.branchId } });
      const regionCode = branch?.region_code || 'XX';
      const count = await prisma.cans.count({ where: { branch_id: user.branchId } });
      const qrCode = `LZNU-${regionCode}-${String(count + 1).padStart(5, '0')}`;

      const can = await prisma.cans.create({
        data: {
          ...body,
          branch_id: user.branchId!,
          qr_code: qrCode,
        },
      });

      return reply.status(201).send({ success: true, data: can });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Input tidak valid', details: error.errors },
        });
      }
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });

  fastify.get('/cans/:id', authorize('ADMIN_RANTING'), async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const can = await prisma.cans.findUnique({ where: { id } });

      if (!can || can.branch_id !== request.user!.branchId) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Kaleng tidak ditemukan' },
        });
      }

      return reply.send({ success: true, data: can });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });

  fastify.put('/cans/:id', authorize('ADMIN_RANTING'), async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = updateCanSchema.parse(request.body);

      const existing = await prisma.cans.findUnique({ where: { id } });
      if (!existing || existing.branch_id !== request.user!.branchId) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Kaleng tidak ditemukan' },
        });
      }

      const can = await prisma.cans.update({ where: { id }, data: body });
      return reply.send({ success: true, data: can });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });

  fastify.delete('/cans/:id', authorize('ADMIN_RANTING'), async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const existing = await prisma.cans.findUnique({ where: { id } });

      if (!existing || existing.branch_id !== request.user!.branchId) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Kaleng tidak ditemukan' },
        });
      }

      await prisma.cans.update({ where: { id }, data: { is_active: false } });
      return reply.status(204).send();
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });

  // Generate QR Code
  fastify.post('/cans/:id/generate-qr', authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN'), async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const can = await prisma.cans.findUnique({ where: { id } });

      if (!can) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Kaleng tidak ditemukan' },
        });
      }

      // Generate QR code as data URL
      const qrDataUrl = await QRCode.toDataURL(can.qr_code, {
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });

      // In production, upload to R2 and return URL
      const qrImageUrl = qrDataUrl; // For dev, return data URL

      return reply.send({
        success: true,
        data: {
          qr_code: can.qr_code,
          qr_image_url: qrImageUrl,
          print_url: qrImageUrl, // Same for now
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });

  // CRUD Officers
  fastify.get('/officers', authorize('ADMIN_RANTING'), async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const query = request.query as { page?: string; limit?: string; search?: string };
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '20');
      const skip = (page - 1) * limit;

      const where: any = { branch_id: user.branchId };
      if (query.search) {
        where.OR = [
          { full_name: { contains: query.search, mode: 'insensitive' } },
          { employee_code: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const [officers, total] = await Promise.all([
        prisma.officers.findMany({
          where,
          skip,
          take: limit,
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            employee_code: true,
            full_name: true,
            phone: true,
            photo_url: true,
            assigned_zone: true,
            is_active: true,
          },
        }),
        prisma.officers.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: { officers, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });

  // ========== ADMIN KECAMATAN ROUTES ==========

  fastify.get('/district/dashboard', authorize('ADMIN_KECAMATAN'), async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const districtId = user.districtId;

      if (!districtId) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Bukan admin kecamatan' },
        });
      }

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [branches, totalCans, totalOfficers, monthCollections] = await Promise.all([
        prisma.branches.findMany({ where: { district_id: districtId } }),
        prisma.cans.count({ where: { branch: { district_id: districtId } } }),
        prisma.officers.count({ where: { district_id: districtId, is_active: true } }),
        prisma.collections.findMany({
          where: {
            can: { branch: { district_id: districtId } },
            collected_at: { gte: monthStart.toISOString() },
            sync_status: 'COMPLETED',
          },
          include: { officer: true },
        }),
      ]);

      // Group by branch
      const byBranch = monthCollections.reduce((acc, c) => {
        const key = c.officer.branch_id;
        if (!acc[key]) acc[key] = { count: 0, amount: 0 };
        acc[key].count++;
        acc[key].amount += Number(c.amount);
        return acc;
      }, {} as Record<string, { count: number; amount: number }>);

      return reply.send({
        success: true,
        data: {
          summary: {
            total_branches: branches.length,
            total_cans: totalCans,
            total_officers: totalOfficers,
            active_officers: totalOfficers,
            month_collection: monthCollections.reduce((s, c) => s + Number(c.amount), 0),
            month_count: monthCollections.length,
          },
          by_branch: branches.map(b => ({
            branch_id: b.id,
            branch_name: b.name,
            cans: 0, // Would need additional query
            officers: 0,
            collection: byBranch[b.id]?.amount || 0,
            count: byBranch[b.id]?.count || 0,
          })),
          top_officers: [],
          pending_sync: 0,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });

  // ========== SHARED ROUTES ==========

  // Get assignments
  fastify.get('/assignments', authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN'), async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { year?: string; month?: string; officer_id?: string; branch_id?: string };
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '20');
      const skip = (page - 1) * limit;

      const where: any = {};
      if (query.year) where.period_year = parseInt(query.year);
      if (query.month) where.period_month = parseInt(query.month);
      if (query.officer_id) where.officer_id = query.officer_id;

      const user = request.user!;
      if (user.role === 'ADMIN_RANTING' && user.branchId) {
        where.can = { branch_id: user.branchId };
      } else if (user.role === 'ADMIN_KECAMATAN' && user.districtId) {
        where.can = { branch: { district_id: user.districtId } };
      }

      const [assignments, total] = await Promise.all([
        prisma.assignments.findMany({
          where,
          include: {
            can: { select: { qr_code: true, owner_name: true } },
            officer: { select: { full_name: true, employee_code: true } },
          },
          skip,
          take: limit,
          orderBy: { assigned_at: 'desc' },
        }),
        prisma.assignments.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: {
          assignments,
          pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });

  // Create assignment
  fastify.post('/assignments', authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN'), async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = createAssignmentSchema.parse(request.body);

      // Check for existing assignment
      const existing = await prisma.assignments.findFirst({
        where: {
          can_id: body.can_id,
          period_year: body.period_year,
          period_month: body.period_month,
        },
      });

      if (existing) {
        return reply.status(409).send({
          success: false,
          error: { code: 'CONFLICT', message: 'Kaleng sudah ditugaskan bulan ini' },
        });
      }

      const assignment = await prisma.assignments.create({ data: body });
      return reply.status(201).send({ success: true, data: assignment });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Input tidak valid', details: error.errors },
        });
      }
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });

  // Update assignment (for reassignment)
  fastify.put('/assignments/:id', authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN'), async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = z.object({
        officer_id: z.string().uuid().optional(),
        backup_officer_id: z.string().uuid().optional(),
        status: z.enum(['ACTIVE', 'COMPLETED', 'POSTPONED', 'REASSIGNED']).optional(),
        notes: z.string().optional(),
      }).parse(request.body);

      const assignment = await prisma.assignments.update({ where: { id }, data: body });
      return reply.send({ success: true, data: assignment });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });
}

export default adminRoutes;