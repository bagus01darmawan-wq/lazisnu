/**
 * Rekap kaleng unik yang berubah per periode tugas.
 *
 * Aturan yang dikunci di sini:
 * - Periode berasal dari atribusi event (assignment/kunjungan/periode manual
 *   eksplisit), BUKAN bulan kalender `effective_at`.
 * - Satu kaleng dihitung paling banyak sekali per dimensi per periode.
 * - Kategori memakai nilai terakhir yang dicapai pada dimensi itu dalam periode
 *   tersebut; urutan deterministik `effective_at`, lalu `can_version`.
 * - Rentang multi-bulan adalah penjumlahan hasil tiap periode, bukan distinct
 *   global lintas rentang.
 * - Scope memakai pemilik kaleng saat ini (`cans.branch_id`), sesuai keputusan
 *   bisnis: perpindahan kaleng memindahkan kontribusi rekap periode lama.
 * - Baseline cutover bukan riwayat perubahan; periode sebelum/melintasi awal
 *   cakupan ledger ditandai `unavailable`/`partial`, tidak dilaporkan sebagai
 *   nol lengkap.
 */
import { and, asc, eq, inArray, isNotNull, isNull, notInArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../config/database';
import * as schema from '../database/schema';
import { currentOperationalPeriod } from '../utils/operationalTimeZone';
import {
  CAN_LIFECYCLE_STATUSES,
  CAN_PHYSICAL_CONDITIONS,
  type CanLifecycleStatus,
  type CanPhysicalCondition,
} from './canState';
import { CAN_STATE_ANCHOR_SOURCES, CAN_STATE_SOURCE } from './canStateHistory';
import type { OverviewPeriodInput, OverviewScopeInput } from './overviewService';

export type CanChangeCompleteness = 'complete' | 'partial' | 'unavailable' | 'provisional';

export interface CanDimensionChangeSummary<TCategory extends string> {
  /** Jumlah kaleng unik yang berubah pada dimensi ini. */
  total: number;
  /** Kaleng unik per nilai terakhir yang dicapai pada periode terkait. */
  by_category: Record<TCategory, number>;
}

export interface CanChangeTaskPeriodSummary {
  /** Format "YYYY-MM". */
  period: string;
  year: number;
  month: number;
  completeness: CanChangeCompleteness;
  lifecycle: CanDimensionChangeSummary<CanLifecycleStatus>;
  physical_condition: CanDimensionChangeSummary<CanPhysicalCondition>;
}

export interface CanChangeSummary {
  /** Awal cakupan ledger yang dapat dibuktikan pada scope (anchor pertama). */
  coverage_start: string | null;
  /** Status kelengkapan agregat seluruh periode terpilih. */
  completeness: CanChangeCompleteness;
  /** Perubahan dimensi tanpa atribusi periode; tidak ditebak dari tanggal. */
  unattributed_events: number;
  periods: CanChangeTaskPeriodSummary[];
  lifecycle: CanDimensionChangeSummary<CanLifecycleStatus>;
  physical_condition: CanDimensionChangeSummary<CanPhysicalCondition>;
}

export interface AttributedCanChangeEvent {
  id: string;
  canId: string;
  effectiveAt: Date;
  canVersion: number;
  lifecycleStatus: CanLifecycleStatus | null;
  physicalCondition: CanPhysicalCondition | null;
  periodYear: number;
  periodMonth: number;
}

export interface CanChangePeriodRef {
  year: number;
  month: number;
}

export interface CanDimensionCounts {
  lifecycle: CanDimensionChangeSummary<CanLifecycleStatus>;
  physical_condition: CanDimensionChangeSummary<CanPhysicalCondition>;
}

function emptyLifecycleCounts(): CanDimensionChangeSummary<CanLifecycleStatus> {
  return {
    total: 0,
    by_category: { AKTIF: 0, NON_AKTIF: 0, DIKEMBALIKAN: 0 },
  };
}

function emptyPhysicalCounts(): CanDimensionChangeSummary<CanPhysicalCondition> {
  return {
    total: 0,
    by_category: { BAIK: 0, RUSAK: 0, HILANG: 0 },
  };
}

function emptyDimensionCounts(): CanDimensionCounts {
  return {
    lifecycle: emptyLifecycleCounts(),
    physical_condition: emptyPhysicalCounts(),
  };
}

export function changePeriodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Bulan efektif lokal (tidak mengimpor overviewService agar tidak sirkular). */
function resolveMonths(period: OverviewPeriodInput): number[] {
  const source = Array.isArray(period.months) && period.months.length > 0
    ? period.months
    : [period.month];
  return [...new Set(source.map(Number))].sort((a, b) => a - b);
}

/** Perbandingan deterministik: waktu kejadian, versi, lalu id sebagai tie-break. */
function compareEvents(a: AttributedCanChangeEvent, b: AttributedCanChangeEvent): number {
  const byTime = a.effectiveAt.getTime() - b.effectiveAt.getTime();
  if (byTime !== 0) return byTime;
  if (a.canVersion !== b.canVersion) return a.canVersion - b.canVersion;
  return a.id.localeCompare(b.id);
}

function aggregateLastValue<TCategory extends string>(
  events: AttributedCanChangeEvent[],
  read: (event: AttributedCanChangeEvent) => TCategory | null,
  categories: readonly TCategory[],
): CanDimensionChangeSummary<TCategory> {
  const lastByCan = new Map<string, TCategory>();
  for (const event of [...events].sort(compareEvents)) {
    const value = read(event);
    if (value !== null) lastByCan.set(event.canId, value);
  }

  const byCategory = Object.fromEntries(categories.map((c) => [c, 0])) as Record<TCategory, number>;
  for (const value of lastByCan.values()) {
    byCategory[value] += 1;
  }

  return { total: lastByCan.size, by_category: byCategory };
}

/**
 * Helper murni: kelompokkan event teratribusi per periode dan dimensi.
 * Event dengan periode di luar daftar `periods` diabaikan.
 */
export function summarizeCanChangesByPeriod(
  events: AttributedCanChangeEvent[],
  periods: CanChangePeriodRef[],
): Map<string, CanDimensionCounts> {
  const result = new Map<string, CanDimensionCounts>();
  for (const period of periods) {
    const key = changePeriodKey(period.year, period.month);
    const inPeriod = events.filter(
      (event) => event.periodYear === period.year && event.periodMonth === period.month,
    );
    result.set(key, {
      lifecycle: aggregateLastValue(inPeriod, (e) => e.lifecycleStatus, CAN_LIFECYCLE_STATUSES),
      physical_condition: aggregateLastValue(
        inPeriod,
        (e) => e.physicalCondition,
        CAN_PHYSICAL_CONDITIONS,
      ),
    });
  }
  return result;
}

function addDimension<T extends string>(
  target: CanDimensionChangeSummary<T>,
  source: CanDimensionChangeSummary<T>,
): void {
  target.total += source.total;
  for (const key of Object.keys(source.by_category) as T[]) {
    target.by_category[key] += source.by_category[key];
  }
}

const COMPLETENESS_RANK: Record<CanChangeCompleteness, number> = {
  complete: 0,
  provisional: 1,
  partial: 2,
  unavailable: 3,
};

function worstCompleteness(
  values: CanChangeCompleteness[],
): CanChangeCompleteness {
  return values.reduce<CanChangeCompleteness>(
    (worst, value) => (COMPLETENESS_RANK[value] > COMPLETENESS_RANK[worst] ? value : worst),
    'complete',
  );
}

function periodCompleteness(
  period: CanChangePeriodRef,
  coverageStart: Date | null,
  unattributedEvents: number,
  current: { year: number; month: number },
): CanChangeCompleteness {
  if (!coverageStart) return 'unavailable';

  const start = new Date(period.year, period.month - 1, 1);
  const end = new Date(period.year, period.month, 1);
  if (end.getTime() <= coverageStart.getTime()) return 'unavailable';
  if (start.getTime() < coverageStart.getTime()) return 'partial';
  if (period.year === current.year && period.month === current.month) return 'provisional';
  if (unattributedEvents > 0) return 'partial';
  return 'complete';
}

/** Scope rekap — versi lokal dari `scopeCondition` (hindari impor sirkular). */
function changeScopeCondition(scope: OverviewScopeInput) {
  if (scope.branchId) return eq(schema.cans.branchId, scope.branchId);
  return inArray(
    schema.cans.branchId,
    db.select({ id: schema.branches.id }).from(schema.branches)
      .where(eq(schema.branches.districtId, scope.districtId)),
  );
}

interface ChangeEventRow {
  id: string;
  canId: string;
  effectiveAt: Date;
  canVersion: number;
  lifecycleStatus: CanLifecycleStatus | null;
  physicalCondition: CanPhysicalCondition | null;
  periodYear: number | null;
  periodMonth: number | null;
}

function changeEventJoins() {
  const collection = alias(schema.collections, 'change_collection');
  const collectionAssignment = alias(schema.assignments, 'change_collection_assignment');
  const visit = alias(schema.canVisits, 'change_visit');

  const periodYearExpr = sql<number | null>`coalesce(
    ${schema.canStateHistory.periodYear},
    ${collectionAssignment.periodYear},
    ${visit.periodYear}
  )`;
  const periodMonthExpr = sql<number | null>`coalesce(
    ${schema.canStateHistory.periodMonth},
    ${collectionAssignment.periodMonth},
    ${visit.periodMonth}
  )`;

  return {
    collection,
    collectionAssignment,
    visit,
    periodYearExpr,
    periodMonthExpr,
  };
}

/**
 * Agregasi perubahan per periode tugas untuk scope overview.
 * Nominal/tugas/snapshot TIDAK disentuh di sini.
 */
export async function getCanChangeSummary(
  scope: OverviewScopeInput,
  period: OverviewPeriodInput,
  now: Date = new Date(),
): Promise<CanChangeSummary> {
  const months = resolveMonths(period);
  const periods = months.map((month) => ({ year: period.year, month }));
  const current = currentOperationalPeriod(now);
  const { collection, collectionAssignment, visit, periodYearExpr, periodMonthExpr } = changeEventJoins();

  const dimensionChange = or(
    isNotNull(schema.canStateHistory.lifecycleStatus),
    isNotNull(schema.canStateHistory.physicalCondition),
  );

  const [coverageRow, unattributedRow, eventRows] = await Promise.all([
    db.select({ at: sql<Date | null>`min(${schema.canStateHistory.effectiveAt})` })
      .from(schema.canStateHistory)
      .innerJoin(schema.cans, eq(schema.cans.id, schema.canStateHistory.canId))
      .where(and(
        changeScopeCondition(scope),
        inArray(schema.canStateHistory.sourceType, [...CAN_STATE_ANCHOR_SOURCES]),
      )),

    db.select({ count: sql<number>`count(*)::int` })
      .from(schema.canStateHistory)
      .innerJoin(schema.cans, eq(schema.cans.id, schema.canStateHistory.canId))
      .leftJoin(collection, and(
        eq(schema.canStateHistory.sourceType, CAN_STATE_SOURCE.COLLECTION),
        or(
          eq(collection.id, schema.canStateHistory.triggerCollectionId),
          sql`${collection.id}::text = ${schema.canStateHistory.sourceId}`,
        ),
      ))
      .leftJoin(collectionAssignment, eq(collectionAssignment.id, collection.assignmentId))
      .leftJoin(visit, and(
        eq(schema.canStateHistory.sourceType, CAN_STATE_SOURCE.CAN_VISIT),
        sql`${visit.id}::text = ${schema.canStateHistory.sourceId}`,
      ))
      .where(and(
        changeScopeCondition(scope),
        dimensionChange,
        notInArray(schema.canStateHistory.sourceType, [...CAN_STATE_ANCHOR_SOURCES]),
        isNull(periodYearExpr),
      )),

    db.select({
      id: schema.canStateHistory.id,
      canId: schema.canStateHistory.canId,
      effectiveAt: schema.canStateHistory.effectiveAt,
      canVersion: schema.canStateHistory.canVersion,
      lifecycleStatus: schema.canStateHistory.lifecycleStatus,
      physicalCondition: schema.canStateHistory.physicalCondition,
      periodYear: periodYearExpr,
      periodMonth: periodMonthExpr,
    })
      .from(schema.canStateHistory)
      .innerJoin(schema.cans, eq(schema.cans.id, schema.canStateHistory.canId))
      .leftJoin(collection, and(
        eq(schema.canStateHistory.sourceType, CAN_STATE_SOURCE.COLLECTION),
        or(
          eq(collection.id, schema.canStateHistory.triggerCollectionId),
          sql`${collection.id}::text = ${schema.canStateHistory.sourceId}`,
        ),
      ))
      .leftJoin(collectionAssignment, eq(collectionAssignment.id, collection.assignmentId))
      .leftJoin(visit, and(
        eq(schema.canStateHistory.sourceType, CAN_STATE_SOURCE.CAN_VISIT),
        sql`${visit.id}::text = ${schema.canStateHistory.sourceId}`,
      ))
      .where(and(
        changeScopeCondition(scope),
        dimensionChange,
        notInArray(schema.canStateHistory.sourceType, [...CAN_STATE_ANCHOR_SOURCES]),
        eq(periodYearExpr, period.year),
        inArray(periodMonthExpr, months),
      ))
      .orderBy(
        asc(schema.canStateHistory.effectiveAt),
        asc(schema.canStateHistory.canVersion),
      ),
  ]);

  const coverageStartRaw = coverageRow[0]?.at ?? null;
  const coverageStart = coverageStartRaw ? new Date(coverageStartRaw) : null;
  const unattributedEvents = Number(unattributedRow[0]?.count ?? 0);

  const events: AttributedCanChangeEvent[] = (eventRows as ChangeEventRow[])
    .filter((row) => row.periodYear !== null && row.periodMonth !== null)
    .map((row) => ({
      id: row.id,
      canId: row.canId,
      effectiveAt: new Date(row.effectiveAt),
      canVersion: row.canVersion,
      lifecycleStatus: row.lifecycleStatus,
      physicalCondition: row.physicalCondition,
      periodYear: Number(row.periodYear),
      periodMonth: Number(row.periodMonth),
    }));

  const perPeriod = summarizeCanChangesByPeriod(events, periods);
  const totals = emptyDimensionCounts();
  const periodSummaries: CanChangeTaskPeriodSummary[] = periods.map((p) => {
    const key = changePeriodKey(p.year, p.month);
    const counts = perPeriod.get(key) ?? emptyDimensionCounts();
    addDimension(totals.lifecycle, counts.lifecycle);
    addDimension(totals.physical_condition, counts.physical_condition);
    return {
      period: key,
      year: p.year,
      month: p.month,
      completeness: periodCompleteness(p, coverageStart, unattributedEvents, current),
      lifecycle: counts.lifecycle,
      physical_condition: counts.physical_condition,
    };
  });

  return {
    coverage_start: coverageStart ? coverageStart.toISOString() : null,
    completeness: worstCompleteness(periodSummaries.map((p) => p.completeness)),
    unattributed_events: unattributedEvents,
    periods: periodSummaries,
    lifecycle: totals.lifecycle,
    physical_condition: totals.physical_condition,
  };
}
