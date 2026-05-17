// Scheduler Routes - Automated / Internal Tasks

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, asc, gte, lte, inArray, sql } from 'drizzle-orm';
import { config } from '../config/env';
import { getLatestCollectionCondition } from '../services/collectionSubmission';
import { findCansWithoutAssignment, buildFirstOfficerAssignments, insertAssignments } from '../services/assignmentGenerator';

const generateTasksSchema = z.object({
  year: z.number().min(2020).max(2100),
  month: z.number().min(1).max(12),
});

export async function schedulerRoutes(fastify: FastifyInstance) {
  // Internal API key guard
  fastify.addHook('preHandler', async (request, reply) => {
    const apiKey = request.headers['x-internal-api-key'];
    if (config.INTERNAL_API_KEY && apiKey !== config.INTERNAL_API_KEY) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Internal API key tidak valid' },
      });
    }
  });

  const latestCollectionCondition = getLatestCollectionCondition();

  // POST /scheduler/generate-tasks
  // Generates monthly assignments for all active cans
  fastify.post('/generate-tasks', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = generateTasksSchema.parse(request.body);
      const { year, month } = body;

      const { cansToAssign } = await findCansWithoutAssignment(year, month);

      const assignmentItems = buildFirstOfficerAssignments(cansToAssign, year, month);

      const { created } = await insertAssignments(assignmentItems, true);

      return reply.send({
        success: true,
        data: {
          total_assignments: created,
          assigned_to_officers: new Set(assignmentItems.map((a: any) => a.officerId)).size,
          skipped_no_officer: cansToAssign.length - assignmentItems.length,
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
  // Recalculates CollectionSummary for a given period
  fastify.post('/calculate-summaries', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = z
        .object({
          year: z.number().min(2020).max(2100),
          month: z.number().min(1).max(12),
        })
        .parse(request.body);

      const { year, month } = body;
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      const collections = await db.query.collections.findMany({
        where: and(
          gte(schema.collections.collectedAt, startDate), 
          lte(schema.collections.collectedAt, endDate), 
          eq(schema.collections.syncStatus, 'COMPLETED'),
          latestCollectionCondition
        ),
        with: {
          can: { with: { branch: true } },
          officer: true,
        },
      });

      // Delete existing summaries for this period
      await db.delete(schema.collectionSummaries)
        .where(and(eq(schema.collectionSummaries.periodYear, year), eq(schema.collectionSummaries.periodMonth, month)));

      type SummaryAcc = {
        total: number; count: number;
        cash: number; cashCount: number;
        transfer: number; transferCount: number;
      };
      const byDistrict: Record<string, SummaryAcc> = {};
      const byBranch: Record<string, SummaryAcc> = {};
      const byOfficer: Record<string, SummaryAcc> = {};

      const initAcc = (): SummaryAcc => ({
        total: 0, count: 0, cash: 0, cashCount: 0, transfer: 0, transferCount: 0,
      });

      const addToAcc = (acc: SummaryAcc, amount: number, method: string) => {
        acc.total += amount;
        acc.count++;
        if (method === 'CASH') { acc.cash += amount; acc.cashCount++; }
        else { acc.transfer += amount; acc.transferCount++; }
      };

      for (const col of collections) {
        const nominal = Number(col.nominal);
        const districtId = col.can.branch.districtId;
        const branchId = col.can.branchId;
        const officerId = col.officerId;
        const method = col.paymentMethod;

        if (!byDistrict[districtId]) byDistrict[districtId] = initAcc();
        addToAcc(byDistrict[districtId], nominal, method);

        if (!byBranch[branchId]) byBranch[branchId] = initAcc();
        addToAcc(byBranch[branchId], nominal, method);

        if (!byOfficer[officerId]) byOfficer[officerId] = initAcc();
        addToAcc(byOfficer[officerId], nominal, method);
      }

      const summaries = [
        ...Object.entries(byDistrict).map(([districtId, d]) => ({
          periodId: `${year}-${month}`, // hypothetical helper but sticking to schema:
          periodYear: year, periodMonth: month,
          districtId, branchId: null, officerId: null,
          totalAmount: BigInt(d.total), collectionCount: d.count,
          cashAmount: BigInt(d.cash), cashCount: d.cashCount,
          transferAmount: BigInt(d.transfer), transferCount: d.transferCount,
        })),
        ...Object.entries(byBranch).map(([branchId, d]) => ({
          periodYear: year, periodMonth: month,
          districtId: null, branchId, officerId: null,
          totalAmount: BigInt(d.total), collectionCount: d.count,
          cashAmount: BigInt(d.cash), cashCount: d.cashCount,
          transferAmount: BigInt(d.transfer), transferCount: d.transferCount,
        })),
        ...Object.entries(byOfficer).map(([officerId, d]) => ({
          periodYear: year, periodMonth: month,
          districtId: null, branchId: null, officerId,
          totalAmount: BigInt(d.total), collectionCount: d.count,
          cashAmount: BigInt(d.cash), cashCount: d.cashCount,
          transferAmount: BigInt(d.transfer), transferCount: d.transferCount,
        })),
      ];

      if (summaries.length > 0) {
        // cast because periodYear etc requires numbers but typescript infers type arrays correctly
        await db.insert(schema.collectionSummaries).values(summaries as any[]);
      }

      return reply.send({
        success: true,
        data: {
          period: `${year}-${String(month).padStart(2, '0')}`,
          districts_processed: Object.keys(byDistrict).length,
          branches_processed: Object.keys(byBranch).length,
          officers_processed: Object.keys(byOfficer).length,
          total_summaries: summaries.length,
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
  // Quick overview of system health for monitoring
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const monthStart = new Date(currentYear, currentMonth - 1, 1);

      const [totalCans, totalOfficers, sumResultRows, pendingSync] = await Promise.all([
        db.$count(schema.cans, eq(schema.cans.isActive, true)),
        db.$count(schema.officers, eq(schema.officers.isActive, true)),
        db.select({ count: sql<number>`count(*)`, total_nominal: sql<string>`sum(${schema.collections.nominal})` })
          .from(schema.collections)
          .where(and(
            gte(schema.collections.collectedAt, monthStart), 
            eq(schema.collections.syncStatus, 'COMPLETED'),
            latestCollectionCondition
          )),
        db.$count(schema.collections, inArray(schema.collections.syncStatus, ['PENDING', 'FAILED'])),
      ]);
      const monthCollections = sumResultRows[0];

      return reply.send({
        success: true,
        data: {
          total_cans: totalCans,
          total_officers: totalOfficers,
          current_month: {
            collections: Number(monthCollections.count) || 0,
            nominal: Number(monthCollections.total_nominal) || 0,
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
