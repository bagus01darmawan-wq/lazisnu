// Bendahara Routes - Financial Reports API

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, desc, asc, gte, lte, inArray } from 'drizzle-orm';
import { authenticate, authorize } from '../middleware/auth';

export async function bendaharaRoutes(fastify: FastifyInstance) {
  // Apply auth middleware
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', authorize('BENDAHARA'));

  // GET /bendahara/dashboard
  fastify.get('/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const monthCollections = await db.query.collections.findMany({
        where: and(gte(schema.collections.collectedAt, monthStart), eq(schema.collections.syncStatus, 'COMPLETED')),
        with: {
          can: {
            with: {
              branch: { with: { district: true } },
            },
          },
          officer: { columns: { id: true, fullName: true } },
        },
      });

      // Aggregate
      const byDistrict: Record<string, { name: string; total: number; count: number }> = {};
      const byOfficer: Record<string, { name: string; total: number; count: number }> = {};
      let cashTotal = 0, cashCount = 0, transferTotal = 0, transferCount = 0;

      for (const col of monthCollections) {
        const districtId = col.can.branch.districtId;
        const districtName = col.can.branch.district.name;
        const nominal = Number(col.nominal);

        if (!byDistrict[districtId]) {
          byDistrict[districtId] = { name: districtName, total: 0, count: 0 };
        }
        byDistrict[districtId].total += nominal;
        byDistrict[districtId].count++;

        if (!byOfficer[col.officerId]) {
          byOfficer[col.officerId] = { name: col.officer.fullName, total: 0, count: 0 };
        }
        byOfficer[col.officerId].total += nominal;
        byOfficer[col.officerId].count++;

        if (col.paymentMethod === 'CASH') { cashTotal += nominal; cashCount++; }
        else { transferTotal += nominal; transferCount++; }
      }

      return reply.send({
        success: true,
        data: {
          current_month: {
            total: monthCollections.reduce((s, c) => s + Number(c.nominal), 0),
            count: monthCollections.length,
            cash: cashTotal,
            transfer: transferTotal,
            cash_count: cashCount,
            transfer_count: transferCount,
          },
          by_district: Object.entries(byDistrict).map(([id, d]) => ({
            district_id: id,
            district_name: d.name,
            total: d.total,
            count: d.count,
          })),
          by_officer: Object.entries(byOfficer).map(([id, o]) => ({
            officer_id: id,
            officer_name: o.name,
            total: o.total,
            count: o.count,
          })),
          by_payment_method: { cash: cashTotal, transfer: transferTotal },
          recent_transactions: monthCollections.slice(-10).map((c) => ({
            id: c.id,
            nominal: Number(c.nominal),
            payment_method: c.paymentMethod,
            collected_at: c.collectedAt,
            officer_name: c.officer.fullName,
            owner_name: c.can.ownerName,
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
  });

  // GET /bendahara/collections
  fastify.get('/collections', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as {
        start_date?: string;
        end_date?: string;
        officer_id?: string;
        district_id?: string;
        page?: string;
        limit?: string;
      };

      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '20');
      const skip = (page - 1) * limit;

      const conditions = [eq(schema.collections.syncStatus, 'COMPLETED')];
      if (query.start_date && query.end_date) {
        conditions.push(and(gte(schema.collections.collectedAt, new Date(query.start_date)), lte(schema.collections.collectedAt, new Date(query.end_date)))!);
      }
      if (query.officer_id) conditions.push(eq(schema.collections.officerId, query.officer_id));

      // DB-level district filter: get can IDs in that district first
      if (query.district_id) {
        const districtBranches = await db.select({ id: schema.branches.id })
          .from(schema.branches)
          .where(eq(schema.branches.districtId, query.district_id));
        const branchIds = districtBranches.map(b => b.id);

        if (branchIds.length === 0) {
          return reply.send({ success: true, data: { collections: [], pagination: { page, limit, total: 0, total_pages: 0 } } });
        }

        const districtCans = await db.select({ id: schema.cans.id })
          .from(schema.cans)
          .where(inArray(schema.cans.branchId, branchIds));
        const canIds = districtCans.map(c => c.id);

        if (canIds.length === 0) {
          return reply.send({ success: true, data: { collections: [], pagination: { page, limit, total: 0, total_pages: 0 } } });
        }

        conditions.push(inArray(schema.collections.canId, canIds));
      }

      const whereClause = and(...conditions);

      const [collections, total] = await Promise.all([
        db.query.collections.findMany({
          where: whereClause,
          with: {
            can: { with: { branch: { with: { district: true } } } },
            officer: { columns: { fullName: true, employeeCode: true } },
          },
          orderBy: [desc(schema.collections.collectedAt)],
          limit,
          offset: skip,
        }),
        db.$count(schema.collections, whereClause),
      ]);

      return reply.send({
        success: true,
        data: {
          collections: collections.map((c) => ({
            id: c.id,
            qr_code: c.can.qrCode,
            owner_name: c.can.ownerName,
            owner_address: c.can.ownerAddress,
            nominal: Number(c.nominal),
            payment_method: c.paymentMethod,
            collected_at: c.collectedAt,
            officer_name: c.officer.fullName,
            officer_code: c.officer.employeeCode,
            branch_name: c.can.branch.name,
            district_name: c.can.branch.district.name,
          })),
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

  // GET /bendahara/collections/:id
  fastify.get('/collections/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      const [collection, notification] = await Promise.all([
        db.query.collections.findFirst({
          where: eq(schema.collections.id, id),
          with: {
            can: {
              with: {
                branch: { with: { district: true } },
              },
            },
            officer: { columns: { fullName: true, phone: true, employeeCode: true } },
            notifications: { orderBy: [desc(schema.notifications.createdAt)], limit: 1 },
          },
        }),
        db.query.notifications.findFirst({
          where: eq(schema.notifications.collectionId, id),
          orderBy: [desc(schema.notifications.createdAt)],
        }),
      ]);

      if (!collection) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Transaksi tidak ditemukan' },
        });
      }

      return reply.send({
        success: true,
        data: {
          id: collection.id,
          can: {
            qr_code: collection.can.qrCode,
            owner_name: collection.can.ownerName,
            owner_address: collection.can.ownerAddress,
            owner_phone: collection.can.ownerPhone,
          },
          officer: {
            name: collection.officer.fullName,
            phone: collection.officer.phone,
            code: collection.officer.employeeCode,
          },
          nominal: Number(collection.nominal),
          payment_method: collection.paymentMethod,
          collected_at: collection.collectedAt,
          submitted_at: collection.submittedAt,
          synced_at: collection.syncedAt,
          sync_status: collection.syncStatus,
          notification_status: notification?.status || 'NOT_SENT',
          latitude: collection.latitude,
          longitude: collection.longitude,
          branch_name: collection.can.branch.name,
          district_name: collection.can.branch.district.name,
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

  // GET /bendahara/reports/summary
  fastify.get('/reports/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { year?: string; month?: string };

      const year = parseInt(query.year || new Date().getFullYear().toString());
      const month = parseInt(query.month || (new Date().getMonth() + 1).toString());

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      const collections = await db.query.collections.findMany({
        where: and(gte(schema.collections.collectedAt, startDate), lte(schema.collections.collectedAt, endDate), eq(schema.collections.syncStatus, 'COMPLETED')),
        with: {
          can: { with: { branch: { with: { district: true } } } },
          officer: { columns: { id: true, fullName: true } },
        },
      });

      let totalAmount = 0, cashAmount = 0, transferAmount = 0;
      const byDistrict: Record<string, { name: string; amount: number }> = {};
      const byBranch: Record<string, { name: string; amount: number }> = {};
      const byOfficer: Record<string, { name: string; amount: number; count: number }> = {};

      for (const col of collections) {
        const nominal = Number(col.nominal);
        totalAmount += nominal;

        if (col.paymentMethod === 'CASH') cashAmount += nominal;
        else transferAmount += nominal;

        const districtId = col.can.branch.districtId;
        const branchId = col.can.branchId;
        const officerId = col.officer.id;

        if (!byDistrict[districtId]) {
          byDistrict[districtId] = { name: col.can.branch.district.name, amount: 0 };
        }
        byDistrict[districtId].amount += nominal;

        if (!byBranch[branchId]) {
          byBranch[branchId] = { name: col.can.branch.name, amount: 0 };
        }
        byBranch[branchId].amount += nominal;

        if (!byOfficer[officerId]) {
          byOfficer[officerId] = { name: col.officer.fullName, amount: 0, count: 0 };
        }
        byOfficer[officerId].amount += nominal;
        byOfficer[officerId].count++;
      }

      return reply.send({
        success: true,
        data: {
          period: { year, month },
          summary: {
            total_amount: totalAmount,
            total_count: collections.length,
            cash_amount: cashAmount,
            cash_count: collections.filter((c) => c.paymentMethod === 'CASH').length,
            transfer_amount: transferAmount,
            transfer_count: collections.filter((c) => c.paymentMethod === 'TRANSFER').length,
          },
          by_district: Object.entries(byDistrict).map(([id, d]) => ({
            district_id: id,
            district_name: d.name,
            amount: d.amount,
          })),
          by_branch: Object.entries(byBranch).map(([id, b]) => ({
            branch_id: id,
            branch_name: b.name,
            amount: b.amount,
          })),
          by_officer: Object.entries(byOfficer).map(([id, o]) => ({
            officer_id: id,
            officer_name: o.name,
            amount: o.amount,
            count: o.count,
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
  });

  // GET /bendahara/export (CSV)
  fastify.get('/export', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as {
        start_date: string;
        end_date: string;
        format?: string;
      };

      if (!query.start_date || !query.end_date) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'start_date dan end_date wajib diisi' },
        });
      }

      const collections = await db.query.collections.findMany({
        where: and(gte(schema.collections.collectedAt, new Date(query.start_date)), lte(schema.collections.collectedAt, new Date(query.end_date)), eq(schema.collections.syncStatus, 'COMPLETED')),
        with: {
          can: { with: { branch: { with: { district: true } } } },
          officer: { columns: { fullName: true, employeeCode: true } },
        },
        orderBy: [asc(schema.collections.collectedAt)],
      });

      const headers = [
        'Tanggal',
        'Kode QR',
        'Nama Pemilik',
        'Alamat',
        'Petugas',
        'Kode Petugas',
        'Ranting',
        'Kecamatan',
        'Metode',
        'Nominal',
      ];

      const rows = collections.map((c) => [
        new Date(c.collectedAt).toISOString().split('T')[0],
        c.can.qrCode,
        c.can.ownerName,
        `"${c.can.ownerAddress.replace(/"/g, '""')}"`,
        c.officer.fullName,
        c.officer.employeeCode,
        c.can.branch.name,
        c.can.branch.district.name,
        c.paymentMethod,
        Number(c.nominal).toString(),
      ]);

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header(
        'Content-Disposition',
        `attachment; filename="laporan-lazisnu-${query.start_date}-${query.end_date}.csv"`
      );
      return reply.send('\uFEFF' + csv); // BOM for Excel compatibility
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });
}

export default bendaharaRoutes;
