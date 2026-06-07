import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError, sendInternalError } from '../utils/response';
import { getCollectionScope, getDashboardData, buildCollectionsQuery, getCollectionsList, getCollectionDetail, getReportSummary } from '../services/reportService';

export async function bendaharaRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', authorize('BENDAHARA', 'ADMIN_KECAMATAN', 'ADMIN_RANTING'));

  fastify.get('/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await getDashboardData();
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

  fastify.get('/collections/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const data = await getCollectionDetail(id);

      if (!data) {
        return sendError(reply, 404, 'NOT_FOUND', 'Transaksi tidak ditemukan');
      }

      return sendSuccess(reply, data);
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  fastify.get('/reports/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { year?: string; month?: string; branch_id?: string; officer_id?: string };
      const year = parseInt(query.year || new Date().getFullYear().toString());
      const month = parseInt(query.month || (new Date().getMonth() + 1).toString());
      const user = request.currentUser!;
      const scope = getCollectionScope(user.role, user.branchId, user.districtId);

      const { whereClause, emptyResult } = await buildCollectionsQuery({
        startDate: `${year}-${String(month).padStart(2, '0')}-01`,
        endDate: new Date(year, month, 0).toISOString().split('T')[0],
        branchId: query.branch_id,
        officerId: query.officer_id,
        scope,
      });

      if (emptyResult || !whereClause) {
        return sendSuccess(reply, { period: { year, month }, summary: { total_amount: 0, total_count: 0 }, by_district: [], by_branch: [], by_officer: [] });
      }

      const summaryData = await getReportSummary(whereClause);

      return sendSuccess(reply, {
        period: { year, month },
        summary: { total_amount: Number(summaryData.totalRes?.total || 0), total_count: Number(summaryData.totalRes?.count || 0) },
        by_district: summaryData.districtRes.map(d => ({ district_name: d.districtName, amount: Number(d.total) })),
        by_branch: summaryData.branchRes.map(b => ({ branch_name: b.branchName, amount: Number(b.total) })),
        by_officer: summaryData.officerRes.map(o => ({ officer_name: o.officerName, amount: Number(o.total), count: Number(o.count) })),
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}
