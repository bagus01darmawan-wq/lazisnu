/**
 * Domain pemetaan status lifecycle + kondisi fisik kaleng.
 *
 * Sumber aturan: docs/rencana-pemisahan-status-kondisi-kaleng-periode-2026-11-13.md
 *
 * Dua dimensi yang independen:
 * - Status  : AKTIF | NON_AKTIF | DIKEMBALIKAN  (operasional/lifecycle)
 * - Kondisi : BAIK | RUSAK | HILANG             (fisik)
 *
 * Modul ini SENGAJA murni (tanpa database) agar mapping backfill, transisi,
 * proyeksi legacy, dan validasi request campuran punya satu sumber kebenaran
 * yang dapat diuji tanpa Postgres.
 */
import type { CanConditionValue } from './conditionRules';

export type CanLifecycleStatus = 'AKTIF' | 'NON_AKTIF' | 'DIKEMBALIKAN';
export type CanPhysicalCondition = 'BAIK' | 'RUSAK' | 'HILANG';
export type PhysicalConditionSource =
  | 'OBSERVED'
  | 'LEGACY_ASSUMPTION_BAIK'
  | 'CUTOVER_BASELINE';

export const CAN_LIFECYCLE_STATUSES: CanLifecycleStatus[] = [
  'AKTIF',
  'NON_AKTIF',
  'DIKEMBALIKAN',
];

export const CAN_PHYSICAL_CONDITIONS: CanPhysicalCondition[] = [
  'BAIK',
  'RUSAK',
  'HILANG',
];

export const LEGACY_BAIK_ASSUMPTION: PhysicalConditionSource = 'LEGACY_ASSUMPTION_BAIK';

export interface CanState {
  lifecycleStatus: CanLifecycleStatus;
  physicalCondition: CanPhysicalCondition;
  physicalConditionSource: PhysicalConditionSource;
}

/** Patch per dimensi; field yang tidak berubah dibiarkan undefined. */
export interface CanStatePatch {
  lifecycleStatus?: CanLifecycleStatus;
  physicalCondition?: CanPhysicalCondition;
  physicalConditionSource?: PhysicalConditionSource;
  branchId?: string;
}

export interface LegacyStateOptions {
  /** Kondisi fisik terakhir yang dapat dibuktikan dari riwayat (opsional). */
  lastKnownPhysicalCondition?: CanPhysicalCondition | null;
  /** Provenance untuk nilai terakhir tersebut; default OBSERVED. */
  provenance?: PhysicalConditionSource | null;
}

export function isLifecycleStatus(value: string): value is CanLifecycleStatus {
  return (CAN_LIFECYCLE_STATUSES as string[]).includes(value);
}

export function isPhysicalCondition(value: string): value is CanPhysicalCondition {
  return (CAN_PHYSICAL_CONDITIONS as string[]).includes(value);
}

const LEGACY_CONDITIONS: CanConditionValue[] = [
  'AKTIF',
  'NON_AKTIF',
  'RUSAK',
  'HILANG',
  'DIKEMBALIKAN',
];

export function isLegacyCondition(value: string): value is CanConditionValue {
  return (LEGACY_CONDITIONS as string[]).includes(value);
}

export function newCanState(): CanState {
  return {
    lifecycleStatus: 'AKTIF',
    physicalCondition: 'BAIK',
    physicalConditionSource: 'OBSERVED',
  };
}

/**
 * Backfill lima enum legacy. `NON_AKTIF`/`DIKEMBALIKAN` tidak menyimpan kondisi
 * fisik di skema lama; bila riwayat tidak membuktikan nilai terakhir, isi BAIK
 * dan tandai sebagai asumsi agar dapat ditinjau.
 */
