/**
 * Overview Service — satu sumber agregasi untuk dashboard ranting dan kecamatan.
 *
 * Prinsip:
 * 1. Semua filter scope (district/branch) dan periode dilakukan di SQL, bukan di JavaScript.
 * 2. Nominal & jumlah penjemputan selalu memakai `sync_status = COMPLETED` DAN
 *    `getLatestCollectionCondition()` — resubmit hanya dihitung sekali.
 * 3. Pengelompokan per ranting memakai `cans.branch_id` (pemilik kaleng), bukan
 *    ranting petugas — memperbaiki bug lama di routes/admin/district.ts.
 * 4. Definisi metrik mengikuti conditionRules.ts dan tidak boleh dihitung ulang di browser.
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { and, eq, gte, lt, inArray, sql, desc } from 'drizzle-orm';
import { getLatestCollectionCondition } from './collectionSubmission';
import { computeTaskMetrics } from './taskMetrics';
import {
  ACTION_REQUIRED_CONDITIONS,
  ASSIGNABLE_CONDITIONS,
  PLACEMENT_CONDITIONS,
  actionLabel,
} from './conditionRules';
import type { CanConditionValue } from './conditionRules';
import { OPERATIONAL_TIMEZONE } from '../utils/operationalTimeZone';

export interface OverviewScopeInput {
  /** Kecamatan pemilik data — selalu diisi dari token, bukan dari query string. */
  districtId: string;
  /** Diisi hanya bila admin kecamatan menyaring satu ranting. */
  branchId?: string;
}

export interface OverviewPeriodInput {
  year: number;
  month: number;
}

/** Jumlah bulan yang dikembalikan pada tren operasional. */
export const TREND_MONTHS = 6;
/** Batas default daftar "perlu tindakan" pada overview. */
export const ACTION_ITEM_LIMIT = 10;

function sqlConditionList(conditions: CanConditionValue[]) {
  return sql`(${sql.join(conditions.map((c) => sql`${c}`), sql`, `)})`;
}

/**
 * Scope kaleng: ranting tertentu, atau seluruh ranting kecamatan lewat subquery.
 * Satu helper agar semua query memakai definisi scope yang identik.
 */
export function scopeCondition(scope: OverviewScopeInput) {
  if (scope.branchId) return eq(schema.cans.branchId, scope.branchId);
  return inArray(
    schema.cans.branchId,
    db.select({ id: schema.branches.id }).from(schema.branches)
      .where(eq(schema.branches.districtId, scope.districtId)),
  );
}

/** Rentang [awal, akhir) bulan operasional. */
export function monthBounds(period: OverviewPeriodInput) {
  return {
    start: new Date(period.year, period.month - 1, 1),
    end: new Date(period.year, period.month, 1),
  };
}

/** Ubah tahun+bulan menjadi kunci "YYYY-MM". */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Rincian jumlah kaleng per kondisi pada scope.
 * DIKEMBALIKAN tetap dihitung walau `is_active = false` — ia keluar dari cakupan,
 * tetapi angkanya tetap perlu terlihat.
 */
export async function getConditionBreakdown(scope: OverviewScopeInput) {
  const rows = await db
    .select({
      condition: schema.cans.condition,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.cans)
    .where(scopeCondition(scope))
    .groupBy(schema.cans.condition);

  const all: CanConditionValue[] = ['AKTIF', 'NON_AKTIF', 'RUSAK', 'HILANG', 'DIKEMBALIKAN'];
  return all.map((condition) => ({
    condition,
    count: Number(rows.find((r) => r.condition === condition)?.count ?? 0),
  }));
}

/** Cakupan penempatan, cakupan hilang, dan jumlah yang perlu tindakan. */
export async function getCoverageCounts(scope: OverviewScopeInput) {
  const [row] = await db
    .select({
      placement: sql<number>`count(*) filter (where ${schema.cans.condition} in ${sqlConditionList(PLACEMENT_CONDITIONS)} and ${schema.cans.isActive} = true)::int`,
      lost: sql<number>`count(*) filter (where ${schema.cans.condition} = 'HILANG')::int`,
      actionRequired: sql<number>`count(*) filter (where ${schema.cans.condition} in ${sqlConditionList(ACTION_REQUIRED_CONDITIONS)} and ${schema.cans.isActive} = true)::int`,
    })
    .from(schema.cans)
    .where(scopeCondition(scope));

  return {
    placement: Number(row?.placement ?? 0),
    lost: Number(row?.lost ?? 0),
    actionRequired: Number(row?.actionRequired ?? 0),
  };
}

/** Petugas aktif pada scope. */
export async function getOfficerCount(scope: OverviewScopeInput) {
  if (scope.branchId) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.officers)
      .where(and(eq(schema.officers.branchId, scope.branchId), eq(schema.officers.isActive, true)));
    return Number(row?.count ?? 0);
  }

  const [row] = await db.select({ count: sql<number>`count(*)::int` })
    .from(schema.officers)
    .innerJoin(schema.branches, eq(schema.officers.branchId, schema.branches.id))
    .where(and(eq(schema.branches.districtId, scope.districtId), eq(schema.officers.isActive, true)));
  return Number(row?.count ?? 0);
}

