// Bendahara Routes - Financial Reports API

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
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
      const yearStart = new Date(now.getFullYear(), 0, 1);

      // Current month collections
      const monthCollections = await prisma.collections.findMany({
        where: {
          collected_at: { gte: monthStart.toISOString() },
          sync_status: 'COMPLETED',
        },
        include: {
          can: {
            include: {
              branch: {
                include: { district: true }
              }
            }
          }
        }
      });

      // Group by district
      const byDistrict: Record<string, { total: number; count: number }> = {};
      const byOfficer: Record<string, { name: string; total: number; count: number }> = {};
      let cashTotal = 0;
      let cashCount = 0;
      let transferTotal = 0;
      let transferCount = 0;

      for (const col of monthCollections) {
        const districtId = col.can.branch.district.id;
        const districtName = col.can.branch.district.name;
        const officerId = col.officer_id;

        if (!byDistrict[districtId]) {
          byDistrict[districtId] = { total: 0, count: 0 };
        }
        byDistrict[districtId].total += Number(col.amount);
        byDistrict[districtId].count++;

        if (!byOfficer[officerId]) {
          byOfficer[officerId] = { name: col.officer_id, total: 0, count: 0 };
        }
        byOfficer[officerId].total += Number(col.amount);
        byOfficer[officerId].count++;

        if (col.payment_method === 'CASH') {
          cashTotal += Number(col.amount);
          cashCount++;
        } else {
          transferTotal += Number(col.amount);
          transferCount++;
        }
      }

      // Get officer names
      const officerIds = Object.keys(byOfficer);
      const officers = await prisma.officers.findMany({
        where: { id: { in: officerIds } },
        select: { id: true, full_name: true },
      });
      const officerMap = new Map(officers.map(o => [o.id, o.full_name]));

      return reply.send({
        success: true,
        data: {
          current_month: {
            total: monthCollections.reduce((s, c) => s + Number(c.amount), 0),
            count: monthCollections.length,
            cash: cashTotal,
            transfer: transferTotal,
            cash_count: cashCount,
            transfer_count: transferCount,
          },
          by_district: Object.entries(byDistrict).map(([id, data]) => ({
            district_id: id,
            district_name: monthCollections.find(c => c.can.branch.district.id === id)?.can.branch.district.name || 'Unknown',
            total: data.total,
            count: data.count,
          })),
          by_officer: officerIds.map(id => ({
            officer_id: id,
            officer_name: officerMap.get(id) || 'Unknown',
            total: byOfficer[id].total,
            count: byOfficer[id].count,
          })),
          by_payment_method: {
            cash: cashTotal,
            transfer: transferTotal,
          },
          recent_transactions: monthCollections.slice(-10).map(c => ({
            id: c.id,
            amount: Number(c.amount),
            payment_method: c.payment_method,
            collected_at: c.collected_at,
            officer_name: officerMap.get(c.officer_id) || 'Unknown',
            owner_name: c.can.owner_name,
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

      const where: any = { sync_status: 'COMPLETED' };

      if (query.start_date && query.end_date) {
        where.collected_at = {
          gte: query.start_date,
          lte: query.end_date,
        };
      }

      if (query.officer_id) {
        where.officer_id = query.officer_id;
      }

      if (query.district_id) {
        where.can = { branch: { district_id: query.district_id } };
      }

      const [collections, total] = await Promise.all([
        prisma.collections.findMany({
          where,
          include: {
            can: {
              include: {
                branch: { include: { district: true } }
              }
            },
            officer: { select: { full_name: true, employee_code: true } },
          },
          orderBy: { collected_at: 'desc' },
          skip,
          take: limit,
        }),
        prisma.collections.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: {
          collections: collections.map(c => ({
            id: c.id,
            qr_code: c.can.qr_code,
            owner_name: c.can.owner_name,
            owner_address: c.can.owner_address,
            amount: Number(c.amount),
            payment_method: c.payment_method,
            collected_at: c.collected_at,
            officer_name: c.officer.full_name,
            officer_code: c.officer.employee_code,
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

      const collection = await prisma.collections.findUnique({
        where: { id },
        include: {
          can: {
            include: {
              branch: { include: { district: true } }
            }
          },
          officer: { select: { full_name: true, phone: true, employee_code: true } },
          assignments: { select: { status: true } },
        },
      });

      if (!collection) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Transaksi tidak ditemukan' },
        });
      }

      // Get notification status
      const notification = await prisma.notifications.findFirst({
        where: { collection_id: id },
        orderBy: { created_at: 'desc' },
      });

      return reply.send({
        success: true,
        data: {
          id: collection.id,
          can: {
            qr_code: collection.can.qr_code,
            owner_name: collection.can.owner_name,
            owner_address: collection.can.owner_address,
            owner_phone: collection.can.owner_phone,
          },
          officer: {
            name: collection.officer.full_name,
            phone: collection.officer.phone,
            code: collection.officer.employee_code,
          },
          amount: Number(collection.amount),
          payment_method: collection.payment_method,
          collected_at: collection.collected_at,
          submitted_at: collection.submitted_at,
          synced_at: collection.synced_at,
          sync_status: collection.sync_status,
          notification_status: notification?.status || 'NOT_SENT',
          latitude: collection.latitude,
          longitude: collection.longitude,
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
      const endDate = new Date(year, month, 0);

      const collections = await prisma.collections.findMany({
        where: {
          collected_at: {
            gte: startDate.toISOString(),
            lte: endDate.toISOString(),
          },
          sync_status: 'COMPLETED',
        },
        include: {
          can: {
            include: { branch: { include: { district: true } } }
          },
          officer: { select: { id: true, full_name: true } },
        },
      });

      // Calculate summaries
      let totalAmount = 0;
      let cashAmount = 0;
      let transferAmount = 0;

      const byDistrict: Record<string, number> = {};
      const byBranch: Record<string, number> = {};
      const byOfficer: Record<string, { name: string; amount: number; count: number }> = {};

      for (const col of collections) {
        const amount = Number(col.amount);
        totalAmount += amount;

        if (col.payment_method === 'CASH') {
          cashAmount += amount;
        } else {
          transferAmount += amount;
        }

        const districtId = col.can.branch.district.id;
        const branchId = col.can.branch.id;
        const officerId = col.officer.id;

        byDistrict[districtId] = (byDistrict[districtId] || 0) + amount;
        byBranch[branchId] = (byBranch[branchId] || 0) + amount;

        if (!byOfficer[officerId]) {
          byOfficer[officerId] = { name: col.officer.full_name, amount: 0, count: 0 };
        }
        byOfficer[officerId].amount += amount;
        byOfficer[officerId].count++;
      }

      // Get district and branch names
      const [districts, branches] = await Promise.all([
        prisma.districts.findMany({ where: { id: { in: Object.keys(byDistrict) } } }),
        prisma.branches.findMany({ where: { id: { in: Object.keys(byBranch) } } }),
      ]);

      const districtMap = new Map(districts.map(d => [d.id, d.name]));
      const branchMap = new Map(branches.map(b => [b.id, b.name]));

      return reply.send({
        success: true,
        data: {
          period: { year, month },
          summary: {
            total_amount: totalAmount,
            total_count: collections.length,
            cash_amount: cashAmount,
            cash_count: collections.filter(c => c.payment_method === 'CASH').length,
            transfer_amount: transferAmount,
            transfer_count: collections.filter(c => c.payment_method === 'TRANSFER').length,
          },
          by_district: Object.entries(byDistrict).map(([id, amount]) => ({
            district_id: id,
            district_name: districtMap.get(id) || 'Unknown',
            amount,
          })),
          by_branch: Object.entries(byBranch).map(([id, amount]) => ({
            branch_id: id,
            branch_name: branchMap.get(id) || 'Unknown',
            amount,
          })),
          by_officer: Object.entries(byOfficer).map(([id, data]) => ({
            officer_id: id,
            officer_name: data.name,
            amount: data.amount,
            count: data.count,
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

  // GET /bendahara/export
  fastify.get('/export', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as {
        start_date: string;
        end_date: string;
        format?: string;
      };

      const collections = await prisma.collections.findMany({
        where: {
          collected_at: {
            gte: query.start_date,
            lte: query.end_date,
          },
          sync_status: 'COMPLETED',
        },
        include: {
          can: {
            include: { branch: { include: { district: true } } }
          },
          officer: { select: { full_name: true, employee_code: true } },
        },
        orderBy: { collected_at: 'asc' },
      });

      // Generate CSV
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

      const rows = collections.map(c => [
        new Date(c.collected_at).toISOString().split('T')[0],
        c.can.qr_code,
        c.can.owner_name,
        `"${c.can.owner_address.replace(/"/g, '""')}"`,
        c.officer.full_name,
        c.officer.employee_code,
        c.can.branch.name,
        c.can.branch.district.name,
        c.payment_method,
        Number(c.amount).toString(),
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(r => r.join(',')),
      ].join('\n');

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="report-${query.start_date}-${query.end_date}.csv"`);
      return reply.send(csv);
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