export function stateFromLegacyCondition(
  condition: CanConditionValue,
  options: LegacyStateOptions = {},
): CanState {
  const lastKnown = options.lastKnownPhysicalCondition ?? null;
  const provenance = options.provenance ?? 'OBSERVED';

  switch (condition) {
    case 'AKTIF':
      return { lifecycleStatus: 'AKTIF', physicalCondition: 'BAIK', physicalConditionSource: provenance };
    case 'RUSAK':
      return { lifecycleStatus: 'AKTIF', physicalCondition: 'RUSAK', physicalConditionSource: provenance };
    case 'HILANG':
      return { lifecycleStatus: 'AKTIF', physicalCondition: 'HILANG', physicalConditionSource: provenance };
    case 'NON_AKTIF':
      return {
        lifecycleStatus: 'NON_AKTIF',
        physicalCondition: lastKnown ?? 'BAIK',
        physicalConditionSource: lastKnown ? provenance : LEGACY_BAIK_ASSUMPTION,
      };
    case 'DIKEMBALIKAN':
      return {
        lifecycleStatus: 'DIKEMBALIKAN',
        physicalCondition: lastKnown ?? 'BAIK',
        physicalConditionSource: lastKnown ? provenance : LEGACY_BAIK_ASSUMPTION,
      };
    default:
      return {
        lifecycleStatus: 'AKTIF',
        physicalCondition: 'BAIK',
        physicalConditionSource: LEGACY_BAIK_ASSUMPTION,
      };
  }
}

/** Proyeksi balik pasangan baru → legacy `condition` (lossy, kompatibilitas). */
export function deriveLegacyCondition(
  lifecycleStatus: CanLifecycleStatus,
  physicalCondition: CanPhysicalCondition,
): CanConditionValue {
  if (lifecycleStatus === 'AKTIF') {
    if (physicalCondition === 'BAIK') return 'AKTIF';
    return physicalCondition;
  }
  return lifecycleStatus;
}

/** `is_active` hanya menjawab "masih dilacak atau tidak". */
export function deriveIsActive(lifecycleStatus: CanLifecycleStatus): boolean {
  return lifecycleStatus !== 'DIKEMBALIKAN';
}

export function applyStatusChange(state: CanState, status: CanLifecycleStatus): CanState {
  return { ...state, lifecycleStatus: status };
}

export function applyPhysicalCondition(
  state: CanState,
  physicalCondition: CanPhysicalCondition,
  source: PhysicalConditionSource = 'OBSERVED',
): CanState {
  return { ...state, physicalCondition, physicalConditionSource: source };
}

/**
 * Penjemputan memperbarui kondisi fisik. Status lifecycle tidak berubah kecuali
 * pemanggil meminta pemulihan dari NON_AKTIF (jalur kunjungan ISI).
 */
export function stateAfterCollection(
  state: CanState,
  physicalCondition: CanPhysicalCondition,
  options: { restoreLifecycle?: boolean } = {},
): CanState {
  return {
    lifecycleStatus: options.restoreLifecycle ? 'AKTIF' : state.lifecycleStatus,
    physicalCondition,
    physicalConditionSource: 'OBSERVED',
  };
}

/**
 * Hasil kunjungan kaleng NON_AKTIF:
 * - ISI          → status AKTIF, kondisi fisik dipilih petugas;
 * - DIKEMBALIKAN → status DIKEMBALIKAN, kondisi fisik terakhir dipertahankan;
 * - KOSONG/TIDAK_DIKUNJUNGI → tetap NON_AKTIF, kondisi fisik dipertahankan.
 */
export function stateAfterVisitOutcome(
  state: CanState,
  outcome: 'ISI' | 'KOSONG' | 'DIKEMBALIKAN' | 'TIDAK_DIKUNJUNGI',
  physicalCondition?: CanPhysicalCondition,
): CanState {
  if (outcome === 'ISI') {
    if (!physicalCondition) {
      throw new Error('Kaleng isi wajib memilih kondisi fisik BAIK, RUSAK, atau HILANG');
    }
    return {
      lifecycleStatus: 'AKTIF',
      physicalCondition,
      physicalConditionSource: 'OBSERVED',
    };
  }
  if (outcome === 'DIKEMBALIKAN') {
    return { ...state, lifecycleStatus: 'DIKEMBALIKAN' };
  }
  return { ...state, lifecycleStatus: 'NON_AKTIF' };
}

/** Kunjungan penggantian unit menutup RUSAK/HILANG menjadi BAIK. */
export function stateAfterReplacement(state: CanState): CanState {
  if (state.physicalCondition === 'RUSAK' || state.physicalCondition === 'HILANG') {
    return {
      lifecycleStatus: 'AKTIF',
      physicalCondition: 'BAIK',
      physicalConditionSource: 'OBSERVED',
    };
  }
  return state;
}

export interface StateInput {
  condition?: CanConditionValue | null;
  lifecycleStatus?: CanLifecycleStatus | null;
  physicalCondition?: CanPhysicalCondition | null;
}

export type StateInputResult =
  | { ok: true; state: CanState }
  | { ok: false; code: 'VALIDATION_ERROR'; message: string };

