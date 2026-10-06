/**
 * Productivity Service — angka produktivitas PPK per scope + periode.
 *
 * Prinsip (sama dengan overviewService):
 * 1. Semua filter scope & periode di SQL, bukan JavaScript.
 * 2. Nominal & penjemputan memakai `sync_status = COMPLETED` DAN
 *    `getLatestCollectionCondition()` — resubmit dihitung sekali.
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

/** Kaleng baru disebar: created_at masuk periode (arus masuk basis). */
export async function getNewCansCount(
  scope: OverviewScopeInput,
  year: number,
  months: number[],
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.cans)
    .where(and(
      scopeCondition(scope),
      inSelectedMonths(schema.cans.createdAt, year, months),
    ));
  return Number(row?.count ?? 0);
}

/** Kaleng ditarik: transisi → DIKEMBALIKAN pada periode (arus keluar basis). */
export async function getWithdrawnCount(
  scope: OverviewScopeInput,
  year: number,
  months: number[],
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.cans)
    .where(and(
      scopeCondition(scope),
      eq(schema.cans.condition, 'DIKEMBALIKAN'),
      inSelectedMonths(schema.cans.updatedAt, year, months),
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
    .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
    .where(and(
      scopeCondition(scope),
      eq(schema.collections.syncStatus, 'COMPLETED'),
      getLatestCollectionCondition(),
      inSelectedMonths(schema.collections.collectedAt, year, months),
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
  /** Seluruh baris penugasan pada periode. */
  assigned: number;
  /** Penjemputan COMPLETED versi terbaru. */
  collected: number;
  /** Dari yang dijemput: nominal > 0. */
  filled: number;
  /** Tugas UNCOLLECTED pada periode. */
  uncollected: number;
}

/**
 * Tabel produktivitas per PPK: petugas yang punya ≥1 penugasan pada periode
 * dalam scope. Atribusi: tugas → assignments.officerId, jemput →
 * collections.officerId (keduanya petugas pelaksana, bukan pemilik kaleng).
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

  const [officers, taskRows, collectionRows] = await Promise.all([
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
      assigned: sql<number>`count(*)::int`,
      uncollected: sql<number>`count(*) filter (where ${schema.assignments.status} = 'UNCOLLECTED')::int`,
    })
      .from(schema.assignments)
      .innerJoin(schema.cans, eq(schema.assignments.canId, schema.cans.id))
      .where(and(
        scopeCondition(scope),
        inAssignmentPeriod(year, months),
      ))
      .groupBy(schema.assignments.officerId),

    db.select({
      officerId: schema.collections.officerId,
      collected: sql<number>`count(*)::int`,
      filled: sql<number>`count(*) filter (where ${schema.collections.nominal} > 0)::int`,
    })
      .from(schema.collections)
      .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
      .where(and(
        scopeCondition(scope),
        eq(schema.collections.syncStatus, 'COMPLETED'),
        getLatestCollectionCondition(),
        inSelectedMonths(schema.collections.collectedAt, year, months),
      ))
      .groupBy(schema.collections.officerId),
  ]);

  const taskByOfficer = new Map(taskRows.map((r) => [r.officerId, r]));
  const colByOfficer = new Map(collectionRows.map((r) => [r.officerId, r]));

  return officers
    .filter((o) => taskByOfficer.has(o.id))
    .map((o) => {
      const t = taskByOfficer.get(o.id);
      const c = colByOfficer.get(o.id);
      return {
        officer_id: o.id,
        full_name: o.fullName,
        employee_code: o.employeeCode,
        branch_id: o.branchId,
        branch_name: o.branchName ?? '',
        assigned: Number(t?.assigned ?? 0),
        collected: Number(c?.collected ?? 0),
        filled: Number(c?.filled ?? 0),
        uncollected: Number(t?.uncollected ?? 0),
      };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'id'));
}