/** Nominal & jumlah penjemputan berhasil pada periode (versi submit terbaru saja). */
export async function getCollectionSummary(scope: OverviewScopeInput, period: OverviewPeriodInput) {
  const { start, end } = monthBounds(period);

  const [row] = await db
    .select({
      nominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.collections)
    .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
    .where(and(
      scopeCondition(scope),
      eq(schema.collections.syncStatus, 'COMPLETED'),
      getLatestCollectionCondition(),
      gte(schema.collections.collectedAt, start),
      lt(schema.collections.collectedAt, end),
    ));

  return {
    nominal: Number(row?.nominal ?? 0),
    successful_collections: Number(row?.count ?? 0),
  };
}

/**
 * Kaleng yang ditarik (DIKEMBALIKAN): bulan berjalan dan total.
 *
 * "Bulan ini" memakai waktu ubah kondisi yang eksplisit (`cans.updated_at`), bukan
 * `cans.created_at`: semua jalur penarikan (update kondisi, soft delete, persetujuan
 * usulan) menulis `updated_at` pada saat transisi terjadi.
 */
export async function getReturnedCounts(scope: OverviewScopeInput, period: OverviewPeriodInput) {
  const { start, end } = monthBounds(period);

  // Dua query terpisah, bukan satu `count(*) filter (...)`:
  //  - total: seluruh kaleng DIKEMBALIKAN (tanpa batas waktu)
  //  - thisMonth: hanya yang updated_at di bulan periode
  //
  // Filter tanggal HARUS memakai operator Drizzle (gte/lt) agar di-bind
  // sebagai parameter. Interpolasi `${start}` mentah di template sql`...`
  // menyisipkan objek Date ke driver postgres-js, yang menolaknya dengan
  // ERR_INVALID_ARG_TYPE (lihat __tests__/overviewReturnedCounts.test.ts).
  // Karena getOverview memakai Promise.all, satu query gagal = 500 seluruh
  // endpoint overview.
  const [totalRows, monthRows] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` })
      .from(schema.cans)
      .where(and(scopeCondition(scope), eq(schema.cans.condition, 'DIKEMBALIKAN'))),

    db.select({ thisMonth: sql<number>`count(*)::int` })
      .from(schema.cans)
      .where(and(
        scopeCondition(scope),
        eq(schema.cans.condition, 'DIKEMBALIKAN'),
        gte(schema.cans.updatedAt, start),
        lt(schema.cans.updatedAt, end),
      )),
  ]);

  const totalRow = totalRows[0];
  const monthRow = monthRows[0];

  return {
    total: Number(totalRow?.total ?? 0),
    this_month: Number(monthRow?.thisMonth ?? 0),
  };
}

export interface TaskSummary {
  task_active: number;
  task_completed: number;
  task_uncollected: number;
  task_reassigned: number;
  /** COMPLETED + UNCOLLECTED. REASSIGNED tidak pernah masuk tugas selesai. */
  task_closed: number;
  /** Seluruh status assignment pada scope + periode. */
  task_total: number;
}

/**
 * Ringkasan tugas periode. Scope memakai pemilik kaleng (`cans.branch_id`),
 * bukan penempatan petugas — petugas boleh menjemput lintas ranting.
 */
export async function getTaskSummary(
  scope: OverviewScopeInput,
  period: OverviewPeriodInput,
): Promise<TaskSummary> {
  const rows = await db
    .select({
      status: schema.assignments.status,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.assignments)
    .innerJoin(schema.cans, eq(schema.assignments.canId, schema.cans.id))
    .where(and(
      scopeCondition(scope),
      eq(schema.assignments.periodYear, period.year),
      eq(schema.assignments.periodMonth, period.month),
    ))
    .groupBy(schema.assignments.status);

  const get = (status: string) => Number(rows.find((r) => r.status === status)?.count ?? 0);
  const metrics = computeTaskMetrics(rows);

  return {
    ...metrics,
    // TaskSummary tidak memakai field alarm; pertahankan bentuk lama.
    task_total: metrics.task_total,
    task_closed: metrics.task_closed,
    task_reassigned: get('REASSIGNED'),
  };
}

/** Jumlah kaleng yang menerima tugas pada scope (untuk cakupan tugas). */
export async function getAssignableCanCount(scope: OverviewScopeInput) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` })
    .from(schema.cans)
    .where(and(
      scopeCondition(scope),
      eq(schema.cans.isActive, true),
      inArray(schema.cans.condition, ASSIGNABLE_CONDITIONS),
    ));
  return Number(row?.count ?? 0);
}