/**
 * Resolusi request yang boleh membawa legacy `condition`, pasangan field baru,
 * atau keduanya. Aturan:
 * - fallback BAIK hanya untuk backfill, BUKAN perintah perubahan state;
 * - request campuran yang proyeksinya tidak sama ditolak VALIDATION_ERROR.
 */
export function resolveStateInput(input: StateInput, current: CanState): StateInputResult {
  if (input.lifecycleStatus != null && !isLifecycleStatus(input.lifecycleStatus)) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'lifecycle_status tidak valid' };
  }
  if (input.physicalCondition != null && !isPhysicalCondition(input.physicalCondition)) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'physical_condition tidak valid' };
  }
  if (input.condition != null && !isLegacyCondition(input.condition)) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'condition tidak valid' };
  }

  const hasNewFields = input.lifecycleStatus != null || input.physicalCondition != null;

  if (hasNewFields) {
    const state: CanState = {
      lifecycleStatus: input.lifecycleStatus ?? current.lifecycleStatus,
      physicalCondition: input.physicalCondition ?? current.physicalCondition,
      physicalConditionSource:
        input.physicalCondition != null ? 'OBSERVED' : current.physicalConditionSource,
    };

    if (input.condition != null) {
      const projected = deriveLegacyCondition(state.lifecycleStatus, state.physicalCondition);
      if (projected !== input.condition) {
        return {
          ok: false,
          code: 'VALIDATION_ERROR',
          message: `condition legacy (${input.condition}) bertentangan dengan pasangan lifecycle_status/physical_condition (proyeksi ${projected})`,
        };
      }
    }

    return { ok: true, state };
  }

  if (input.condition == null) {
    return { ok: true, state: current };
  }

  const condition = input.condition;
  if (condition === 'AKTIF' || condition === 'RUSAK' || condition === 'HILANG') {
    return {
      ok: true,
      state: {
        lifecycleStatus: 'AKTIF',
        physicalCondition: condition === 'AKTIF' ? 'BAIK' : condition,
        physicalConditionSource: 'OBSERVED',
      },
    };
  }
  if (condition === 'NON_AKTIF') {
    return { ok: true, state: { ...current, lifecycleStatus: 'NON_AKTIF' } };
  }
  return { ok: true, state: { ...current, lifecycleStatus: 'DIKEMBALIKAN' } };
}

/**
 * Replay patch per dimensi. Setiap patch hanya menyentuh field yang terisi —
 * event pindah ranting tidak boleh mengembalikan kondisi fisik lama.
 */
export function replayCanStatePatches(
  baseline: CanState,
  patches: CanStatePatch[],
  branchId: string | null = null,
): CanState & { branchId: string | null } {
  let state: CanState = { ...baseline };
  let currentBranchId = branchId;

  for (const patch of patches) {
    if (patch.lifecycleStatus !== undefined) {
      state = { ...state, lifecycleStatus: patch.lifecycleStatus };
    }
    if (patch.physicalCondition !== undefined) {
      state = {
        ...state,
        physicalCondition: patch.physicalCondition,
        physicalConditionSource: patch.physicalConditionSource ?? 'OBSERVED',
      };
    } else if (patch.physicalConditionSource !== undefined) {
      state = { ...state, physicalConditionSource: patch.physicalConditionSource };
    }
    if (patch.branchId !== undefined) {
      currentBranchId = patch.branchId;
    }
  }

  return { ...state, branchId: currentBranchId };
}

export interface CanStateRow {
  lifecycleStatus: CanLifecycleStatus;
  physicalCondition: CanPhysicalCondition;
  physicalConditionSource: PhysicalConditionSource;
  branchId: string;
}

/**
 * Bandingkan state sebelum/sesudah dan kembalikan patch minimal.
 * `null` berarti tidak ada dimensi berubah.
 */
export function diffCanState(
  before: CanStateRow,
  after: CanStateRow,
): CanStatePatch | null {
  const patch: CanStatePatch = {};
  if (before.lifecycleStatus !== after.lifecycleStatus) {
    patch.lifecycleStatus = after.lifecycleStatus;
  }
  if (before.physicalCondition !== after.physicalCondition) {
    patch.physicalCondition = after.physicalCondition;
    patch.physicalConditionSource = after.physicalConditionSource;
  }
  if (before.branchId !== after.branchId) {
    patch.branchId = after.branchId;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
