/**
 * Productivity Service — angka produktivitas PPK per scope + periode.
 *
 * Prinsip (sama dengan overviewService):
 * 1. Semua filter scope & periode di SQL, bukan JavaScript.
 * 2. Setoran PICKUP memakai `sync_status = COMPLETED` dan
 *    `getLatestCollectionCondition()` — resubmit dihitung sekali; hasil VISIT
 *    memakai catatan verifikasi terbaru per kaleng dan periode tugas.
 * 3. Atribusi wilayah memakai `cans.branch_id` (pemilik kaleng).
 *
 * Batasan jujur `reactivated`: dihitung dari proposal APPROVED → AKTIF.
 * Reaktivasi jalur cepat (`PUT /cans/:id`) dan restore otomatis tidak
 * menulis proposal sehingga tidak tercakup (lihat debt-approve-nonaktif).
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { getLatestCollectionCondition } from './collectionSubmission';
import {
  inAssignmentPeriod,
  inSelectedMonths,
  scopeCondition,
  type OverviewScopeInput,
} from './overviewService';

/** Kaleng aktif kembali: proposal APPROVED → AKTIF pada periode. */
export async function getReactivatedCount(
  scope: OverviewScopeInput,
  year: number,
  months: number[],
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.canConditionProposals)
    .innerJoin(schema.cans, eq(schema.canConditionProposals.canId, schema.cans.id))
    .where(and(
      scopeCondition(scope),
      eq(schema.canConditionProposals.status, 'APPROVED'),
      eq(schema.canConditionProposals.toCondition, 'AKTIF'),
      isNotNull(schema.canConditionProposals.approvedAt),
      inSelectedMonths(schema.canConditionProposals.approvedAt, year, months),
    ));
  return Number(row?.count ?? 0);
}

/** Hasil jemput agregat: dijemput + kosong (nominal 0) pada periode. */
export async function getCollectionOutcome(
  scope: OverviewScopeInput,
  year: number,
  months: number[],
): Promise<{ collected: number; empty: number }> {
  const [row] = await db
    .select({
      collected: sql<number>`count(*)::int`,
      empty: sql<number>`count(*) filter (where ${schema.collections.nominal} = 0)::int`,
    })
    .from(schema.collections)
    .innerJoin(schema.assignments, eq(schema.collections.assignmentId, schema.assignments.id))
    .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
    .where(and(
      scopeCondition(scope),
      eq(schema.collections.syncStatus, 'COMPLETED'),
      getLatestCollectionCondition(),
      inAssignmentPeriod(year, months),
    ));
  return {
    collected: Number(row?.collected ?? 0),
    empty: Number(row?.empty ?? 0),
  };
}

export interface OfficerProductivityItem {
  officer_id: string;
  full_name: string;
  employee_code: string;
  branch_id: string;
  branch_name: string;
  pickup: {
    assigned: number;
    collected: number;
    filled: number;
    empty: number;
    failed: number;
  };
  visit: {
    assigned: number;
    visited: number;
    isi: number;
    empty: number;
    returned: number;
    failed: number;
  };
}

/**
 * Produktivitas per PPK dan jenis tugas. Penugasan diatribusikan ke petugas
 * assignment; hasil dijemput/dikunjungi ke petugas pelaksana.
 */
