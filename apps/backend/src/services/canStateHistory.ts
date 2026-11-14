/**
 * Ledger keadaan kaleng — append-only, patch per dimensi.
 *
 * Aturan (docs/rencana-pemisahan-status-kondisi-kaleng-periode-2026-11-13.md):
 * - Event hanya membawa dimensi yang berubah (lifecycle/kondisi fisik/ranting).
 * - `effective_at` = waktu kejadian (collected_at/visited_at/transisi admin).
 * - Urutan deterministik `(effective_at, can_version)`; versi dialokasikan
 *   monotonik di bawah lock baris `cans`.
 * - Baseline cutover menjadi jangkar replay. Event dengan effective_at sebelum
 *   baseline TIDAK menimpa state baseline yang sudah diverifikasi.
 * - Event terlambat memicu rebuild proyeksi `cans` (checkpoint materialized).
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { and, asc, eq, inArray, lt, lte, sql, type ExtractTablesWithRelations } from 'drizzle-orm';
import { type PgTransaction } from 'drizzle-orm/pg-core';
import { Errors } from '../utils/errorCatalog';
import {
  deriveIsActive,
  deriveLegacyCondition,
  diffCanState,
  replayCanStatePatches,
  stateFromLegacyCondition,
  type CanLifecycleStatus,
  type CanPhysicalCondition,
  type CanState,
  type PhysicalConditionSource,
} from './canState';

export type CanStateDb =
  | typeof db
  | PgTransaction<any, typeof schema, ExtractTablesWithRelations<typeof schema>>;

/** Sumber event yang menjadi jangkar (snapshot penuh pertama) replay. */
export const CAN_STATE_ANCHOR_SOURCES = ['CUTOVER_BASELINE', 'CAN_CREATED'] as const;
const ANCHOR_SOURCE_SET = new Set<string>(CAN_STATE_ANCHOR_SOURCES);

export const CAN_STATE_SOURCE = {
  CAN_CREATED: 'CAN_CREATED',
  CUTOVER_BASELINE: 'CUTOVER_BASELINE',
  ADMIN_UPDATE: 'ADMIN_UPDATE',
  ADMIN_DELETE: 'ADMIN_DELETE',
  CONDITION_PROPOSAL: 'CONDITION_PROPOSAL',
  AUTO_EMPTY_STREAK: 'AUTO_EMPTY_STREAK',
  AUTO_RESTORE_ACTIVE: 'AUTO_RESTORE_ACTIVE',
  COLLECTION: 'COLLECTION',
  CAN_VISIT: 'CAN_VISIT',
} as const;

export type CanStateSourceType =
  (typeof CAN_STATE_SOURCE)[keyof typeof CAN_STATE_SOURCE];

export interface CanStateEventInput {
  canId: string;
  lifecycleStatus?: CanLifecycleStatus;
  physicalCondition?: CanPhysicalCondition;
  physicalConditionSource?: PhysicalConditionSource;
  branchId?: string;
  /** Waktu kejadian; bukan waktu server mencatat. */
  effectiveAt: Date;
  sourceType: CanStateSourceType | string;
  sourceId: string;
  actorId?: string | null;
  reasonCode?: string | null;
}

export interface CanStateEventRow {
  effectiveAt: Date;
  canVersion: number;
  lifecycleStatus: CanLifecycleStatus | null;
  physicalCondition: CanPhysicalCondition | null;
  physicalConditionSource: PhysicalConditionSource | null;
  branchId: string | null;
  sourceType: string;
}

export interface ReplayResult {
  state: CanState;
  branchId: string | null;
  historyComplete: boolean;
  anchorAt: Date | null;
}

/** Kunci baris kaleng; SEMUA jalur state-changing wajib memakai helper ini. */
export async function lockCanRow(tx: CanStateDb, canId: string) {
  const [row] = await tx
    .select()
    .from(schema.cans)
    .where(eq(schema.cans.id, canId))
    .for('update');
  if (!row) throw Errors.COLLECTION_NOT_FOUND('Kaleng tidak ditemukan');
  return row;
}

