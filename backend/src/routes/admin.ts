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

const updateOfficerSchema = createOfficerSchema.partial().extend({
  is_active: z.boolean().optional(),
});

const createAssignmentSchema = z.object({
  can_id: z.string().uuid(),
  officer_id: z.string().uuid(),
  backup_officer_id: z.string().uuid().optional(),
  period_year: z.number().min(2020).max(2100),
  period_month: z.number().min(1).max(12),
});

const ranting = { preHandler: [authorize('ADMIN_RANTING')] };
const kecamatan = { preHandler: [authorize('ADMIN_KECAMATAN')] };
const rantingOrKec = { preHandler: [authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')] };

export async function adminRoutes(fastify: FastifyInstance) {
  // Apply auth middleware to all routes in this plugin
  fastify.addHook('preHandler', authenticate);

  // ========== ADMIN RANTING ROUTES ==========

  // GET /admin/branch/dashboard
  fastify.get('/branch/dashboard', ranting, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const branchId = user.branchId;

      if (!branchId) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Bukan admin ranting' },
        });
      }

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [canCount, officerCount, monthCollections, pendingCount, recentCollections] =
        await Promise.all([
          prisma.can.count({ where: { branchId } }),
          prisma.officer.count({ where: { branchId, isActive: true } }),
          prisma.collection.findMany({
            where: {
              can: { branchId },
              collectedAt: { gte: monthStart },
              syncStatus: 'COMPLETED',
            },
            include: { officer: { select: { id: true, fullName: true } } },
          }),
          prisma.assignment.count({
            where: { can: { branchId }, status: 'ACTIVE' },
          }),
          prisma.collection.findMany({
            where: { can: { branchId }, syncStatus: 'COMPLETED' },
            include: {
              can: { select: { qrCode: true, ownerName: true } },
              officer: { select: { fullName: true } },
            },
            orderBy: { collectedAt: 'desc' },
            take: 5,
          }),
        ]);

      const byOfficer = monthCollections.reduce(
        (acc: Record<string, any>, c) => {
          const key = c.officerId;
          if (!acc[key]) acc[key] = { name: c.officer.fullName, count: 0, amount: 0 };
          acc[key].count++;
          acc[key].amount += Number(c.amount);
          return acc;
        },
        {}
      );

      return reply.send({
        success: true,
        data: {
          summary: {
            total_cans: canCount,
            total_officers: officerCount,
            month_collection: monthCollections.reduce((s, c) => s + Number(c.amount), 0),
            month_count: monthCollections.length,
            pending_tasks: pendingCount,
          },
          recent_collections: recentCollections.map((c) => ({
            id: c.id,
            qr_code: c.can.qrCode,
            owner_name: c.can.ownerName,
            amount: Number(c.amount),
            officer_name: c.officer.fullName,
            collected_at: c.collectedAt,
          })),
          by_officer: Object.entries(byOfficer).map(([id, d]) => {
            const od = d as { name: string; count: number; amount: number };
            return { officer_id: id, officer_name: od.name, collected: od.count, amount: od.amount };
          }),
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

  // ========== CANS CRUD ==========

  fastify.get('/cans', ranting, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const query = request.query as { page?: string; limit?: string; search?: string; status?: string };
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '20');
      const skip = (page - 1) * limit;

      const where: any = { branchId: user.branchId };
      if (query.search) {
        where.OR = [
          { ownerName: { contains: query.search, mode: 'insensitive' } },
          { qrCode: { contains: query.search, mode: 'insensitive' } },
        ];
      }
      if (query.status === 'ACTIVE') where.isActive = true;
      if (query.status === 'INACTIVE') where.isActive = false;

      const [cans, total] = await Promise.all([
        prisma.can.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
        prisma.can.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: { cans, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  fastify.post('/cans', ranting, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const body = createCanSchema.parse(request.body);
      const branch = await prisma.branch.findUnique({ where: { id: user.branchId! } });
      const regionCode = branch?.code || 'XX';
      const count = await prisma.can.count({ where: { branchId: user.branchId! } });
      const qrCode = `LZNU-${regionCode}-${String(count + 1).padStart(5, '0')}`;

      const can = await prisma.can.create({
        data: {
          branchId: user.branchId!,
          qrCode,
          ownerName: body.owner_name,
          ownerPhone: body.owner_phone,
          ownerAddress: body.owner_address,
          ownerWhatsapp: body.owner_whatsapp,
          latitude: body.latitude,
          longitude: body.longitude,
          locationNotes: body.location_notes,
        },
      });
      return reply.status(201).send({ success: true, data: can });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Input tidak valid', details: error.errors } });
      }
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  fastify.get('/cans/:id', ranting, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const can = await prisma.can.findUnique({
        where: { id },
        include: {
          collections: {
            orderBy: { collectedAt: 'desc' },
            take: 10,
            include: { officer: { select: { fullName: true } } },
          },
        },
      });
      if (!can || can.branchId !== request.currentUser!.branchId) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Kaleng tidak ditemukan' } });
      }
      return reply.send({ success: true, data: can });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  fastify.put('/cans/:id', ranting, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = updateCanSchema.parse(request.body);
      const existing = await prisma.can.findUnique({ where: { id } });
      if (!existing || existing.branchId !== request.currentUser!.branchId) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Kaleng tidak ditemukan' } });
      }
      const can = await prisma.can.update({
        where: { id },
        data: {
          ownerName: body.owner_name,
          ownerPhone: body.owner_phone,
          ownerAddress: body.owner_address,
          ownerWhatsapp: body.owner_whatsapp,
          latitude: body.latitude,
          longitude: body.longitude,
          locationNotes: body.location_notes,
        },
      });
      return reply.send({ success: true, data: can });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  fastify.delete('/cans/:id', ranting, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const existing = await prisma.can.findUnique({ where: { id } });
      if (!existing || existing.branchId !== request.currentUser!.branchId) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Kaleng tidak ditemukan' } });
      }
      await prisma.can.update({ where: { id }, data: { isActive: false } });
      return reply.status(204).send();
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  fastify.post('/cans/:id/generate-qr', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const can = await prisma.can.findUnique({ where: { id } });
      if (!can) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Kaleng tidak ditemukan' } });
      }
      const qrDataUrl = await QRCode.toDataURL(can.qrCode, {
        width: 300, margin: 2, color: { dark: '#000000', light: '#ffffff' },
      });
      return reply.send({
        success: true,
        data: { qr_code: can.qrCode, qr_image_url: qrDataUrl, print_url: qrDataUrl },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  // ========== OFFICERS CRUD ==========

  fastify.get('/officers', ranting, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const query = request.query as { page?: string; limit?: string; search?: string };
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '20');
      const skip = (page - 1) * limit;

      const where: any = { branchId: user.branchId };
      if (query.search) {
        where.OR = [
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { employeeCode: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const [officers, total] = await Promise.all([
        prisma.officer.findMany({
          where, skip, take: limit, orderBy: { createdAt: 'desc' },
          select: { id: true, employeeCode: true, fullName: true, phone: true, photoUrl: true, assignedZone: true, isActive: true },
        }),
        prisma.officer.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: { officers, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  fastify.post('/officers', ranting, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const body = createOfficerSchema.parse(request.body);
      const count = await prisma.officer.count({ where: { branchId: user.branchId! } });
      const branch = await prisma.branch.findUnique({ where: { id: user.branchId! } });
      const employeeCode = `${branch?.code || 'XX'}-${String(count + 1).padStart(4, '0')}`;

      const userRecord = await prisma.user.create({
        data: {
          email: `${body.phone}@petugas.lazisnu.id`,
          passwordHash: '',
          fullName: body.full_name,
          phone: body.phone,
          role: 'PETUGAS',
          branchId: user.branchId,
          districtId: user.districtId,
        },
      });

      const officer = await prisma.officer.create({
        data: {
          userId: userRecord.id,
          employeeCode,
          fullName: body.full_name,
          phone: body.phone,
          photoUrl: body.photo_url,
          districtId: user.districtId!,
          branchId: user.branchId!,
          assignedZone: body.assigned_zone,
        },
      });
      return reply.status(201).send({ success: true, data: officer });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Input tidak valid', details: error.errors } });
      }
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  fastify.put('/officers/:id', ranting, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = updateOfficerSchema.parse(request.body);
      const existing = await prisma.officer.findUnique({ where: { id } });
      if (!existing || existing.branchId !== request.currentUser!.branchId) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Petugas tidak ditemukan' } });
      }
      const officer = await prisma.officer.update({
        where: { id },
        data: { fullName: body.full_name, phone: body.phone, photoUrl: body.photo_url, assignedZone: body.assigned_zone, isActive: body.is_active },
      });
      return reply.send({ success: true, data: officer });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  fastify.delete('/officers/:id', ranting, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const existing = await prisma.officer.findUnique({ where: { id } });
      if (!existing || existing.branchId !== request.currentUser!.branchId) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Petugas tidak ditemukan' } });
      }
      await prisma.officer.update({ where: { id }, data: { isActive: false } });
      return reply.status(204).send();
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  // ========== ADMIN KECAMATAN ROUTES ==========

  fastify.get('/district/dashboard', kecamatan, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.currentUser!;
      const districtId = user.districtId;
      if (!districtId) {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Bukan admin kecamatan' } });
      }

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [branches, totalCans, totalOfficers, monthCollections] = await Promise.all([
        prisma.branch.findMany({
          where: { districtId },
          include: { _count: { select: { cans: true, officers: true } } },
        }),
        prisma.can.count({ where: { branch: { districtId } } }),
        prisma.officer.count({ where: { districtId, isActive: true } }),
        prisma.collection.findMany({
          where: {
            can: { branch: { districtId } },
            collectedAt: { gte: monthStart },
            syncStatus: 'COMPLETED',
          },
          include: { officer: { select: { branchId: true } } },
        }),
      ]);

      const byBranch = monthCollections.reduce((acc: Record<string, any>, c) => {
        const key = c.officer.branchId;
        if (!acc[key]) acc[key] = { count: 0, amount: 0 };
        acc[key].count++;
        acc[key].amount += Number(c.amount);
        return acc;
      }, {});

      return reply.send({
        success: true,
        data: {
          summary: {
            total_branches: branches.length,
            total_cans: totalCans,
            total_officers: totalOfficers,
            month_collection: monthCollections.reduce((s, c) => s + Number(c.amount), 0),
            month_count: monthCollections.length,
          },
          by_branch: branches.map((b) => ({
            branch_id: b.id,
            branch_name: b.name,
            cans: b._count.cans,
            officers: b._count.officers,
            collection: byBranch[b.id]?.amount || 0,
            count: byBranch[b.id]?.count || 0,
          })),
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  // ========== SHARED ROUTES ==========

  fastify.get('/assignments', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { year?: string; month?: string; officer_id?: string; page?: string; limit?: string };
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '20');
      const skip = (page - 1) * limit;

      const where: any = {};
      if (query.year) where.periodYear = parseInt(query.year);
      if (query.month) where.periodMonth = parseInt(query.month);
      if (query.officer_id) where.officerId = query.officer_id;

      const user = request.currentUser!;
      if (user.role === 'ADMIN_RANTING' && user.branchId) {
        where.can = { branchId: user.branchId };
      } else if (user.role === 'ADMIN_KECAMATAN' && user.districtId) {
        where.can = { branch: { districtId: user.districtId } };
      }

      const [assignments, total] = await Promise.all([
        prisma.assignment.findMany({
          where,
          include: {
            can: { select: { qrCode: true, ownerName: true } },
            officer: { select: { fullName: true, employeeCode: true } },
          },
          skip, take: limit, orderBy: { assignedAt: 'desc' },
        }),
        prisma.assignment.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: { assignments, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  fastify.post('/assignments', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = createAssignmentSchema.parse(request.body);
      const existing = await prisma.assignment.findFirst({
        where: { canId: body.can_id, periodYear: body.period_year, periodMonth: body.period_month },
      });
      if (existing) {
        return reply.status(409).send({ success: false, error: { code: 'CONFLICT', message: 'Kaleng sudah ditugaskan bulan ini' } });
      }
      const assignment = await prisma.assignment.create({
        data: {
          canId: body.can_id,
          officerId: body.officer_id,
          backupOfficerId: body.backup_officer_id,
          periodYear: body.period_year,
          periodMonth: body.period_month,
        },
      });
      return reply.status(201).send({ success: true, data: assignment });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Input tidak valid', details: error.errors } });
      }
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  fastify.put('/assignments/:id', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = z.object({
        officer_id: z.string().uuid().optional(),
        backup_officer_id: z.string().uuid().optional(),
        status: z.enum(['ACTIVE', 'COMPLETED', 'POSTPONED', 'REASSIGNED']).optional(),
        notes: z.string().optional(),
      }).parse(request.body);

      const assignment = await prisma.assignment.update({
        where: { id },
        data: {
          officerId: body.officer_id,
          backupOfficerId: body.backup_officer_id,
          status: body.status,
          notes: body.notes,
        },
      });
      return reply.send({ success: true, data: assignment });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });
}

export default adminRoutes;
