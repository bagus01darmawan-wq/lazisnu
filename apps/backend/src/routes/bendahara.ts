import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess } from '../utils/response';
import { getCollectionScope, getDashboardData, buildCollectionsQuery, getCollectionsList, getCollectionDetail } from '../services/reportService';

export async function bendaharaRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', authorize('BENDAHARA', 'ADMIN_KECAMATAN', 'ADMIN_RANTING'));

  fastify.get('/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await getDashboardData();
      return sendSuccess(reply, data);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
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
        return sendSuccess(reply, { collections: [], pagination: { page, limit, total: 0, total_pages: 0 } });
      }

      const data = await getCollectionsList({ whereClause, page, limit, skip });
      return sendSuccess(reply, data);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });

  fastify.get('/collections/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const data = await getCollectionDetail(id);

      if (!data) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Transaksi tidak ditemukan' } });
      }

      return sendSuccess(reply, data);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
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

      const collections = await getCollectionsList({ whereClause, page: 1, limit: 10000, skip: 0 });

      let totalAmount = 0;
      const byDistrict: Record<string, { name: string; amount: number }> = {};
      const byBranch: Record<string, { name: string; amount: number }> = {};
      const byOfficer: Record<string, { name: string; amount: number; count: number }> = {};

      for (const c of collections.collections) {
        totalAmount += c.nominal;
        if (!byDistrict[c.district_name]) byDistrict[c.district_name] = { name: c.district_name, amount: 0 };
        byDistrict[c.district_name].amount += c.nominal;
        if (!byBranch[c.branch_name]) byBranch[c.branch_name] = { name: c.branch_name, amount: 0 };
        byBranch[c.branch_name].amount += c.nominal;
        if (!byOfficer[c.officer_name]) byOfficer[c.officer_name] = { name: c.officer_name, amount: 0, count: 0 };
        byOfficer[c.officer_name].amount += c.nominal;
        byOfficer[c.officer_name].count++;
      }

      return sendSuccess(reply, {
        period: { year, month },
        summary: { total_amount: totalAmount, total_count: collections.pagination.total },
        by_district: Object.entries(byDistrict).map(([name, d]) => ({ district_name: name, amount: d.amount })),
        by_branch: Object.entries(byBranch).map(([name, b]) => ({ branch_name: name, amount: b.amount })),
        by_officer: Object.entries(byOfficer).map(([name, o]) => ({ officer_name: name, amount: o.amount, count: o.count })),
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } });
    }
  });
}
