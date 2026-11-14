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
import { and, eq, gte, lt, inArray, or, sql } from 'drizzle-orm';
import { getLatestCollectionCondition } from './collectionSubmission';
import { computeTaskMetrics } from './taskMetrics';
import {
  ACTION_REQUIRED_CONDITIONS,
  ASSIGNABLE_CONDITIONS,
  PLACEMENT_CONDITIONS,
} from './conditionRules';
import type { CanConditionValue } from './conditionRules';
import { OPERATIONAL_TIMEZONE, currentOperationalPeriod } from '../utils/operationalTimeZone';
import { operationalMonthEndExclusive } from './periodCalendar';
import { Errors } from '../utils/errorCatalog';
import {
  findCanStateEvents,
  replayCanStateAt,
  type SnapshotFallback,
} from './canStateHistory';
import {
  deriveLegacyCondition,
  type CanLifecycleStatus,
  type CanPhysicalCondition,
} from './canState';

export interface OverviewScopeInput {
  /** Kecamatan pemilik data — selalu diisi dari token, bukan dari query string. */
  districtId: string;
  /** Diisi hanya bila admin kecamatan menyaring satu ranting. */
  branchId?: string;
}

export interface OverviewPeriodInput {
  year: number;
  month: number;
  /**
   * Bulan-bulan terpilih (filter PeriodPicker multi-bulan). Kosong/tidak ada =
   * hanya `month` (perilaku lama, kompatibel dengan pemanggil & test lama).
   */
  months?: number[];
}

/** Bulan efektif: normalisasi months bila ada, jika tidak [month]. */
export function effectiveMonths(period: OverviewPeriodInput): number[] {
  const clean = normalizePeriodMonths(period.months);
  if (clean.length > 0) return clean;
  return Number.isInteger(period.month) && period.month >= 1 && period.month <= 12
    ? [period.month]
    : [];
}

/**
 * Parse query periode overview (`?year=2026&months=7,8,9`).
 * Null = 400 VALIDATION_ERROR. Tanpa param = bulan berjalan (perilaku lama,
 * kompatibel dengan pemanggil yang belum mengirim periode).
 *
 * Bulan/tahun masa depan DITOLAK eksplisit — bukan dibatasi diam-diam.
 * Bulan berjalan diizinkan (snapshot berhenti pada `now`).
 */
export function parseOverviewPeriod(
  yearRaw: unknown,
  monthsRaw: unknown,
  now: Date = new Date(),
): OverviewPeriodInput | null {
  const current = currentOperationalPeriod(now);

  let year = current.year;
  if (yearRaw !== undefined && yearRaw !== '') {
    const y = Number(yearRaw);
    if (!Number.isInteger(y) || y < 2000 || y > current.year) return null;
    year = y;
  }

  let months: number[] | undefined;
  if (monthsRaw !== undefined && monthsRaw !== '') {
    const parsed = String(monthsRaw).split(',').map((s) => Number(s.trim()));
    if (parsed.length === 0 || parsed.length > 12) return null;
    if (parsed.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) return null;
    months = [...new Set(parsed)].sort((a, b) => a - b);
  }

  const eff = months ?? [current.month];
  // Tahun/bulan masa depan (termasuk salah satu bulan dalam daftar) ditolak.
  if (eff.some((m) => year > current.year || (year === current.year && m > current.month))) {
    return null;
  }
  return { year, month: Math.max(...eff), months: eff };
}

/** Normalisasi input periode: buang di luar 1-12, unik, terurut. */
export function normalizePeriodMonths(months: unknown): number[] {
  const list = Array.isArray(months) ? months : [];
  const clean = list
    .map((m) => Number(m))
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  return [...new Set(clean)].sort((a, b) => a - b);
}

/** Rentang [start, end) untuk tiap bulan terpilih (diskrit, bukan min-max). */
export function periodRanges(year: number, months: number[]): Array<{ start: Date; end: Date }> {
  const list = months.length > 0 ? months : Array.from({ length: 12 }, (_, i) => i + 1);
  return list.map((m) => ({
    start: new Date(year, m - 1, 1),
    end: new Date(year, m, 1),
  }));
}

/** Kondisi tanggal-masuk-periode untuk kolom timestamp (collections.collectedAt, cans.updatedAt). */
export function inSelectedMonths(column: Parameters<typeof gte>[0], year: number, months: number[]) {
  const ranges = periodRanges(year, months);
  if (ranges.length === 1) {
    return and(gte(column, ranges[0].start), lt(column, ranges[0].end));
  }
  return or(...ranges.map(({ start, end }) => and(gte(column, start), lt(column, end))));
}

