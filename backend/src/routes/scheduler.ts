// Scheduler Routes - Automated Tasks

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';

const generateTasksSchema = z.object({
  year: z.number().min(2020).max(2100),
  month: z.number().min(1).max(12),
});

export async function schedulerRoutes(fastify: FastifyInstance) {
  // Internal routes - should be protected with internal API key in production
  fastify.addHook('preHandler', async (request, reply) => {
    const apiKey = request.headers['x-internal-api-key'];
    // In production, verify internal API key
    // if (apiKey !== process.env.INTERNAL_API_KEY) {
    //   return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    // }
  });

  // POST /scheduler/generate-tasks
  fastify.post('/generate-tasks', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = generateTasksSchema.parse(request.body);
      const { year, month } = body;

      const existingAssignments = await prisma.assignments.findMany({
        where: { period_year: year, period_month: month },
        select: { can_id: true },
      });

      const assignedCanIds = existingAssignments.map(a => a.can_id);

      const cansToAssign = await prisma.cans.findMany({
        where: {
          is_active: true,
          id: { notIn: assignedCanIds },
        },
        include: {
          branches: {
            include: {
              officers: {
                where: { is_active: true },
              },
            },
          },
        },
      });

      let totalAssignments = 0;
      const assignmentData = [];

      for (const can of cansToAssign) {
        const branch = can.branches;
        const officers = branch?.officers || [];

        if (officers.length === 0) {
          fastify.log.warn(`No active officers for can ${can.qr_code}`);
          continue;
        }

        const primaryOfficer = officers[0];
        const backupOfficer = officers.length > 1 ? officers[1] : null;

        assignmentData.push({
          can_id: can.id,
          officer_id: primaryOfficer.id,
          backup_officer_id: backupOfficer?.id || null,
          period_year: year,
          period_month: month,
          status: 'ACTIVE',
          assigned_at: new Date(),
        });

        totalAssignments++;
      }

      if (assignmentData.length > 0) {
        await prisma.assignments.createMany({
          data: assignmentData,
          skipDuplicates: true,
        });
      }

      return reply.send({
        success: true,
        data: {
          total_assignments: totalAssignments,
          assigned_to_officers: new Set(assignmentData.map(a => a.officer_id)).size,
          period: `${year}-${String(month).padStart(2, '0')}`,
        },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Input tidak valid' },
        });
      }

      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' },
      });
    }
  });

  // POST /scheduler/calculate-summaries
  fastify.post('/calculate-summaries', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = z.object({
        year: z.number().min(2020).max(2100),
        month: z.number().min(1).max(12),
      }).parse(request.body);

      const { year, month } = body;
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      const collections = await prisma.collections.findMany({
        where: {
          collected_at: {
            gte: startDate.toISOString(),
            lte: endDate.toISOString(),
          },
          sync_status: 'COMPLETED',
        },
        include: {
          can: { include: { branch: true } },
          officer: true,
        },
      });

      await prisma.collectionSummaries.deleteMany({
        where: { period_year: year, period_month: month },
      });

      const byDistrict: Record<string, { total: number; count: number; cash: number; cashCount: number; transfer: number; transferCount: number }> = {};
      const byBranch: Record<string, { total: number; count: number; cash: number; cashCount: number; transfer: number; transferCount: number }> = {};
      const byOfficer: Record<string, { total: number; count: number; cash: number; cashCount: number; transfer: number; transferCount: number }> = {};

      for (const col of collections) {
        const amount = Number(col.amount);
        const districtId = col.can.branch.district_id;
        const branchId = col.can.branch_id;
        const officerId = col.officer_id;

        if (!byDistrict[districtId]) {
          byDistrict[districtId] = { total: 0, count: 0, cash: 0, cashCount: 0, transfer: 0, transferCount: 0 };
        }
        byDistrict[districtId].count++;
        byDistrict[districtId].total += amount;
        if (col.payment_method === 'CASH') {
          byDistrict[districtId].cash += amount;
          byDistrict[districtId].cashCount++;
        } else {
          byDistrict[districtId].transfer += amount;
          byDistrict[districtId].transferCount++;
        }

        if (!byBranch[branchId]) {
          byBranch[branchId] = { total: 0, count: 0, cash: 0, cashCount: 0, transfer: 0, transferCount: 0 };
        }
        byBranch[branchId].count++;
        byBranch[branchId].total += amount;
        if (col.payment_method === 'CASH') {
          byBranch[branchId].cash += amount;
          byBranch[branchId].cashCount++;
        } else {
          byBranch[branchId].transfer += amount;
          byBranch[branchId].transferCount++;
        }

        if (!byOfficer[officerId]) {
          byOfficer[officerId] = { total: 0, count: 0, cash: 0, cashCount: 0, transfer: 0, transferCount: 0 };
        }
        byOfficer[officerId].count++;
        byOfficer[officerId].total += amount;
        if (col.payment_method === 'CASH') {
          byOfficer[officerId].cash += amount;
          byOfficer[officerId].cashCount++;
        } else {
          byOfficer[officerId].transfer += amount;
          byOfficer[officerId].transferCount++;
        }
      }

      const summaries = [];

      for (const [districtId, data] of Object.entries(byDistrict)) {
        summaries.push({
          period_year: year,
          period_month: month,
          district_id: districtId,
          total_amount: data.total,
          collection_count: data.count,
          cash_amount: data.cash,
          cash_count: data.cashCount,
          transfer_amount: data.transfer,
          transfer_count: data.transferCount,
        });
      }

      for (const [branchId, data] of Object.entries(byBranch)) {
        summaries.push({
          period_year: year,
          period_month: month,
          branch_id: branchId,
          total_amount: data.total,
          collection_count: data.count,
          cash_amount: data.cash,
          cash_count: data.cashCount,
          transfer_amount: data.transfer,
          transfer_count: data.transferCount,
        });
      }

      for (const [officerId, data] of Object.entries(byOfficer)) {
        summaries.push({
          period_year: year,
          period_month: month,
          officer_id: officerId,
          total_amount: data.total,
          collection_count: data.count,
          cash_amount: data.cash,
          cash_count: data.cashCount,
          transfer_amount: data.transfer,
          transfer_count: data.transferCount,
        });
      }

      await prisma.collectionSummaries.createMany({ data: summaries });

      return reply.send({
        success: true,
        data: {
          period: `${year}-${String(month).padStart(2, '0')}`,
          districts_processed: Object.keys(byDistrict).length,
          branches_processed: Object.keys(byBranch).length,
          officers_processed: Object.keys(byOfficer).length,
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

  // GET /scheduler/stats
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const [
        totalCans,
        totalOfficers,
        currentMonthCollections,
        pendingSync,
      ] = await Promise.all([
        prisma.cans.count({ where: { is_active: true } }),
        prisma.officers.count({ where: { is_active: true } }),
        prisma.collections.findMany({
          where: {
            collected_at: {
              gte: new Date(currentYear, currentMonth - 1, 1).toISOString(),
            },
            sync_status: 'COMPLETED',
          },
        }),
        prisma.collections.count({
          where: { sync_status: { in: ['PENDING', 'FAILED'] } },
        }),
      ]);

      return reply.send({
        success: true,
        data: {
          total_cans: totalCans,
          total_officers: totalOfficers,
          current_month: {
            collections: currentMonthCollections.length,
            amount: currentMonthCollections.reduce((s, c) => s + Number(c.amount), 0),
          },
          pending_sync: pendingSync,
          server_time: now.toISOString(),
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
}

export default schedulerRoutes;