export async function getOfficerProductivity(
  scope: OverviewScopeInput,
  year: number,
  months: number[],
): Promise<OfficerProductivityItem[]> {
  const officerScope = scope.branchId
    ? eq(schema.officers.branchId, scope.branchId)
    : inArray(
      schema.officers.branchId,
      db.select({ id: schema.branches.id }).from(schema.branches)
        .where(eq(schema.branches.districtId, scope.districtId)),
    );

  const [officers, taskRows, pickupCollectionRows, visitRows] = await Promise.all([
    db.select({
      id: schema.officers.id,
      fullName: schema.officers.fullName,
      employeeCode: schema.officers.employeeCode,
      branchId: schema.officers.branchId,
      branchName: schema.branches.name,
    })
      .from(schema.officers)
      .innerJoin(schema.branches, eq(schema.officers.branchId, schema.branches.id))
      .where(officerScope),

    db.select({
      officerId: schema.assignments.officerId,
      kind: schema.assignments.kind,
      assigned: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where ${schema.assignments.status} = 'UNCOLLECTED')::int`,
    })
      .from(schema.assignments)
      .innerJoin(schema.cans, eq(schema.assignments.canId, schema.cans.id))
      .where(and(
        scopeCondition(scope),
        inAssignmentPeriod(year, months),
      ))
      .groupBy(schema.assignments.officerId, schema.assignments.kind),

    db.select({
      officerId: schema.collections.officerId,
      collected: sql<number>`count(*)::int`,
      filled: sql<number>`count(*) filter (where ${schema.collections.nominal} > 0)::int`,
      empty: sql<number>`count(*) filter (where ${schema.collections.nominal} = 0)::int`,
    })
      .from(schema.collections)
      .innerJoin(schema.assignments, eq(schema.collections.assignmentId, schema.assignments.id))
      .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
      .where(and(
        scopeCondition(scope),
        eq(schema.assignments.kind, 'PICKUP'),
        eq(schema.collections.syncStatus, 'COMPLETED'),
        getLatestCollectionCondition(),
        inAssignmentPeriod(year, months),
      ))
      .groupBy(schema.collections.officerId),

    (async () => {
      const latestVisitRows = db.select({
        officerId: schema.canVisits.officerId,
        outcome: schema.canVisits.outcome,
        rowNumber: sql<number>`row_number() over (
          partition by ${schema.canVisits.canId}, ${schema.canVisits.periodYear}, ${schema.canVisits.periodMonth}
          order by ${schema.canVisits.visitedAt} desc, ${schema.canVisits.createdAt} desc, ${schema.canVisits.id} desc
        )`.as('visit_row_number'),
      })
        .from(schema.canVisits)
        .innerJoin(schema.cans, eq(schema.canVisits.canId, schema.cans.id))
        .where(and(
          scopeCondition(scope),
          eq(schema.canVisits.purpose, 'VERIFIKASI'),
          eq(schema.canVisits.periodYear, year),
          inArray(schema.canVisits.periodMonth, months),
        ))
        .as('latest_visit_rows');

      return db.select({
        officerId: latestVisitRows.officerId,
        visited: sql<number>`count(*) filter (where ${latestVisitRows.outcome} in ('ISI', 'KOSONG', 'DIKEMBALIKAN'))::int`,
        isi: sql<number>`count(*) filter (where ${latestVisitRows.outcome} = 'ISI')::int`,
        empty: sql<number>`count(*) filter (where ${latestVisitRows.outcome} = 'KOSONG')::int`,
        returned: sql<number>`count(*) filter (where ${latestVisitRows.outcome} = 'DIKEMBALIKAN')::int`,
      })
        .from(latestVisitRows)
        .where(eq(latestVisitRows.rowNumber, 1))
        .groupBy(latestVisitRows.officerId);
    })(),
  ]);

  type TaskCounts = { assigned: number; failed: number };
  type TasksByKind = { pickup: TaskCounts; visit: TaskCounts };
  const emptyTaskCounts = (): TaskCounts => ({ assigned: 0, failed: 0 });
  const taskByOfficer = new Map<string, TasksByKind>();
  for (const row of taskRows) {
    const tasks = taskByOfficer.get(row.officerId) ?? {
      pickup: emptyTaskCounts(),
      visit: emptyTaskCounts(),
    };
    const counts = row.kind === 'PICKUP' ? tasks.pickup : tasks.visit;
    counts.assigned = Number(row.assigned);
    counts.failed = Number(row.failed);
    taskByOfficer.set(row.officerId, tasks);
  }

  const pickupByOfficer = new Map(pickupCollectionRows.map((row) => [row.officerId, row]));
  const visitByOfficer = new Map(visitRows.map((row) => [row.officerId, row]));
  const activeOfficerIds = new Set([
    ...taskByOfficer.keys(),
    ...pickupByOfficer.keys(),
    ...visitByOfficer.keys(),
  ]);

  return officers
    .filter((o) => activeOfficerIds.has(o.id))
    .map((o) => {
      const tasks = taskByOfficer.get(o.id) ?? {
        pickup: emptyTaskCounts(),
        visit: emptyTaskCounts(),
      };
      const pickup = pickupByOfficer.get(o.id);
      const visit = visitByOfficer.get(o.id);
      return {
        officer_id: o.id,
        full_name: o.fullName,
        employee_code: o.employeeCode,
        branch_id: o.branchId,
        branch_name: o.branchName ?? '',
        pickup: {
          assigned: tasks.pickup.assigned,
          collected: Number(pickup?.collected ?? 0),
          filled: Number(pickup?.filled ?? 0),
          empty: Number(pickup?.empty ?? 0),
          failed: tasks.pickup.failed,
        },
        visit: {
          assigned: tasks.visit.assigned,
          visited: Number(visit?.visited ?? 0),
          isi: Number(visit?.isi ?? 0),
          empty: Number(visit?.empty ?? 0),
          returned: Number(visit?.returned ?? 0),
          failed: tasks.visit.failed,
        },
      };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'id'));
}