/** Kondisi periode untuk assignments (kolom periodYear/periodMonth diskrit). */
export function inAssignmentPeriod(year: number, months: number[]) {
  const list = months.length > 0 ? months : Array.from({ length: 12 }, (_, i) => i + 1);
  return and(
    eq(schema.assignments.periodYear, year),
    list.length === 1 ? eq(schema.assignments.periodMonth, list[0]) : inArray(schema.assignments.periodMonth, list),
  );
}

/** Jumlah bucket tren: selalu 12 (Januari–Desember). */
export const TREND_MONTHS = 12;

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

export type CanStatusCounts = Record<CanLifecycleStatus, number>;
export type CanPhysicalCounts = Record<CanPhysicalCondition, number>;

export interface OverviewCanStateSnapshot {
  /** Waktu cutoff yang dipakai (akhir bulan historis atau `now` bulan berjalan). */
  cutoff_at: string;
  /** Awal riwayat ledger yang dapat dipercaya (baseline cutover pertama). */
  cutover_at: string | null;
  /** False bila cutoff berada sebelum baseline/ledger lengkap. */
  history_complete: boolean;
  status: CanStatusCounts;
  physical_condition: CanPhysicalCounts;
  /** Jumlah kondisi BAIK yang berasal dari asumsi backfill. */
  assumption_baik: number;
  placement_coverage: number;
  action_required: number;
  /** Proyeksi legacy lima nilai untuk klien/kartu lama (lossy). */
  legacy_breakdown: Array<{ condition: CanConditionValue; count: number }>;
}

/**
 * Cutoff snapshot periode:
 * - bulan berjalan → `now` inklusif (`effective_at <= now`);
 * - bulan historis → awal bulan berikutnya eksklusif (`effective_at < ...`).
 * Bulan/tahun masa depan ditolak eksplisit.
 */
export function overviewSnapshotCutoff(
  period: OverviewPeriodInput,
  now: Date = new Date(),
): { at: Date; inclusive: boolean } {
  const months = effectiveMonths(period);
  const latest = months.length > 0 ? Math.max(...months) : period.month;
  const current = currentOperationalPeriod(now);
  if (period.year > current.year || (period.year === current.year && latest > current.month)) {
    throw Errors.VALIDATION_ERROR(
      `Periode ${monthKey(period.year, latest)} adalah masa depan dan tidak dapat difilter`,
    );
  }
  if (period.year === current.year && latest === current.month) {
    return { at: now, inclusive: true };
  }
  return { at: operationalMonthEndExclusive(period.year, latest), inclusive: false };
}

function emptyCanStateSnapshot(cutoff: { at: Date; inclusive: boolean }): OverviewCanStateSnapshot {
  return {
    cutoff_at: cutoff.at.toISOString(),
    cutover_at: null,
    history_complete: true,
    status: { AKTIF: 0, NON_AKTIF: 0, DIKEMBALIKAN: 0 },
    physical_condition: { BAIK: 0, RUSAK: 0, HILANG: 0 },
    assumption_baik: 0,
    placement_coverage: 0,
    action_required: 0,
    legacy_breakdown: [
      { condition: 'AKTIF', count: 0 },
      { condition: 'NON_AKTIF', count: 0 },
      { condition: 'RUSAK', count: 0 },
      { condition: 'HILANG', count: 0 },
      { condition: 'DIKEMBALIKAN', count: 0 },
    ],
  };
}

/**
 * Snapshot dua kelompok (status lifecycle + kondisi fisik) pada akhir periode.
 * Setiap dimensi direplay dari ledger secara independen; kaleng dibatasi pada
 * `created_at < cutoff`, dan scope ranting memakai branch hasil replay (bukan
 * branch saat ini) agar pindah ranting tidak memindahkan riwayat.
 */