/**
 * Tren operasional N bulan terakhir (termasuk bulan periode).
 * Dua query agregat: penjemputan (isi/kosong/nominal) dan siklus tugas
 * (ditutup/total/tidak terjemput) — keduanya dipisah karena definisinya berbeda.
 */
export async function getMonthlyOperationalTrend(
  scope: OverviewScopeInput,
  period: OverviewPeriodInput,
  months: number = TREND_MONTHS,
) {
  const buckets: Array<{ year: number; month: number; key: string }> = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(period.year, period.month - 1 - i, 1);
    buckets.push({ year: d.getFullYear(), month: d.getMonth() + 1, key: monthKey(d.getFullYear(), d.getMonth() + 1) });
  }

  const first = buckets[0];
  const firstStart = new Date(first.year, first.month - 1, 1);
  const lastKey = buckets[buckets.length - 1].key;
  const firstKey = first.key;

  const [collectionRows, assignmentRows] = await Promise.all([
    db.select({
      month: sql<string>`to_char(${schema.collections.collectedAt}, 'YYYY-MM')`,
      collected: sql<number>`count(*)::int`,
      empty: sql<number>`count(*) filter (where ${schema.collections.nominal} = 0)::int`,
      nominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
    })
      .from(schema.collections)
      .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
      .where(and(
        scopeCondition(scope),
        eq(schema.collections.syncStatus, 'COMPLETED'),
        getLatestCollectionCondition(),
        gte(schema.collections.collectedAt, firstStart),
      ))
      .groupBy(sql`to_char(${schema.collections.collectedAt}, 'YYYY-MM')`),

    db.select({
      year: schema.assignments.periodYear,
      month: schema.assignments.periodMonth,
      uncollected: sql<number>`count(*) filter (where ${schema.assignments.status} = 'UNCOLLECTED')::int`,
      closed: sql<number>`count(*) filter (where ${schema.assignments.status} in ('COMPLETED', 'UNCOLLECTED'))::int`,
      total: sql<number>`count(*)::int`,
    })
      .from(schema.assignments)
      .innerJoin(schema.cans, eq(schema.assignments.canId, schema.cans.id))
      .where(and(
        scopeCondition(scope),
        sql`(${schema.assignments.periodYear} * 100 + ${schema.assignments.periodMonth}) between ${Number(firstKey.replace('-', ''))} and ${Number(lastKey.replace('-', ''))}`,
      ))
      .groupBy(schema.assignments.periodYear, schema.assignments.periodMonth),
  ]);

  return buckets.map((b) => {
    const col = collectionRows.find((r) => r.month === b.key);
    const task = assignmentRows.find((r) => r.year === b.year && r.month === b.month);
    return {
      month: b.key,
      collected: Number(col?.collected ?? 0),
      empty: Number(col?.empty ?? 0),
      uncollected: Number(task?.uncollected ?? 0),
      task_closed: Number(task?.closed ?? 0),
      task_total: Number(task?.total ?? 0),
      nominal: Number(col?.nominal ?? 0),
    };
  });
}

/**
 * Daftar "perlu tindakan": NON_AKTIF + RUSAK + HILANG yang masih dilacak.
 * Terbatas dan berurutan deterministik (HILANG → RUSAK → NON_AKTIF, lalu kasus terlama).
 * Alasan & waktu kasus diambil dari usulan pending/approved bila ada.
 */
