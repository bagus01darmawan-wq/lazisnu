// Admin Routes - Admin Ranting & Kecamatan API

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, desc, asc, ilike, or, gte } from 'drizzle-orm';
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

const resubmitCollectionSchema = z.object({
  nominal: z.number().positive(),
  alasan_resubmit: z.string().min(5),
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
          db.$count(schema.cans, eq(schema.cans.branchId, branchId)),
          db.$count(schema.officers, and(eq(schema.officers.branchId, branchId), eq(schema.officers.isActive, true))),
          db.query.collections.findMany({
            where: and(
              // Assuming you have eq in relations, simplified here by fetching then filtering OR joining. 
              // Using query builder natively:
              gte(schema.collections.collectedAt, monthStart),
              eq(schema.collections.syncStatus, 'COMPLETED')
            ),
            with: { officer: { columns: { id: true, fullName: true } }, can: true },
          }).then(cols => cols.filter(c => c.can?.branchId === branchId)),
          db.$count(schema.assignments, and(
            eq(schema.assignments.status, 'ACTIVE')
            // Note: In a real advanced Drizzle query you'd inner join `cans` but here we fetch and filter or use an inArray
          )),
          db.query.collections.findMany({
            where: eq(schema.collections.syncStatus, 'COMPLETED'),
            with: {
              can: { columns: { qrCode: true, ownerName: true, branchId: true } },
              officer: { columns: { fullName: true } },
            },
            orderBy: [desc(schema.collections.collectedAt)],
            limit: 5,
          }).then(cols => cols.filter(c => c.can?.branchId === branchId)),
        ]);

      const byOfficer = monthCollections.reduce(
        (acc: Record<string, any>, c) => {
          const key = c.officerId;
          if (!acc[key]) acc[key] = { name: c.officer.fullName, count: 0, nominal: 0 };
          acc[key].count++;
          acc[key].nominal += Number(c.nominal);
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
            month_collection: monthCollections.reduce((s, c) => s + Number(c.nominal), 0),
            month_count: monthCollections.length,
            pending_tasks: pendingCount,
          },
          recent_collections: recentCollections.map((c) => ({
            id: c.id,
            qr_code: c.can.qrCode,
            owner_name: c.can.ownerName,
            nominal: Number(c.nominal),
            officer_name: c.officer.fullName,
            collected_at: c.collectedAt,
          })),
          by_officer: Object.entries(byOfficer).map(([id, d]) => {
            const od = d as { name: string; count: number; nominal: number };
            return { officer_id: id, officer_name: od.name, collected: od.count, nominal: od.nominal };
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

      const conditions: any[] = [eq(schema.cans.branchId, user.branchId!)];
      if (query.search) {
        conditions.push(or(
          ilike(schema.cans.ownerName, `%${query.search}%`),
          ilike(schema.cans.qrCode, `%${query.search}%`)
        )!);
      }
      if (query.status === 'ACTIVE') conditions.push(eq(schema.cans.isActive, true));
      if (query.status === 'INACTIVE') conditions.push(eq(schema.cans.isActive, false));
      const whereClause = and(...conditions);

      const [cans, total] = await Promise.all([
        db.query.cans.findMany({ where: whereClause, offset: skip, limit, orderBy: [desc(schema.cans.createdAt)] }),
        db.$count(schema.cans, whereClause),
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
      const branchs = await db.query.branches.findFirst({ where: eq(schema.branches.id, user.branchId!) });
      const regionCode = branchs?.code || 'XX';
      const count = await db.$count(schema.cans, eq(schema.cans.branchId, user.branchId!));
      const qrCode = `LZNU-${regionCode}-${String(count + 1).padStart(5, '0')}`;

      const inserted = await db.insert(schema.cans).values({
        branchId: user.branchId!,
        qrCode,
        ownerName: body.owner_name,
        ownerPhone: body.owner_phone,
        ownerAddress: body.owner_address,
        ownerWhatsapp: body.owner_whatsapp,
        latitude: body.latitude ? body.latitude.toString() : undefined,
        longitude: body.longitude ? body.longitude.toString() : undefined,
        locationNotes: body.location_notes,
      }).returning();
      const can = inserted[0];
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
      const existing = await db.query.cans.findFirst({ where: eq(schema.cans.id, id) });
      if (!existing || existing.branchId !== request.currentUser!.branchId) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Kaleng tidak ditemukan' } });
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
      return reply.send({ success: true, data: can });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  fastify.delete('/cans/:id', ranting, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const existing = await db.query.cans.findFirst({ where: eq(schema.cans.id, id) });
      if (!existing || existing.branchId !== request.currentUser!.branchId) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Kaleng tidak ditemukan' } });
      }
      await db.update(schema.cans).set({ isActive: false }).where(eq(schema.cans.id, id));
      return reply.status(204).send();
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  fastify.post('/cans/:id/generate-qr', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const can = await db.query.cans.findFirst({ where: eq(schema.cans.id, id) });
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

      const conditions: any[] = [eq(schema.officers.branchId, user.branchId!)];
      if (query.search) {
        conditions.push(or(
          ilike(schema.officers.fullName, `%${query.search}%`),
          ilike(schema.officers.employeeCode, `%${query.search}%`)
        )!);
      }
      const whereClause = and(...conditions);

      const [officers, total] = await Promise.all([
        db.query.officers.findMany({
          where: whereClause, offset: skip, limit, orderBy: [desc(schema.officers.createdAt)],
          columns: { id: true, employeeCode: true, fullName: true, phone: true, photoUrl: true, assignedZone: true, isActive: true },
        }),
        db.$count(schema.officers, whereClause),
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
      const count = await db.$count(schema.officers, eq(schema.officers.branchId, user.branchId!));
      const branchRes = await db.query.branches.findFirst({ where: eq(schema.branches.id, user.branchId!) });
      const employeeCode = `${branchRes?.code || 'XX'}-${String(count + 1).padStart(4, '0')}`;

      const insertedUser = await db.insert(schema.users).values({
        email: `${body.phone}@petugas.lazisnu.id`,
        passwordHash: '',
        fullName: body.full_name,
        phone: body.phone,
        role: 'PETUGAS',
        branchId: user.branchId,
        districtId: user.districtId,
      }).returning();
      const userRecord = insertedUser[0];

      const insertedOfficer = await db.insert(schema.officers).values({
        userId: userRecord.id,
        employeeCode,
        fullName: body.full_name,
        phone: body.phone,
        photoUrl: body.photo_url,
        districtId: user.districtId!,
        branchId: user.branchId!,
        assignedZone: body.assigned_zone,
      }).returning();
      const officer = insertedOfficer[0];
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
      const existing = await db.query.officers.findFirst({ where: eq(schema.officers.id, id) });
      if (!existing || existing.branchId !== request.currentUser!.branchId) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Petugas tidak ditemukan' } });
      }
      const updated = await db.update(schema.officers).set({ fullName: body.full_name, phone: body.phone, photoUrl: body.photo_url, assignedZone: body.assigned_zone, isActive: body.is_active })
        .where(eq(schema.officers.id, id)).returning();
      const officer = updated[0];
      return reply.send({ success: true, data: officer });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  fastify.delete('/officers/:id', ranting, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const existing = await db.query.officers.findFirst({ where: eq(schema.officers.id, id) });
      if (!existing || existing.branchId !== request.currentUser!.branchId) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Petugas tidak ditemukan' } });
      }
      await db.update(schema.officers).set({ isActive: false }).where(eq(schema.officers.id, id));
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

      const monthCollectionsRows = await db.query.collections.findMany({
        where: and(gte(schema.collections.collectedAt, monthStart), eq(schema.collections.syncStatus, 'COMPLETED')),
        with: { can: { with: { branch: true } }, officer: true }
      });
      
      const monthCollections = monthCollectionsRows.filter(c => c.can.branch?.districtId === districtId);

      const [branchesList, totalCans, totalOfficers] = await Promise.all([
        db.query.branches.findMany({
          where: eq(schema.branches.districtId, districtId),
          with: { cans: { columns: { id: true } }, officers: { columns: { id: true } } },
        }),
        db.select().from(schema.cans).innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
          .where(eq(schema.branches.districtId, districtId)).then(r => r.length),
        db.$count(schema.officers, and(eq(schema.officers.districtId, districtId), eq(schema.officers.isActive, true))),
      ]);

      const branches = branchesList.map(b => ({ id: b.id, name: b.name, _count: { cans: b.cans.length, officers: b.officers.length } }));

      const byBranch = monthCollections.reduce((acc: Record<string, any>, c) => {
        const key = c.officer.branchId!;
        if (!acc[key]) acc[key] = { count: 0, nominal: 0 };
        acc[key].count++;
        acc[key].nominal += Number(c.nominal);
        return acc;
      }, {});

      return reply.send({
        success: true,
        data: {
          summary: {
            total_branches: branches.length,
            total_cans: totalCans,
            total_officers: totalOfficers,
            month_collection: monthCollections.reduce((s, c) => s + Number(c.nominal), 0),
            month_count: monthCollections.length,
          },
          by_branch: branches.map((b) => ({
            branch_id: b.id,
            branch_name: b.name,
            cans: b._count.cans,
            officers: b._count.officers,
            collection: byBranch[b.id]?.nominal || 0,
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

      const conditions: any[] = [];
      if (query.year) conditions.push(eq(schema.assignments.periodYear, parseInt(query.year)));
      if (query.month) conditions.push(eq(schema.assignments.periodMonth, parseInt(query.month)));
      if (query.officer_id) conditions.push(eq(schema.assignments.officerId, query.officer_id));

      const user = request.currentUser!;
      
      const allAssignments = await db.query.assignments.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
          can: { with: { branch: true } },
          officer: { columns: { fullName: true, employeeCode: true } }
        },
        orderBy: [desc(schema.assignments.assignedAt)],
      });

      const filtered = allAssignments.filter(a => {
        if (user.role === 'ADMIN_RANTING' && user.branchId) {
          return a.can.branchId === user.branchId;
        } else if (user.role === 'ADMIN_KECAMATAN' && user.districtId) {
          return a.can.branch?.districtId === user.districtId;
        }
        return true;
      });

      const total = filtered.length;
      const assignments = filtered.slice(skip, skip + limit).map(a => ({
        ...a, can: { qrCode: a.can.qrCode, ownerName: a.can.ownerName }, branch: undefined // strip branch for response Match
      }));

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
      const existing = await db.query.assignments.findFirst({
        where: and(eq(schema.assignments.canId, body.can_id), eq(schema.assignments.periodYear, body.period_year), eq(schema.assignments.periodMonth, body.period_month)),
      });
      if (existing) {
        return reply.status(409).send({ success: false, error: { code: 'CONFLICT', message: 'Kaleng sudah ditugaskan bulan ini' } });
      }
      const inserted = await db.insert(schema.assignments).values({
          canId: body.can_id,
          officerId: body.officer_id,
          backupOfficerId: body.backup_officer_id,
          periodYear: body.period_year,
          periodMonth: body.period_month,
      }).returning();
      const assignment = inserted[0];
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

      let updateData: any = {};
      if (body.officer_id !== undefined) updateData.officerId = body.officer_id;
      if (body.backup_officer_id !== undefined) updateData.backupOfficerId = body.backup_officer_id;
      if (body.status !== undefined) updateData.status = body.status;
      if (body.notes !== undefined) updateData.notes = body.notes;

      const updated = await db.update(schema.assignments).set(updateData).where(eq(schema.assignments.id, id)).returning();
      const assignment = updated[0];
      return reply.send({ success: true, data: assignment });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  // POST /admin/collections/:id/resubmit
  fastify.post('/collections/:id/resubmit', rantingOrKec, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = resubmitCollectionSchema.parse(request.body);
      const user = request.currentUser!;

      const result = await db.transaction(async (tx) => {
        // 1. Get old collection
        const old = await tx.query.collections.findFirst({
          where: and(eq(schema.collections.id, id), eq(schema.collections.isLatest, true)),
        });

        if (!old) {
          throw new Error('COLLECTION_NOT_FOUND_OR_NOT_LATEST');
        }

        // 2. Access control (if ranting, must match branch)
        if (user.role === 'ADMIN_RANTING') {
          const can = await tx.query.cans.findFirst({ where: eq(schema.cans.id, old.canId) });
          if (can?.branchId !== user.branchId) throw new Error('FORBIDDEN');
        }

        // 3. Mark old as not latest
        await tx.update(schema.collections).set({ isLatest: false }).where(eq(schema.collections.id, id));

        // 4. Insert new record
        const [newRecord] = await tx.insert(schema.collections).values({
          assignmentId: old.assignmentId,
          canId: old.canId,
          officerId: old.officerId,
          nominal: BigInt(body.nominal),
          paymentMethod: old.paymentMethod,
          collectedAt: old.collectedAt,
          submittedAt: new Date(),
          syncStatus: 'COMPLETED',
          isLatest: true,
          submitSequence: old.submitSequence + 1,
          alasanResubmit: body.alasan_resubmit,
          deviceInfo: old.deviceInfo,
          latitude: old.latitude,
          longitude: old.longitude,
          offlineId: old.offlineId ? `${old.offlineId}-rev-${old.submitSequence + 1}` : null,
        }).returning();

        // 5. Update Can totals
        const diff = BigInt(body.nominal) - old.nominal;
        await tx.update(schema.cans).set({
          totalCollected: sql`${schema.cans.totalCollected} + ${diff}`,
        }).where(eq(schema.cans.id, old.canId));

        // 6. Log activity
        await tx.insert(schema.activityLogs).values({
          userId: user.id,
          actionType: 'RESUBMIT_COLLECTION',
          entityType: 'collections',
          entityId: newRecord.id,
          oldData: old as any,
          newData: newRecord as any,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });

        return newRecord;
      });

      return reply.send({ success: true, data: result });
    } catch (error: any) {
      if (error.message === 'COLLECTION_NOT_FOUND_OR_NOT_LATEST') {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Data tidak ditemukan atau sudah pernah di-resubmit' } });
      }
      if (error.message === 'FORBIDDEN') {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Tidak memiliki akses ke data ini' } });
      }
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });
}

export default adminRoutes;