export async function getCanStateSnapshot(
  scope: OverviewScopeInput,
  period: OverviewPeriodInput,
  now: Date = new Date(),
): Promise<OverviewCanStateSnapshot> {
  const cutoff = overviewSnapshotCutoff(period, now);

  const allowedBranchIds = scope.branchId
    ? [scope.branchId]
    : (await db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.districtId, scope.districtId)))
      .map((row) => row.id);

  if (allowedBranchIds.length === 0) return emptyCanStateSnapshot(cutoff);

  const candidateSelect = {
    id: schema.cans.id,
    branchId: schema.cans.branchId,
    createdAt: schema.cans.createdAt,
    lifecycleStatus: schema.cans.lifecycleStatus,
    physicalCondition: schema.cans.physicalCondition,
    physicalConditionSource: schema.cans.physicalConditionSource,
  };

  const [districtRows, historyBranchRows] = await Promise.all([
    db.select(candidateSelect)
      .from(schema.cans)
      .innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
      .where(and(
        eq(schema.branches.districtId, scope.districtId),
        lt(schema.cans.createdAt, cutoff.at),
      )),
    db.selectDistinct({ canId: schema.canStateHistory.canId })
      .from(schema.canStateHistory)
      .where(and(
        inArray(schema.canStateHistory.branchId, allowedBranchIds),
        lt(schema.canStateHistory.effectiveAt, cutoff.at),
      )),
  ]);

  const candidateById = new Map(districtRows.map((row) => [row.id, row]));
  const extraIds = [...new Set(historyBranchRows.map((row) => row.canId))]
    .filter((id) => !candidateById.has(id));
  if (extraIds.length > 0) {
    const extraRows = await db
      .select(candidateSelect)
      .from(schema.cans)
      .where(inArray(schema.cans.id, extraIds));
    for (const row of extraRows) {
      candidateById.set(row.id, row);
    }
  }

  const candidates = [...candidateById.values()]
    .filter((row) => row.createdAt.getTime() < cutoff.at.getTime());
  if (candidates.length === 0) return emptyCanStateSnapshot(cutoff);

  const events = await findCanStateEvents(
    db,
    candidates.map((row) => row.id),
    { at: cutoff.at, inclusive: true },
  );
  const eventsByCan = new Map<string, typeof events>();
  for (const event of events) {
    const list = eventsByCan.get(event.canId) ?? [];
    list.push(event);
    eventsByCan.set(event.canId, list);
  }

  const status: CanStatusCounts = { AKTIF: 0, NON_AKTIF: 0, DIKEMBALIKAN: 0 };
  const physical: CanPhysicalCounts = { BAIK: 0, RUSAK: 0, HILANG: 0 };
  const legacy: CanConditionValue[] = ['AKTIF', 'NON_AKTIF', 'RUSAK', 'HILANG', 'DIKEMBALIKAN'];
  const legacyCounts = new Map<CanConditionValue, number>(legacy.map((value) => [value, 0]));

  let assumptionBaik = 0;
  let placement = 0;
  let actionRequired = 0;
  let historyComplete = true;
  let cutoverAt: Date | null = null;

  for (const row of candidates) {
    const fallback: SnapshotFallback = {
      state: {
        lifecycleStatus: row.lifecycleStatus,
        physicalCondition: row.physicalCondition,
        physicalConditionSource: row.physicalConditionSource ?? 'OBSERVED',
      },
      branchId: row.branchId,
    };
    const replay = replayCanStateAt(eventsByCan.get(row.id) ?? [], cutoff, fallback);

    // Scope memakai branch pada cutoff, bukan branch saat ini.
    if (!replay.branchId || !allowedBranchIds.includes(replay.branchId)) continue;
    if (!replay.historyComplete) historyComplete = false;

    const { lifecycleStatus, physicalCondition, physicalConditionSource } = replay.state;
    status[lifecycleStatus] += 1;
    physical[physicalCondition] += 1;

    if (physicalCondition === 'BAIK' && physicalConditionSource === 'LEGACY_ASSUMPTION_BAIK') {
      assumptionBaik += 1;
    }

    const tracked = lifecycleStatus !== 'DIKEMBALIKAN';
    if (tracked && physicalCondition !== 'HILANG') placement += 1;
    if (tracked && (lifecycleStatus === 'NON_AKTIF' || physicalCondition !== 'BAIK')) {
      actionRequired += 1;
    }

    const legacyCondition = deriveLegacyCondition(lifecycleStatus, physicalCondition);
    legacyCounts.set(legacyCondition, (legacyCounts.get(legacyCondition) ?? 0) + 1);

    if (replay.anchorAt && (cutoverAt === null || replay.anchorAt < cutoverAt)) {
      cutoverAt = replay.anchorAt;
    }
  }

  return {
    cutoff_at: cutoff.at.toISOString(),
    cutover_at: cutoverAt ? cutoverAt.toISOString() : null,
    history_complete: historyComplete,
    status,
    physical_condition: physical,
    assumption_baik: assumptionBaik,
    placement_coverage: placement,
    action_required: actionRequired,
    legacy_breakdown: legacy.map((condition) => ({
      condition,
      count: legacyCounts.get(condition) ?? 0,
    })),
  };
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
  const months = effectiveMonths(period);

  // Atribusi uang = PERIODE ASSIGNMENT, bukan bulan `collected_at` (C1-T12 §2.2).
  // Jemputan 5 Nov untuk assignment Oktober adalah pemasukan Oktober.
  const [row] = await db
    .select({
      nominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.collections)
    .innerJoin(schema.assignments, eq(schema.collections.assignmentId, schema.assignments.id))
    .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
    .where(and(
      scopeCondition(scope),
      eq(schema.collections.syncStatus, 'COMPLETED'),
      getLatestCollectionCondition(),
      inAssignmentPeriod(period.year, months),
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
  const months = effectiveMonths(period);

  // Dua query terpisah, bukan satu `count(*) filter (...)`:
  //  - total: seluruh kaleng DIKEMBALIKAN (tanpa batas waktu)
  //  - thisMonth: yang updated_at masuk bulan-bulan periode terpilih
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
        inSelectedMonths(schema.cans.updatedAt, period.year, months),
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
      inAssignmentPeriod(period.year, effectiveMonths(period)),
      eq(schema.assignments.kind, 'PICKUP'),
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
 * Tren operasional Januari–Desember tahun periode (12 bucket tetap,
 * mendukung laporan tengah semester Juni & akhir tahun Desember).
 * Dua query agregat: penjemputan berhasil (semua nominal, termasuk nol; kosong adalah bagiannya)
 * dan siklus tugas (ditutup/total/tidak terjemput) — keduanya dipisah karena definisinya berbeda.
 */
export async function getMonthlyOperationalTrend(
  scope: OverviewScopeInput,
  period: OverviewPeriodInput,
) {
  const buckets: Array<{ year: number; month: number; key: string }> = [];
  for (let m = 1; m <= 12; m += 1) {
    buckets.push({ year: period.year, month: m, key: monthKey(period.year, m) });
  }

  const first = buckets[0];
  const lastKey = buckets[buckets.length - 1].key;
  const firstKey = first.key;

  const [collectionRows, assignmentRows] = await Promise.all([
    // collected menghitung semua penjemputan berhasil; empty adalah subset dengan nominal nol.
    // Tren uang memakai periode assignment agar sejajar dengan tren tugas dan tidak
    // memindahkan jemputan toleransi ke bulan kalender berikutnya.
    db.select({
      year: schema.assignments.periodYear,
      month: schema.assignments.periodMonth,
      collected: sql<number>`count(*)::int`,
      empty: sql<number>`count(*) filter (where ${schema.collections.nominal} = 0)::int`,
      nominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
    })
      .from(schema.collections)
      .innerJoin(schema.assignments, eq(schema.collections.assignmentId, schema.assignments.id))
      .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
      .where(and(
        scopeCondition(scope),
        eq(schema.collections.syncStatus, 'COMPLETED'),
        getLatestCollectionCondition(),
        eq(schema.assignments.periodYear, period.year),
      ))
      .groupBy(schema.assignments.periodYear, schema.assignments.periodMonth),

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
        eq(schema.assignments.kind, 'PICKUP'),
        sql`(${schema.assignments.periodYear} * 100 + ${schema.assignments.periodMonth}) between ${Number(firstKey.replace('-', ''))} and ${Number(lastKey.replace('-', ''))}`,
      ))
      .groupBy(schema.assignments.periodYear, schema.assignments.periodMonth),
  ]);

  return buckets.map((b) => {
    const col = collectionRows.find((r) => r.year === b.year && r.month === b.month);
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
 * Perbandingan per ranting untuk admin kecamatan.
 * Scope & pengelompokan memakai `cans.branch_id`, bukan `officer.branch_id`
 * (memperbaiki bug lama di routes/admin/district.ts).
 */
export async function getBranchComparison(
  districtId: string,
  period: OverviewPeriodInput,
) {
  const months = effectiveMonths(period);

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
        eq(schema.assignments.kind, 'PICKUP'),
        inAssignmentPeriod(period.year, months),
      ))
      .groupBy(schema.cans.branchId),

    db.select({
      branchId: schema.cans.branchId,
      nominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
      filled: sql<number>`count(*) filter (where ${schema.collections.nominal} > 0)::int`,
    })
      .from(schema.collections)
      .innerJoin(schema.assignments, eq(schema.collections.assignmentId, schema.assignments.id))
      .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
      .innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
      .where(and(
        eq(schema.branches.districtId, districtId),
        eq(schema.collections.syncStatus, 'COMPLETED'),
        getLatestCollectionCondition(),
        inAssignmentPeriod(period.year, months),
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
      collection_filled: Number(collection?.filled ?? 0),
    };
  });
}

export interface GetOverviewOptions {
  /** 'branch' bila admin ranting atau admin kecamatan menyaring satu ranting. */
  scopeType?: 'branch' | 'district';
  branchName?: string;
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
  now: Date = new Date(),
) {
  const [snapshot, officers, collections, returned, tasks] = await Promise.all([
    getCanStateSnapshot(scope, period, now),
    getOfficerCount(scope),
    getCollectionSummary(scope, period),
    getReturnedCounts(scope, period),
    getTaskSummary(scope, period),
  ]);

  // Arus produktivitas (dipakai section Kondisi + Produktivitas). Diambil
  // terpisah dari productivityService agar fungsi agregasi inti tetap ramping.
  const { getCollectionOutcome, getReactivatedCount } = await import('./productivityService.js');
  const [reactivated, outcome] = await Promise.all([
    getReactivatedCount(scope, period.year, effectiveMonths(period)),
    getCollectionOutcome(scope, period.year, effectiveMonths(period)),
  ]);

  const [trend, comparison] = await Promise.all([
    getMonthlyOperationalTrend(scope, period),
    options.includeBranchComparison
      ? getBranchComparison(scope.districtId, period)
      : Promise.resolve(undefined),
  ]);

  // `month` = bulan terpilih paling akhir (kompatibel pemanggil lama);
  // `months` = seluruh bulan terpilih untuk label rentang.
  const selectedMonths = effectiveMonths(period);
  const latestMonth = selectedMonths.length > 0
    ? Math.max(...selectedMonths)
    : period.month;

  return {
    scope: {
      type: options.scopeType ?? (scope.branchId ? 'branch' : 'district'),
      district_id: scope.districtId,
      ...(scope.branchId ? { branch_id: scope.branchId } : {}),
      ...(options.branchName ? { branch_name: options.branchName } : {}),
    },
    period: {
      year: period.year,
      month: latestMonth,
      months: selectedMonths,
      timezone: OPERATIONAL_TIMEZONE,
      generated_at: new Date().toISOString(),
    },
    summary: {
      // Cakupan penempatan = tracked dengan kondisi fisik bukan HILANG
      // (setara legacy AKTIF + NON_AKTIF + RUSAK).
      placement_coverage: snapshot.placement_coverage,
      active_cans: snapshot.status.AKTIF,
      inactive_cans: snapshot.status.NON_AKTIF,
      damaged_cans: snapshot.physical_condition.RUSAK,
      lost_cans: snapshot.physical_condition.HILANG,
      returned_this_month: returned.this_month,
      returned_total: returned.total,
      action_required: snapshot.action_required,
      total_officers: officers,
      collection_nominal: collections.nominal,
      successful_collections: collections.successful_collections,
      // Reaktivasi dihitung dari proposal APPROVED → AKTIF (batasan: jalur
      // cepat tak tercakup).
      reactivated: reactivated,
      task_active: tasks.task_active,
      task_closed: tasks.task_closed,
      task_completed: tasks.task_completed,
      task_uncollected: tasks.task_uncollected,
      task_total: tasks.task_total,
    },
    condition_breakdown: snapshot.legacy_breakdown,
    // Dua kelompok independen sesuai posisi pada akhir periode filter.
    can_state_snapshot: snapshot,
    monthly_trend: trend,
    // Total hasil kunjungan periode terpilih (eksak, tak tergantung jendela
    // 6 bulan tren): donat produktivitas menutup genap total ditugaskan.
    productivity: {
      task_total: tasks.task_total,
      filled: Math.max(0, outcome.collected - outcome.empty),
      empty: outcome.empty,
      uncollected: tasks.task_uncollected,
      active: Math.max(0, tasks.task_total - tasks.task_closed),
    },
    ...(comparison ? { branch_comparison: comparison } : {}),
  };
}