export async function getActionItems(
  scope: OverviewScopeInput,
  limit: number = ACTION_ITEM_LIMIT,
) {
  const rows = await db
    .select({
      can_id: schema.cans.id,
      owner_name: schema.cans.ownerName,
      branch_id: schema.cans.branchId,
      branch_name: schema.branches.name,
      condition: schema.cans.condition,
      changed_at: schema.cans.updatedAt,
    })
    .from(schema.cans)
    .innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
    .where(and(
      scopeCondition(scope),
      eq(schema.cans.isActive, true),
      inArray(schema.cans.condition, ACTION_REQUIRED_CONDITIONS),
    ))
    .orderBy(
      sql`case ${schema.cans.condition} when 'HILANG' then 0 when 'RUSAK' then 1 else 2 end`,
      sql`${schema.cans.updatedAt} asc`,
      sql`${schema.cans.id} asc`,
    )
    .limit(limit);

  if (rows.length === 0) return [];

  const canIds = rows.map((r) => r.can_id);
  const proposals = await db
    .select({
      id: schema.canConditionProposals.id,
      canId: schema.canConditionProposals.canId,
      status: schema.canConditionProposals.status,
      reasonCode: schema.canConditionProposals.reasonCode,
      approvedAt: schema.canConditionProposals.approvedAt,
      createdAt: schema.canConditionProposals.createdAt,
    })
    .from(schema.canConditionProposals)
    .where(and(
      inArray(schema.canConditionProposals.canId, canIds),
      inArray(schema.canConditionProposals.status, ['PENDING', 'APPROVED']),
    ))
    .orderBy(desc(schema.canConditionProposals.createdAt));

  const pendingByCan = new Map<string, (typeof proposals)[number]>();
  const approvedByCan = new Map<string, (typeof proposals)[number]>();
  for (const p of proposals) {
    if (p.status === 'PENDING' && !pendingByCan.has(p.canId)) pendingByCan.set(p.canId, p);
    if (p.status === 'APPROVED' && !approvedByCan.has(p.canId)) approvedByCan.set(p.canId, p);
  }

  return rows.map((r) => {
    const pending = pendingByCan.get(r.can_id);
    const approved = approvedByCan.get(r.can_id);
    const since = approved?.approvedAt ?? r.changed_at;
    return {
      can_id: r.can_id,
      owner_name: r.owner_name,
      branch_id: r.branch_id,
      branch_name: r.branch_name ?? '',
      condition: r.condition,
      proposal_id: pending?.id,
      reason_code: pending?.reasonCode ?? approved?.reasonCode,
      since: since instanceof Date ? since.toISOString() : String(since),
      action_label: actionLabel(r.condition),
    };
  });
}

/**
 * Perbandingan per ranting untuk admin kecamatan.
 * Scope & pengelompokan memakai `cans.branch_id`, bukan `officer.branch_id`
 * (memperbaiki bug lama di routes/admin/district.ts).
 */
export async function getBranchComparison(
  districtId: string,
  period: OverviewPeriodInput,
) {
  const { start, end } = monthBounds(period);

  const [branchList, coverageRows, taskRows, collectionRows] = await Promise.all([
    db.select({ id: schema.branches.id, name: schema.branches.name })
      .from(schema.branches)
      .where(eq(schema.branches.districtId, districtId))
      .orderBy(schema.branches.name),

    db.select({
      branchId: schema.cans.branchId,
      placement: sql<number>`count(*) filter (where ${schema.cans.condition} in ${sqlConditionList(PLACEMENT_CONDITIONS)} and ${schema.cans.isActive} = true)::int`,
      lost: sql<number>`count(*) filter (where ${schema.cans.condition} = 'HILANG')::int`,
      actionRequired: sql<number>`count(*) filter (where ${schema.cans.condition} in ${sqlConditionList(ACTION_REQUIRED_CONDITIONS)} and ${schema.cans.isActive} = true)::int`,
    })
      .from(schema.cans)
      .innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
      .where(eq(schema.branches.districtId, districtId))
      .groupBy(schema.cans.branchId),

    db.select({
      branchId: schema.cans.branchId,
      closed: sql<number>`count(*) filter (where ${schema.assignments.status} in ('COMPLETED', 'UNCOLLECTED'))::int`,
      total: sql<number>`count(*)::int`,
    })
      .from(schema.assignments)
      .innerJoin(schema.cans, eq(schema.assignments.canId, schema.cans.id))
      .innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
      .where(and(
        eq(schema.branches.districtId, districtId),
        eq(schema.assignments.periodYear, period.year),
        eq(schema.assignments.periodMonth, period.month),
      ))
      .groupBy(schema.cans.branchId),

    db.select({
      branchId: schema.cans.branchId,
      nominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
    })
      .from(schema.collections)
      .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
      .innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
      .where(and(
        eq(schema.branches.districtId, districtId),
        eq(schema.collections.syncStatus, 'COMPLETED'),
        getLatestCollectionCondition(),
        gte(schema.collections.collectedAt, start),
        lt(schema.collections.collectedAt, end),
      ))
      .groupBy(schema.cans.branchId),
  ]);

  return branchList.map((b) => {
    const coverage = coverageRows.find((r) => r.branchId === b.id);
    const task = taskRows.find((r) => r.branchId === b.id);
    const collection = collectionRows.find((r) => r.branchId === b.id);
    return {
      branch_id: b.id,
      branch_name: b.name,
      placement_coverage: Number(coverage?.placement ?? 0),
      lost_cans: Number(coverage?.lost ?? 0),
      action_required: Number(coverage?.actionRequired ?? 0),
      task_closed: Number(task?.closed ?? 0),
      task_total: Number(task?.total ?? 0),
      collection_nominal: Number(collection?.nominal ?? 0),
    };
  });
}