export async function findCanStateEvents(
  client: CanStateDb,
  canIds: string[],
  cutoff?: { at: Date; inclusive: boolean },
): Promise<Array<CanStateEventRow & { canId: string }>> {
  if (canIds.length === 0) return [];
  const conditions = [inArray(schema.canStateHistory.canId, canIds)];
  if (cutoff) {
    conditions.push(
      cutoff.inclusive
        ? lte(schema.canStateHistory.effectiveAt, cutoff.at)
        : lt(schema.canStateHistory.effectiveAt, cutoff.at),
    );
  }
  const rows = await client
    .select({
      canId: schema.canStateHistory.canId,
      effectiveAt: schema.canStateHistory.effectiveAt,
      canVersion: schema.canStateHistory.canVersion,
      lifecycleStatus: schema.canStateHistory.lifecycleStatus,
      physicalCondition: schema.canStateHistory.physicalCondition,
      physicalConditionSource: schema.canStateHistory.physicalConditionSource,
      branchId: schema.canStateHistory.branchId,
      sourceType: schema.canStateHistory.sourceType,
    })
    .from(schema.canStateHistory)
    .where(and(...conditions))
    .orderBy(
      asc(schema.canStateHistory.effectiveAt),
      asc(schema.canStateHistory.canVersion),
      asc(schema.canStateHistory.recordedAt),
    );
  return rows;
}

export interface SnapshotFallback {
  state: CanState;
  branchId: string | null;
}

/**
 * Replay satu kaleng pada cutoff tertentu.
 * `cutoff.at` + `inclusive=false` dipakai untuk batas historis setengah terbuka
 * (`effective_at < awal bulan berikutnya`); `inclusive=true` untuk bulan berjalan.
 */
