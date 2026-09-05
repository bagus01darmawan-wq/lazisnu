import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, authorize } from '../middleware/auth';
import { assertCollectionAccess } from '../middleware/ownership';
import { sendSuccess, sendError, sendInternalError } from '../utils/response';
import { getCollectionScope, buildCollectionsQuery, getCollectionsList, getCollectionsExportRows, getResubmitTrackerList } from '../services/collectionQueryService';
import { getCollectionDetail, getReportSummary, getReportStats } from '../services/collectionReportService';
import { getBendaharaDashboard } from '../services/dashboardReportService';
import { insertActivityLog } from '../services/auditLogService';

export async function bendaharaRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', authorize('ADMIN_KECAMATAN', 'ADMIN_RANTING'));

  fastify.get('/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await getBendaharaDashboard();
      return sendSuccess(reply, data);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.get('/collections', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { start_date?: string; end_date?: string; officer_id?: string; district_id?: string; branch_id?: string; search?: string; page?: string; limit?: string };
      const page = parseInt(query.page || '1');
      const limit = Math.min(100, parseInt(query.limit || '20'));
      const skip = (page - 1) * limit;

      const user = request.currentUser!;
      const scope = getCollectionScope(user.role, user.branchId, user.districtId);

      const { whereClause, emptyResult } = await buildCollectionsQuery({
        startDate: query.start_date,
        endDate: query.end_date,
        officerId: query.officer_id,
        districtId: query.district_id,
        branchId: query.branch_id,
        search: query.search,
        scope,
      });

      if (emptyResult || !whereClause) {
        return sendSuccess(reply, { items: [], collections: [], pagination: { page, limit, total: 0, total_pages: 0 } });
      }

      const data = await getCollectionsList({ whereClause, page, limit, skip });
      return sendSuccess(reply, data);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.get('/resubmits', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { branch_id?: string; search?: string; page?: string; limit?: string };
      const page = Math.max(1, parseInt(query.page || '1'));
      const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20')));
      const user = request.currentUser!;
      const scope = getCollectionScope(user.role, user.branchId, user.districtId);
      const data = await getResubmitTrackerList({
        page,
        limit,
        skip: (page - 1) * limit,
        search: query.search,
        branchId: query.branch_id,
        scope,
      });
      return sendSuccess(reply, data);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
  fastify.get('/collections/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const user = request.currentUser!;

      // Ownership check: pastikan collection milik branch/district user
      await assertCollectionAccess(user, id);

      const data = await getCollectionDetail(id);

      if (!data) {
        return sendError(reply, 404, 'NOT_FOUND', 'Transaksi tidak ditemukan');
      }

      return sendSuccess(reply, data);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.get('/export', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { start_date?: string; end_date?: string; officer_id?: string; district_id?: string; branch_id?: string; search?: string };
      const user = request.currentUser!;
      const scope = getCollectionScope(user.role, user.branchId, user.districtId);

      const { whereClause, emptyResult } = await buildCollectionsQuery({
        startDate: query.start_date,
        endDate: query.end_date,
        officerId: query.officer_id,
        districtId: query.district_id,
        branchId: query.branch_id,
        search: query.search,
        scope,
      });

      const headers = [
        'id',
        'tanggal',
        'petugas_nama',
        'petugas_kode',
        'kaleng_kode',
        'kaleng_nama_pemilik',
        'nominal',
        'metode_bayar',
        'submit_sequence',
        'is_latest',
        'alasan_resubmit',
        'wa_status',
        'wa_sent_at',
      ];

      const escapeCsv = (value: unknown) => {
        const raw = value instanceof Date ? value.toISOString() : String(value ?? '');
        return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
      };

      const rows = emptyResult || !whereClause ? [] : await getCollectionsExportRows(whereClause);
      const csvRows = [
        headers.join(','),
        ...rows.map((row) => headers.map((header) => escapeCsv(row[header as keyof typeof row])).join(',')),
      ];
      const csv = `\uFEFF${csvRows.join('\n')}`;

      // Catat log export CSV secara manual secara aman
      try {
        await insertActivityLog({
          userId: user.userId,
          officerId: user.officerId || null,
          actionType: 'EXPORT_CSV',
          entityType: 'reports',
          entityId: null,
          newData: {
            start_date: query.start_date || null,
            end_date: query.end_date || null,
            branch_id: query.branch_id || null,
            officer_id: query.officer_id || null,
            search: query.search || null,
          },
          ipAddress: (request.headers['x-forwarded-for'] as string) || request.ip,
          userAgent: request.headers['user-agent'] || null,
        });
      } catch (err) {
        request.log.error({ err }, 'Manual export CSV audit log insertion failed');
      }

      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="laporan-lazisnu-${new Date().toISOString().slice(0, 10)}.csv"`);

      return reply.send(csv);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.get('/reports/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { year?: string; month?: string; months?: string; branch_id?: string; officer_id?: string };
      const year = parseInt(query.year || new Date().getFullYear().toString());
      const monthList = query.months
        ? query.months.split(',').map(Number).filter(n => n >= 1 && n <= 12)
        : query.month
          ? [parseInt(query.month)]
          : Array.from({ length: 12 }, (_, i) => i + 1);

      const user = request.currentUser!;
      const scope = getCollectionScope(user.role, user.branchId, user.districtId);

      const startDate = `${year}-${String(monthList[0]).padStart(2, '0')}-01`;
      const lastMonth = monthList[monthList.length - 1];
      const endDate = new Date(year, lastMonth, 0).toISOString().split('T')[0];

      const { whereClause, emptyResult } = await buildCollectionsQuery({
        startDate,
        endDate,
        branchId: query.branch_id,
        officerId: query.officer_id,
        scope,
      });

      if (emptyResult || !whereClause) {
        return sendSuccess(reply, { period: { year, month: -1, months: monthList }, summary: { total_amount: 0, total_count: 0 }, by_district: [], by_branch: [], by_officer: [] });
      }

      const summaryData = await getReportSummary(whereClause);

      return sendSuccess(reply, {
        period: { year, month: -1, months: monthList },
        summary: { total_amount: Number(summaryData.totalRes?.total || 0), total_count: Number(summaryData.totalRes?.count || 0) },
        by_district: summaryData.districtRes.map(d => ({ district_name: d.districtName, amount: Number(d.total) })),
        by_branch: summaryData.branchRes.map(b => ({ branch_name: b.branchName, amount: Number(b.total) })),
        by_officer: summaryData.officerRes.map(o => ({ officer_name: o.officerName, amount: Number(o.total), count: Number(o.count) })),
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.get('/reports/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { year?: string; month?: string; months?: string; branch_id?: string };
      const year = parseInt(query.year || new Date().getFullYear().toString());
      const monthList = query.months
        ? query.months.split(',').map(Number).filter(n => n >= 1 && n <= 12)
        : query.month
          ? [parseInt(query.month)]
          : Array.from({ length: 12 }, (_, i) => i + 1);

      const user = request.currentUser!;

      const districtId = user.role === 'ADMIN_KECAMATAN' ? user.districtId : undefined;
      const branchId = user.role === 'ADMIN_RANTING' ? user.branchId : query.branch_id;

      const stats = await getReportStats({ year, months: monthList, branchId, districtId });

      return sendSuccess(reply, stats);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
