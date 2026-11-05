/**
 * Status periode berbasis AKSI, bukan kalender.
 *
 * - `tuntas` = status akhir rantai tanda tangan: PPK `FINAL`, ranting
 *   `FINAL`/`FINAL_NOL`.
 * - `display_period` = periode berhak tertua yang belum tuntas untuk cakupan
 *   pengguna; kalau tidak ada → periode operasional berjalan.
 * - `REASSIGNED` netral: tugas sudah lepas ke petugas pengganti, bukan beban
 *   maupun penyebut progres petugas asal (lihat services/taskMetrics.ts).
 * - Tanggal (20/27/9) hanya pengingat; tidak ada gerbang waktu di sini.
 *
 * Satu sumber kebenaran untuk mobile (`/mobile/period-context`), admin
 * (`/admin/period-context`), dan gate giliran penugasan.
 */
import { and, eq, sql, type AnyColumn } from 'drizzle-orm';
import { db } from '../config/database';
import * as schema from '../database/schema';
import { AppError } from '../utils/AppError';
import { currentOperationalPeriod } from '../utils/operationalTimeZone';
import { insertActivityLog } from './auditLogService';

/** Jendela pencarian periode untuk penentuan `display_period`. */
export const PERIOD_LOOKBACK_MONTHS = 6;
/** Jendela pencarian untuk gate giliran penugasan (periode sebelumnya). */
export const PREVIOUS_PERIOD_LOOKBACK_MONTHS = 12;

export type PeriodScope =
  | { kind: 'officer'; officerId: string }
  | { kind: 'branch'; branchId: string }
  | { kind: 'district'; districtId: string };

export interface PeriodRef {
  year: number;
  month: number;
}

export type PeriodPendingReason =
  | 'PPK_DRAFT'
  | 'PPK_WAITING_BENDAHARA'
  | 'BRANCH_DRAFT'
  | 'BRANCH_WAITING_MWC'
  | 'DISTRICT_UNSETTLED';

export type PeriodWaitingFor =
  | 'PPK'
  | 'BENDAHARA_RANTING'
  | 'BENDAHARA_MWC'
  | 'ADMIN';

export interface PeriodProgress extends PeriodRef {
  period: string;
  reason: PeriodPendingReason;
  waiting_for: PeriodWaitingFor;
}

export interface PeriodState {
  current_period: PeriodRef;
  display_period: PeriodRef;
  display_reason: PeriodPendingReason | null;
  unsettled: PeriodProgress[];
}

export interface PeriodGateResult {
  overridden: boolean;
  warning: PeriodProgress | null;
}

interface PeriodCell {
  eligible: boolean;
  settled: boolean;
  reason: PeriodPendingReason | null;
  waitingFor: PeriodWaitingFor | null;
  /** Khusus ranting: sudah ditandatangani bendahara ranting (menunggu MWC). */
  signed?: boolean;
}

// ── util periode ────────────────────────────────────────────────────────────

/**
 * Cakupan periode dari payload JWT: petugas → officer; pengguna ber-ranting →
 * branch; selain itu → district.
 */
export function scopeForUser(user: {
  role: string;
  officerId?: string;
  branchId?: string;
  districtId?: string;
}): PeriodScope | null {
  if (user.role === 'PETUGAS' && user.officerId) {
    return { kind: 'officer', officerId: user.officerId };
  }
  if (user.branchId) return { kind: 'branch', branchId: user.branchId };
  if (user.districtId) return { kind: 'district', districtId: user.districtId };
  return null;
}

/**
 * Periode tampilan berbasis aksi untuk pengguna JWT. `null` bila pengguna
 * tidak punya cakupan data — pemanggil yang memutuskan fallback/400.
 */
export async function resolveDisplayPeriod(
  user: {
    role: string;
    officerId?: string;
    branchId?: string;
    districtId?: string;
  },
  now: Date = new Date(),
): Promise<PeriodRef | null> {
  const scope = scopeForUser(user);
  if (!scope) return null;
  const state = await getPeriodState(scope, now);
  return state.display_period;
}