export function replayCanStateAt(
  events: CanStateEventRow[],
  cutoff: { at: Date; inclusive: boolean } | null,
  fallback?: SnapshotFallback,
): ReplayResult {
  const sorted = [...events].sort(
    (a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime() || a.canVersion - b.canVersion,
  );

  const inRange = (event: CanStateEventRow): boolean => {
    if (!cutoff) return true;
    const t = event.effectiveAt.getTime();
    return cutoff.inclusive ? t <= cutoff.at.getTime() : t < cutoff.at.getTime();
  };

  const anchorAtOrBefore = [...sorted]
    .reverse()
    .find((event) => ANCHOR_SOURCE_SET.has(event.sourceType) && inRange(event));
  const firstAnchor = sorted.find((event) => ANCHOR_SOURCE_SET.has(event.sourceType));
  const anchor = anchorAtOrBefore ?? firstAnchor;

  if (!anchor) {
    return {
      state: fallback?.state ?? stateFromLegacyCondition('AKTIF'),
      branchId: fallback?.branchId ?? null,
      historyComplete: false,
      anchorAt: null,
    };
  }

  const anchorIndex = sorted.indexOf(anchor);
  const baseline: CanState = {
    lifecycleStatus: anchor.lifecycleStatus ?? fallback?.state.lifecycleStatus ?? 'AKTIF',
    physicalCondition: anchor.physicalCondition ?? fallback?.state.physicalCondition ?? 'BAIK',
    physicalConditionSource:
      anchor.physicalConditionSource ?? fallback?.state.physicalConditionSource ?? 'CUTOVER_BASELINE',
  };

  const patches = sorted
    .slice(anchorIndex + 1)
    .filter(inRange)
    .map((event) => ({
      lifecycleStatus: event.lifecycleStatus ?? undefined,
      physicalCondition: event.physicalCondition ?? undefined,
      physicalConditionSource: event.physicalConditionSource ?? undefined,
      branchId: event.branchId ?? undefined,
    }));

  const replayed = replayCanStatePatches(
    baseline,
    patches,
    anchor.branchId ?? fallback?.branchId ?? null,
  );

  return {
    state: {
      lifecycleStatus: replayed.lifecycleStatus,
      physicalCondition: replayed.physicalCondition,
      physicalConditionSource: replayed.physicalConditionSource,
    },
    branchId: replayed.branchId,
    historyComplete: inRange(anchor),
    anchorAt: anchor.effectiveAt,
  };
}

async function loadEventsForCan(client: CanStateDb, canId: string) {
  return client
    .select({
      effectiveAt: schema.canStateHistory.effectiveAt,
      canVersion: schema.canStateHistory.canVersion,
      lifecycleStatus: schema.canStateHistory.lifecycleStatus,
      physicalCondition: schema.canStateHistory.physicalCondition,
      physicalConditionSource: schema.canStateHistory.physicalConditionSource,
      branchId: schema.canStateHistory.branchId,
      sourceType: schema.canStateHistory.sourceType,
    })
    .from(schema.canStateHistory)
    .where(eq(schema.canStateHistory.canId, canId))
    .orderBy(
      asc(schema.canStateHistory.effectiveAt),
      asc(schema.canStateHistory.canVersion),
      asc(schema.canStateHistory.recordedAt),
    );
}

/**
 * Bangun ulang proyeksi materialized (`cans`) dari ledger.
 * Event sebelum baseline diabaikan sehingga baseline terverifikasi tidak
 * ditimpa oleh event historis yang datang terlambat.
 */
export async function rebuildCanProjection(tx: CanStateDb, canId: string): Promise<CanState> {
  const row = await lockCanRow(tx, canId);
  const events = await loadEventsForCan(tx, canId);
  const fallback: SnapshotFallback = {
    state: {
      lifecycleStatus: row.lifecycleStatus,
      physicalCondition: row.physicalCondition,
      physicalConditionSource: row.physicalConditionSource ?? 'OBSERVED',
    },
    branchId: row.branchId,
  };
  const replay = replayCanStateAt(events, null, fallback);
  const legacy = deriveLegacyCondition(replay.state.lifecycleStatus, replay.state.physicalCondition);

  // Hanya tulis bila ada perbedaan; `updated_at` tidak diubah oleh rebuild
  // historis agar tidak menggeser laporan berbasis waktu transisi.
  if (
    row.lifecycleStatus !== replay.state.lifecycleStatus
    || row.physicalCondition !== replay.state.physicalCondition
    || (row.physicalConditionSource ?? null) !== replay.state.physicalConditionSource
    || (replay.branchId !== null && row.branchId !== replay.branchId)
    || row.condition !== legacy
    || row.isActive !== deriveIsActive(replay.state.lifecycleStatus)
  ) {
    await tx.update(schema.cans)
      .set({
        lifecycleStatus: replay.state.lifecycleStatus,
        physicalCondition: replay.state.physicalCondition,
        physicalConditionSource: replay.state.physicalConditionSource,
        branchId: replay.branchId ?? row.branchId,
        condition: legacy,
        isActive: deriveIsActive(replay.state.lifecycleStatus),
      })
      .where(eq(schema.cans.id, canId));
  }

  return replay.state;
}

/**
 * Tambahkan event patch. Idempoten terhadap (source_type, source_id, can_id):
 * replay ganda tidak membuat baris kedua. `can_version` dialokasikan di bawah
 * lock baris kaleng agar dua mutasi bersamaan tidak mendapat versi sama.
 */
export async function appendCanStateEvent(
  tx: CanStateDb,
  input: CanStateEventInput,
): Promise<void> {
  if (
    input.lifecycleStatus === undefined
    && input.physicalCondition === undefined
    && input.branchId === undefined
  ) {
    throw Errors.VALIDATION_ERROR('Event keadaan kaleng wajib mengubah minimal satu dimensi');
  }

  const locked = await lockCanRow(tx, input.canId);

  const [inserted] = await tx.insert(schema.canStateHistory).values({
    canId: input.canId,
    lifecycleStatus: input.lifecycleStatus ?? null,
    physicalCondition: input.physicalCondition ?? null,
    physicalConditionSource: input.physicalConditionSource ?? null,
    branchId: input.branchId ?? null,
    effectiveAt: input.effectiveAt,
    canVersion: locked.canVersion + 1,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    actorId: input.actorId ?? null,
    reasonCode: input.reasonCode ?? null,
  }).onConflictDoNothing().returning({ id: schema.canStateHistory.id });

  if (inserted) {
    await tx.update(schema.cans)
      .set({ canVersion: sql`${schema.cans.canVersion} + 1` })
      .where(eq(schema.cans.id, input.canId));
  }

  await rebuildCanProjection(tx, input.canId);
}

/** Event jangkar untuk kaleng baru: snapshot penuh pertama pada created_at. */
export async function insertCanCreatedEvent(
  tx: CanStateDb,
  row: {
    id: string;
    branchId: string;
    createdAt: Date;
    lifecycleStatus: CanLifecycleStatus;
    physicalCondition: CanPhysicalCondition;
    physicalConditionSource: PhysicalConditionSource;
    canVersion: number;
  },
  actorId?: string | null,
): Promise<void> {
  await tx.insert(schema.canStateHistory).values({
    canId: row.id,
    lifecycleStatus: row.lifecycleStatus,
    physicalCondition: row.physicalCondition,
    physicalConditionSource: row.physicalConditionSource,
    branchId: row.branchId,
    effectiveAt: row.createdAt,
    canVersion: row.canVersion,
    sourceType: CAN_STATE_SOURCE.CAN_CREATED,
    sourceId: row.id,
    actorId: actorId ?? null,
  }).onConflictDoNothing();
}

export interface RecordCanStateChangeInput {
  canId: string;
  before: {
    lifecycleStatus: CanLifecycleStatus;
    physicalCondition: CanPhysicalCondition;
    physicalConditionSource: PhysicalConditionSource;
    branchId: string;
  };
  after: {
    lifecycleStatus: CanLifecycleStatus;
    physicalCondition: CanPhysicalCondition;
    physicalConditionSource: PhysicalConditionSource;
    branchId: string;
  };
  effectiveAt: Date;
  sourceType: CanStateSourceType;
  sourceId: string;
  actorId?: string | null;
  reasonCode?: string | null;
}

/**
 * Catat diff dimensi (bukan snapshot penuh). Mengembalikan false bila tidak
 * ada yang berubah — pemanggil tidak perlu menulis event kosong.
 */
export async function recordCanStateChange(
  tx: CanStateDb,
  input: RecordCanStateChangeInput,
): Promise<boolean> {
  const patch = diffCanState(
    {
      lifecycleStatus: input.before.lifecycleStatus,
      physicalCondition: input.before.physicalCondition,
      physicalConditionSource: input.before.physicalConditionSource,
      branchId: input.before.branchId,
    },
    {
      lifecycleStatus: input.after.lifecycleStatus,
      physicalCondition: input.after.physicalCondition,
      physicalConditionSource: input.after.physicalConditionSource,
      branchId: input.after.branchId,
    },
  );
  if (!patch) return false;

  await appendCanStateEvent(tx, {
    canId: input.canId,
    lifecycleStatus: patch.lifecycleStatus,
    physicalCondition: patch.physicalCondition,
    physicalConditionSource: patch.physicalConditionSource,
    branchId: patch.branchId,
    effectiveAt: input.effectiveAt,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    actorId: input.actorId,
    reasonCode: input.reasonCode,
  });
  return true;
}

/** Hapus ledger hanya untuk penghapusan permanen yang sudah lolos guard. */
export async function deleteCanStateHistory(tx: CanStateDb, canIds: string[]): Promise<void> {
  if (canIds.length === 0) return;
  await tx.delete(schema.canStateHistory).where(inArray(schema.canStateHistory.canId, canIds));
}

/**
 * State saat ini dari baris `cans` sebagai fallback snapshot; dipakai overview
 * bila ledger belum tersedia (mis. database test lama).
 */
export function fallbackStateFromCanRow(row: {
  lifecycleStatus: CanLifecycleStatus;
  physicalCondition: CanPhysicalCondition;
  physicalConditionSource: PhysicalConditionSource | null;
  branchId: string;
}): SnapshotFallback {
  return {
    state: {
      lifecycleStatus: row.lifecycleStatus,
      physicalCondition: row.physicalCondition,
      physicalConditionSource: row.physicalConditionSource ?? 'OBSERVED',
    },
    branchId: row.branchId,
  };
}