export interface GetOverviewOptions {
  /** 'branch' bila admin ranting atau admin kecamatan menyaring satu ranting. */
  scopeType?: 'branch' | 'district';
  branchName?: string;
  actionItemLimit?: number;
  trendMonths?: number;
  /** Perbandingan ranting hanya bermakna untuk agregat kecamatan. */
  includeBranchComparison?: boolean;
}

/**
 * Rakit OverviewResponse. Semua angka berasal dari fungsi agregasi di atas —
 * jangan menambah perhitungan definisi baru di route maupun di browser.
 */
export async function getOverview(
  scope: OverviewScopeInput,
  period: OverviewPeriodInput,
  options: GetOverviewOptions = {},
) {
  const [breakdown, coverage, officers, collections, returned, tasks] = await Promise.all([
    getConditionBreakdown(scope),
    getCoverageCounts(scope),
    getOfficerCount(scope),
    getCollectionSummary(scope, period),
    getReturnedCounts(scope, period),
    getTaskSummary(scope, period),
  ]);

  const [actionItems, trend, comparison] = await Promise.all([
    getActionItems(scope, options.actionItemLimit ?? ACTION_ITEM_LIMIT),
    getMonthlyOperationalTrend(scope, period, options.trendMonths ?? TREND_MONTHS),
    options.includeBranchComparison
      ? getBranchComparison(scope.districtId, period)
      : Promise.resolve(undefined),
  ]);

  const countOf = (condition: CanConditionValue) =>
    Number(breakdown.find((b) => b.condition === condition)?.count ?? 0);

  return {
    scope: {
      type: options.scopeType ?? (scope.branchId ? 'branch' : 'district'),
      district_id: scope.districtId,
      ...(scope.branchId ? { branch_id: scope.branchId } : {}),
      ...(options.branchName ? { branch_name: options.branchName } : {}),
    },
    period: {
      year: period.year,
      month: period.month,
      timezone: OPERATIONAL_TIMEZONE,
      generated_at: new Date().toISOString(),
    },
    summary: {
      // Cakupan penempatan = AKTIF + NON_AKTIF + RUSAK (HILANG punya cakupan sendiri).
      placement_coverage: coverage.placement,
      active_cans: countOf('AKTIF'),
      inactive_cans: countOf('NON_AKTIF'),
      damaged_cans: countOf('RUSAK'),
      lost_cans: countOf('HILANG'),
      returned_this_month: returned.this_month,
      returned_total: returned.total,
      action_required: coverage.actionRequired,
      total_officers: officers,
      collection_nominal: collections.nominal,
      successful_collections: collections.successful_collections,
      task_active: tasks.task_active,
      task_closed: tasks.task_closed,
      task_completed: tasks.task_completed,
      task_uncollected: tasks.task_uncollected,
      task_total: tasks.task_total,
    },
    condition_breakdown: breakdown,
    action_items: actionItems,
    monthly_trend: trend,
    ...(comparison ? { branch_comparison: comparison } : {}),
  };
}