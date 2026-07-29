// Scheduler Routes - Automated / Internal Tasks

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, asc, gte, lte, inArray, sql } from 'drizzle-orm';
import { config } from '../config/env';
import { getLatestCollectionCondition } from '../services/collectionSubmission';
import { findCansWithoutAssignment, buildFirstOfficerAssignments, insertAssignments } from '../services/assignmentGenerator';
import { sendSuccess, sendError, sendInternalError } from '../utils/response';
import { insertActivityLog } from '../services/auditLogService';

const generateTasksSchema = z.object({
  year: z.number().min(2020).max(2100),
  month: z.number().min(1).max(12),
});

export async function schedulerRoutes(fastify: FastifyInstance) {
  // Internal API key guard
  fastify.addHook('preHandler', async (request, reply) => {
    const apiKey = request.headers['x-internal-api-key'];
    if (!config.INTERNAL_API_KEY) {
      return sendError(reply, 503, 'NOT_CONFIGURED', 'Scheduler API tidak dikonfigurasi');
    }
    if (apiKey !== config.INTERNAL_API_KEY) {
      try {
        await insertActivityLog({
          userId: null,
          officerId: null,
          actionType: 'SCHEDULER_MISMATCH',
          entityType: 'system',
          entityId: null,
          oldData: { providedKey: apiKey ? '[REDACTED]' : 'MISSING' },
          newData: null,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] || null,
        });
      } catch (err) {
        request.log.error({ err }, 'SCHEDULER_MISMATCH audit log failed');
      }
      return sendError(reply, 403, 'FORBIDDEN', 'Internal API key tidak valid');
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

      return sendSuccess(reply, {
        total_assignments: created,
        assigned_to_officers: new Set(assignmentItems.map((a: any) => a.officerId)).size,
        skipped_no_officer: cansToAssign.length - assignmentItems.length,
        period: `${year}-${String(month).padStart(2, '0')}`,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }
      return sendInternalError(reply, error, fastify.log);
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

      type SummaryAcc = { total: number; count: number };
      const byDistrict: Record<string, SummaryAcc> = {};
      const byBranch: Record<string, SummaryAcc> = {};
      const byOfficer: Record<string, SummaryAcc> = {};

      const initAcc = (): SummaryAcc => ({ total: 0, count: 0 });

      const addToAcc = (acc: SummaryAcc, amount: number) => { acc.total += amount; acc.count++; };

      for (const col of collections) {
        const nominal = Number(col.nominal);
        const districtId = col.can.branch.districtId;
        const branchId = col.can.branchId;
        const officerId = col.officerId;

        if (!byDistrict[districtId]) byDistrict[districtId] = initAcc();
        addToAcc(byDistrict[districtId], nominal);

        if (!byBranch[branchId]) byBranch[branchId] = initAcc();
        addToAcc(byBranch[branchId], nominal);

        if (!byOfficer[officerId]) byOfficer[officerId] = initAcc();
        addToAcc(byOfficer[officerId], nominal);
      }

      const summaries = [
        ...Object.entries(byDistrict).map(([districtId, d]) => ({
          periodId: `${year}-${month}`, // hypothetical helper but sticking to schema:
          periodYear: year, periodMonth: month,
          districtId, branchId: null, officerId: null,
          totalAmount: BigInt(d.total), collectionCount: d.count,
        })),
        ...Object.entries(byBranch).map(([branchId, d]) => ({
          periodYear: year, periodMonth: month,
          districtId: null, branchId, officerId: null,
          totalAmount: BigInt(d.total), collectionCount: d.count,
        })),
        ...Object.entries(byOfficer).map(([officerId, d]) => ({
          periodYear: year, periodMonth: month,
          districtId: null, branchId: null, officerId,
          totalAmount: BigInt(d.total), collectionCount: d.count,
        })),
      ];

      if (summaries.length > 0) {
        await db.transaction(async (tx) => {
          await tx.delete(schema.collectionSummaries)
            .where(and(eq(schema.collectionSummaries.periodYear, year), eq(schema.collectionSummaries.periodMonth, month)));
          await tx.insert(schema.collectionSummaries).values(summaries as any[]);
        });
      }

      return sendSuccess(reply, {
        period: `${year}-${String(month).padStart(2, '0')}`,
        districts_processed: Object.keys(byDistrict).length,
        branches_processed: Object.keys(byBranch).length,
        officers_processed: Object.keys(byOfficer).length,
        total_summaries: summaries.length,
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
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

      return sendSuccess(reply, {
        total_cans: totalCans,
        total_officers: totalOfficers,
        current_month: {
          collections: Number(monthCollections.count) || 0,
          nominal: Number(monthCollections.total_nominal) || 0,
        },
        pending_sync: pendingSync,
        server_time: now.toISOString(),
      });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });
}

export default schedulerRoutes;