export function periodKey(p: PeriodRef): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}

function periodOrdinal(p: PeriodRef): number {
  return p.year * 12 + (p.month - 1);
}

function shiftPeriodRef(p: PeriodRef, delta: number): PeriodRef {
  const total = periodOrdinal(p) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/** Daftar periode menaik (tertua → anchor). */
function periodList(anchor: PeriodRef, count: number): PeriodRef[] {
  const out: PeriodRef[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    out.push(shiftPeriodRef(anchor, -i));
  }
  return out;
}

function rangeCondition(
  yearCol: AnyColumn,
  monthCol: AnyColumn,
  from: PeriodRef,
  to: PeriodRef,
) {
  return sql`(${yearCol} * 12 + ${monthCol}) between ${periodOrdinal(from) + 1} and ${periodOrdinal(to) + 1}`;
}

function cellOf(map: Map<string, PeriodCell>, p: PeriodRef): PeriodCell {
  const key = periodKey(p);
  let cell = map.get(key);
  if (!cell) {
    cell = { eligible: false, settled: false, reason: null, waitingFor: null };
    map.set(key, cell);
  }
  return cell;
}

// ── status per cakupan ──────────────────────────────────────────────────────

async function officerCells(officerId: string, periods: PeriodRef[]) {
  const from = periods[0];
  const to = periods[periods.length - 1];
  const map = new Map<string, PeriodCell>();

  const [assignmentRows, submissionRows] = await Promise.all([
    db
      .select({
        year: schema.assignments.periodYear,
        month: schema.assignments.periodMonth,
        total: sql<number>`count(*)::int`,
        reassigned: sql<number>`count(*) filter (where ${schema.assignments.status} = 'REASSIGNED')::int`,
      })
      .from(schema.assignments)
      .where(
        and(
          eq(schema.assignments.officerId, officerId),
          rangeCondition(
            schema.assignments.periodYear,
            schema.assignments.periodMonth,
            from,
            to,
          ),
        ),
      )
      .groupBy(schema.assignments.periodYear, schema.assignments.periodMonth),
    db
      .select({
        year: schema.ppkSubmissions.periodYear,
        month: schema.ppkSubmissions.periodMonth,
        status: schema.ppkSubmissions.status,
        signed: sql<boolean>`${schema.ppkSubmissions.ppkSignerId} is not null`,
      })
      .from(schema.ppkSubmissions)
      .where(
        and(
          eq(schema.ppkSubmissions.officerId, officerId),
          rangeCondition(
            schema.ppkSubmissions.periodYear,
            schema.ppkSubmissions.periodMonth,
            from,
            to,
          ),
        ),
      ),
  ]);

  const work = new Map<string, number>();
  for (const row of assignmentRows) {
    const key = periodKey({ year: row.year, month: row.month });
    work.set(key, (work.get(key) ?? 0) + (Number(row.total) - Number(row.reassigned)));
  }

  for (const row of submissionRows) {
    const p = { year: row.year, month: row.month };
    const cell = cellOf(map, p);
    const hasWork = (work.get(periodKey(p)) ?? 0) > 0;
    // Submission ber-TTD tetap berhak walau semua assignment-nya sudah dialihkan.
    cell.eligible = cell.eligible || hasWork || row.status !== 'DRAFT' || row.signed;
    cell.settled = row.status === 'FINAL';
    if (!cell.settled) {
      cell.reason = row.status === 'PPK_SIGNED' ? 'PPK_WAITING_BENDAHARA' : 'PPK_DRAFT';
      cell.waitingFor = row.status === 'PPK_SIGNED' ? 'BENDAHARA_RANTING' : 'PPK';
    }
  }

  for (const [key, activeWork] of work) {
    if (activeWork <= 0) continue;
    const [year, month] = key.split('-').map(Number);
    const cell = cellOf(map, { year, month });
    cell.eligible = true;
    if (!cell.settled && cell.reason === null) {
      // Ada tugas tetapi belum ada submission ber-TTD.
      cell.reason = 'PPK_DRAFT';
      cell.waitingFor = 'PPK';
    }
  }

  return map;
}

async function branchCells(branchId: string, periods: PeriodRef[]) {
  const from = periods[0];
  const to = periods[periods.length - 1];
  const map = new Map<string, PeriodCell>();

  const [assignmentRows, ppkRows, branchRows] = await Promise.all([
    db
      .select({
        year: schema.assignments.periodYear,
        month: schema.assignments.periodMonth,
        total: sql<number>`count(*)::int`,
        reassigned: sql<number>`count(*) filter (where ${schema.assignments.status} = 'REASSIGNED')::int`,
      })
      .from(schema.assignments)
      .innerJoin(schema.officers, eq(schema.assignments.officerId, schema.officers.id))
      .where(
        and(
          eq(schema.officers.branchId, branchId),
          rangeCondition(
            schema.assignments.periodYear,
            schema.assignments.periodMonth,
            from,
            to,
          ),
        ),
      )
      .groupBy(schema.assignments.periodYear, schema.assignments.periodMonth),
    db
      .select({
        year: schema.ppkSubmissions.periodYear,
        month: schema.ppkSubmissions.periodMonth,
        status: schema.ppkSubmissions.status,
        total: sql<number>`count(*)::int`,
      })
      .from(schema.ppkSubmissions)
      .where(
        and(
          eq(schema.ppkSubmissions.branchId, branchId),
          rangeCondition(
            schema.ppkSubmissions.periodYear,
            schema.ppkSubmissions.periodMonth,
            from,
            to,
          ),
        ),
      )
      .groupBy(
        schema.ppkSubmissions.periodYear,
        schema.ppkSubmissions.periodMonth,
        schema.ppkSubmissions.status,
      ),
    db
      .select({
        year: schema.branchSubmissions.periodYear,
        month: schema.branchSubmissions.periodMonth,
        status: schema.branchSubmissions.status,
        signed: sql<boolean>`${schema.branchSubmissions.rantingSignerId} is not null`,
      })
      .from(schema.branchSubmissions)
      .where(
        and(
          eq(schema.branchSubmissions.branchId, branchId),
          rangeCondition(
            schema.branchSubmissions.periodYear,
            schema.branchSubmissions.periodMonth,
            from,
            to,
          ),
        ),
      ),
  ]);

  const work = new Map<string, number>();
  for (const row of assignmentRows) {
    const key = periodKey({ year: row.year, month: row.month });
    work.set(key, (work.get(key) ?? 0) + (Number(row.total) - Number(row.reassigned)));
  }

  const ppkByPeriod = new Map<string, { draft: number; signed: number; other: number }>();
  for (const row of ppkRows) {
    const key = periodKey({ year: row.year, month: row.month });
    const acc = ppkByPeriod.get(key) ?? { draft: 0, signed: 0, other: 0 };
    if (row.status === 'DRAFT') acc.draft += Number(row.total);
    else if (row.status === 'PPK_SIGNED') acc.signed += Number(row.total);
    else acc.other += Number(row.total);
    ppkByPeriod.set(key, acc);
  }

  for (const row of branchRows) {
    const p = { year: row.year, month: row.month };
    const cell = cellOf(map, p);
    cell.eligible = true;
    cell.settled = row.status === 'FINAL' || row.status === 'FINAL_NOL';
    if (!cell.settled) {
      cell.signed = row.signed;
    }
  }

  for (const [key, activeWork] of work) {
    if (activeWork <= 0) continue;
    const [year, month] = key.split('-').map(Number);
    cellOf(map, { year, month }).eligible = true;
  }

  // Alasan tunggakan: PPK dulu, baru ranting.
  for (const [key, cell] of map) {
    if (cell.settled) continue;
    const ppk = ppkByPeriod.get(key);
    if (!ppk || ppk.draft + ppk.signed > 0) {
      // Belum ada submission PPK sama sekali, atau masih ada yang belum FINAL.
      if (ppk && ppk.signed > 0) {
        cell.reason = 'PPK_WAITING_BENDAHARA';
        cell.waitingFor = 'BENDAHARA_RANTING';
      } else {
        cell.reason = 'PPK_DRAFT';
        cell.waitingFor = 'PPK';
      }
      continue;
    }
    cell.reason = cell.signed ? 'BRANCH_WAITING_MWC' : 'BRANCH_DRAFT';
    cell.waitingFor = cell.signed ? 'BENDAHARA_MWC' : 'BENDAHARA_RANTING';
  }

  return map;
}

async function districtCells(districtId: string, periods: PeriodRef[]) {
  const from = periods[0];
  const to = periods[periods.length - 1];
  const map = new Map<string, PeriodCell>();

  const [assignmentRows, branchRows] = await Promise.all([
    db
      .select({
        year: schema.assignments.periodYear,
        month: schema.assignments.periodMonth,
        branchId: schema.officers.branchId,
        total: sql<number>`count(*)::int`,
        reassigned: sql<number>`count(*) filter (where ${schema.assignments.status} = 'REASSIGNED')::int`,
      })
      .from(schema.assignments)
      .innerJoin(schema.officers, eq(schema.assignments.officerId, schema.officers.id))
      .innerJoin(schema.branches, eq(schema.officers.branchId, schema.branches.id))
      .where(
        and(
          eq(schema.branches.districtId, districtId),
          rangeCondition(
            schema.assignments.periodYear,
            schema.assignments.periodMonth,
            from,
            to,
          ),
        ),
      )
      .groupBy(
        schema.assignments.periodYear,
        schema.assignments.periodMonth,
        schema.officers.branchId,
      ),
    db
      .select({
        year: schema.branchSubmissions.periodYear,
        month: schema.branchSubmissions.periodMonth,
        branchId: schema.branchSubmissions.branchId,
        status: schema.branchSubmissions.status,
      })
      .from(schema.branchSubmissions)
      .where(
        and(
          eq(schema.branchSubmissions.districtId, districtId),
          rangeCondition(
            schema.branchSubmissions.periodYear,
            schema.branchSubmissions.periodMonth,
            from,
            to,
          ),
        ),
      ),
  ]);

  const branchesWithWork = new Map<string, Set<string>>();
  for (const row of assignmentRows) {
    const active = Number(row.total) - Number(row.reassigned);
    if (active <= 0) continue;
    const key = periodKey({ year: row.year, month: row.month });
    const set = branchesWithWork.get(key) ?? new Set<string>();
    set.add(row.branchId);
    branchesWithWork.set(key, set);
    cellOf(map, { year: row.year, month: row.month }).eligible = true;
  }

  const settledBranches = new Map<string, Set<string>>();
  const subStats = new Map<string, { total: number; settled: number }>();
  for (const row of branchRows) {
    const p = { year: row.year, month: row.month };
    cellOf(map, p).eligible = true;
    const key = periodKey(p);
    const acc = subStats.get(key) ?? { total: 0, settled: 0 };
    acc.total += 1;
    if (row.status === 'FINAL' || row.status === 'FINAL_NOL') {
      acc.settled += 1;
      const set = settledBranches.get(key) ?? new Set<string>();
      set.add(row.branchId);
      settledBranches.set(key, set);
    }
    subStats.set(key, acc);
  }

  for (const [key, cell] of map) {
    const needed = branchesWithWork.get(key) ?? new Set<string>();
    const settled = settledBranches.get(key) ?? new Set<string>();
    const stats = subStats.get(key) ?? { total: 0, settled: 0 };
    const everyWorkBranchHasFinal = [...needed].every((branchId) => settled.has(branchId));
    const everySubmissionSettled = stats.total === stats.settled;
    cell.settled = everyWorkBranchHasFinal && everySubmissionSettled;
    if (!cell.settled) {
      cell.reason = 'DISTRICT_UNSETTLED';
      cell.waitingFor = 'ADMIN';
    }
  }

  return map;
}

async function cellsForScope(scope: PeriodScope, periods: PeriodRef[]) {
  switch (scope.kind) {
    case 'officer':
      return officerCells(scope.officerId, periods);
    case 'branch':
      return branchCells(scope.branchId, periods);
    case 'district':
      return districtCells(scope.districtId, periods);
  }
}

/**
 * Status periode untuk satu cakupan. Default `now` bisa diinjeksi agar tes
 * deterministik.
 */
export async function getPeriodState(
  scope: PeriodScope,
  now: Date = new Date(),
): Promise<PeriodState> {
  const current = currentOperationalPeriod(now);
  const periods = periodList(current, PERIOD_LOOKBACK_MONTHS);
  const map = await cellsForScope(scope, periods);

  const unsettled: PeriodProgress[] = [];
  for (const p of periods) {
    const cell = map.get(periodKey(p));
    if (!cell || !cell.eligible || cell.settled) continue;
    if (!cell.reason || !cell.waitingFor) continue;
    unsettled.push({
      ...p,
      period: periodKey(p),
      reason: cell.reason,
      waiting_for: cell.waitingFor,
    });
  }

  const first = unsettled[0];
  return {
    current_period: current,
    display_period: first ? { year: first.year, month: first.month } : current,
    display_reason: first ? first.reason : null,
    unsettled,
  };
}

/** Mode gate: `warn` (default) hanya memberi peringatan, `enforce` menolak. */
export function periodGateMode(): 'warn' | 'enforce' {
  return process.env.PERIOD_GATE === 'enforce' ? 'enforce' : 'warn';
}

export interface PeriodGateOptions {
  force?: boolean;
  reason?: string | null;
  actor?: {
    userId: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
  now?: Date;
}

/**
 * Gate giliran: periode target hanya boleh dibuka bila periode berhak
 * sebelumnya sudah tuntas. `REASSIGNED` netral; tanggal tidak diperiksa.
 */
export async function assertPreviousPeriodSettled(
  scope: PeriodScope,
  target: PeriodRef,
  options: PeriodGateOptions = {},
): Promise<PeriodGateResult> {
  const lookback = periodList(target, PREVIOUS_PERIOD_LOOKBACK_MONTHS + 1).slice(0, -1);
  if (lookback.length === 0) return { overridden: false, warning: null };

  const map = await cellsForScope(scope, lookback);
  let warning: PeriodProgress | null = null;
  for (let i = lookback.length - 1; i >= 0; i -= 1) {
    const p = lookback[i];
    const cell = map.get(periodKey(p));
    if (!cell || !cell.eligible || cell.settled) continue;
    if (!cell.reason || !cell.waitingFor) continue;
    warning = {
      ...p,
      period: periodKey(p),
      reason: cell.reason,
      waiting_for: cell.waitingFor,
    };
    break;
  }

  if (!warning) return { overridden: false, warning: null };

  if (options.force) {
    if (!options.reason || options.reason.trim().length === 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Override gate periode wajib menyertakan alasan.',
        400,
        false,
      );
    }
    if (options.actor) {
      await insertActivityLog({
        userId: options.actor.userId,
        officerId: null,
        actionType: 'PERIOD_GATE_OVERRIDE',
        entityType: 'period',
        entityId: null,
        oldData: { unsettled: warning },
        newData: {
          target_period: periodKey(target),
          reason: options.reason.trim(),
        },
        ipAddress: options.actor.ipAddress ?? 'period-gate',
        userAgent: options.actor.userAgent ?? null,
      });
    }
    return { overridden: true, warning };
  }

  if (periodGateMode() === 'warn') {
    return { overridden: false, warning };
  }

  throw new AppError(
    'PREVIOUS_PERIOD_NOT_SETTLED',
    `Periode ${warning.period} belum tuntas (${warning.reason}). Selesaikan dulu atau gunakan force + alasan.`,
    409,
    false,
    { unsettled: warning, target_period: periodKey(target) },
  );
}
