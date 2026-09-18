/**
 * Aturan kondisi kaleng — dipusatkan di satu tempat agar perilaku tidak tersebar
 * di banyak query dan tidak berbeda antara generator tugas, overview, dan aksi admin.
 *
 * Modul ini SENGAJA tidak menyentuh database sehingga seluruh aturan transisi dapat
 * diuji tanpa Postgres (lihat services/__tests__/conditionRules.test.ts).
 *
 * Rujukan keputusan: docs/audit/rancangan-skema-status-kaleng-2026-09-12.md
 * dan docs/audit/rencana-implementasi-overview-kaleng/.
 */
import type { SkipReasonCode, CanVisitPurpose } from '@lazisnu/shared-types';

/**
 * Kondisi kaleng pada sisi backend sebagai literal union — sengaja TIDAK memakai enum
 * dari @lazisnu/shared-types agar backend tidak bergantung pada impor runtime paket itu.
 * Nilai stringnya identik dengan enum CanCondition pada kontrak API.
 */
export type CanConditionValue = 'AKTIF' | 'NON_AKTIF' | 'RUSAK' | 'HILANG' | 'DIKEMBALIKAN';

/** Kondisi yang masuk cakupan penempatan. HILANG punya cakupan sendiri. */
export const PLACEMENT_CONDITIONS: CanConditionValue[] = ['AKTIF', 'NON_AKTIF', 'RUSAK'];

/** Kondisi yang boleh menerima tugas penjemputan bulanan. */
export const ASSIGNABLE_CONDITIONS: CanConditionValue[] = ['AKTIF', 'RUSAK', 'HILANG'];

/** Kondisi yang menunggu keputusan admin ("perlu tindakan"). */
export const ACTION_REQUIRED_CONDITIONS: CanConditionValue[] = ['NON_AKTIF', 'RUSAK', 'HILANG'];

/** Ambang penjemputan kosong berturut-turut sebelum sistem mengusulkan NON_AKTIF. */
export const EMPTY_STREAK_THRESHOLD = 6;

/** Label kondisi untuk UI (bahasa Indonesia, bukan nilai bisnis). */
export const CONDITION_LABELS: Record<CanConditionValue, string> = {
  AKTIF: 'Aktif',
  NON_AKTIF: 'Nonaktif',
  RUSAK: 'Rusak',
  HILANG: 'Hilang',
  DIKEMBALIKAN: 'Dikembalikan',
};

/** Tindakan yang harus dilakukan admin per kondisi yang perlu tindakan. */
export const ACTION_LABELS: Record<CanConditionValue, string> = {
  AKTIF: '',
  NON_AKTIF: 'Kunjungi untuk verifikasi',
  RUSAK: 'Ganti unit kaleng',
  HILANG: 'Beri kaleng baru',
  DIKEMBALIKAN: '',
};

/** Label kode alasan tidak terjemput (untuk UI mobile/web). */
export const SKIP_REASON_LABELS: Record<SkipReasonCode, string> = {
  OWNER_ABSENT: 'Pemilik tidak di tempat',
  OWNER_REFUSED: 'Pemilik menolak dijemput',
  CAN_LOST: 'Kaleng hilang',
  CAN_DAMAGED: 'Kaleng rusak',
  ACCESS_DIFFICULT: 'Akses ke lokasi sulit',
  OTHER: 'Lainnya',
};

/** Kode alasan tidak terjemput yang wajib diikuti usulan perubahan kondisi. */
export const SKIP_REASON_PROPOSALS: Partial<Record<SkipReasonCode, CanConditionValue>> = {
  CAN_LOST: 'HILANG',
  CAN_DAMAGED: 'RUSAK',
};

/** Kode alasan tidak terjemput (dipakai validasi payload mobile). */
export const SKIP_REASON_CODES: SkipReasonCode[] = [
  'OWNER_ABSENT',
  'OWNER_REFUSED',
  'CAN_LOST',
  'CAN_DAMAGED',
  'ACCESS_DIFFICULT',
  'OTHER',
];

/**
 * Seluruh kode alasan baku lintas peristiwa (tidak terjemput, nonaktif, dikembalikan)
 * + `EMPTY_STREAK` untuk usulan otomatis dari ambang kosong.
 * Dipakai untuk validasi payload agar tidak ada kode bebas yang tersimpan.
 */
export const ALL_REASON_CODES: string[] = [
  ...SKIP_REASON_CODES,
  'MOVED_HOUSE',
  'OWNER_UNABLE',
  'OWNER_REFUSED_CONTINUE',
  'OWNER_REQUEST',
  'CAN_INACTIVE',
  'EMPTY_STREAK',
];

export function isPlacementCondition(condition: CanConditionValue): boolean {
  return PLACEMENT_CONDITIONS.includes(condition);
}

export function isAssignableCondition(condition: CanConditionValue): boolean {
  return ASSIGNABLE_CONDITIONS.includes(condition);
}

export function requiresAction(condition: CanConditionValue): boolean {
  return ACTION_REQUIRED_CONDITIONS.includes(condition);
}

/**
 * `is_active` hanya menjawab "masih dilacak atau tidak".
 * Semua kondisi kecuali DIKEMBALIKAN masih dilacak.
 */
export function isTrackedForCondition(condition: CanConditionValue): boolean {
  return condition !== 'DIKEMBALIKAN';
}

export function conditionLabel(condition: CanConditionValue): string {
  return CONDITION_LABELS[condition] ?? condition;
}

export function actionLabel(condition: CanConditionValue): string {
  return ACTION_LABELS[condition] ?? '';
}

export function skipReasonLabel(code: string): string {
  return (SKIP_REASON_LABELS as Record<string, string>)[code] ?? code;
}

/**
 * Hitung penjemputan kosong berturut-turut dari riwayat.
 *
 * Aturan (keputusan 3 & 24):
 * - hanya penjemputan yang benar-benar terjadi (nominal 0 tetap penjemputan);
 * - `UNCOLLECTED` dan kunjungan TIDAK dihitung — karena itu pemanggil hanya boleh
 *   mengirimkan baris `collections` dengan sync_status COMPLETED versi terbaru;
 * - hitungan direset setiap ada penjemputan berisi nominal.
 *
 * @param nominalsNewestFirst nominal penjemputan terbaru → terlama
 */
export function countTrailingEmptyCollections(nominalsNewestFirst: number[]): number {
  let streak = 0;
  for (const nominal of nominalsNewestFirst) {
    if (Number(nominal) > 0) break;
    streak += 1;
  }
  return streak;
}

/**
 * Apakah kondisi ini perlu diusulkan menjadi NON_AKTIF?
 * Hanya berlaku untuk kondisi yang masih dijemput (AKTIF, RUSAK, HILANG).
 */
export function shouldProposeInactive(
  condition: CanConditionValue,
  emptyStreak: number,
  threshold: number = EMPTY_STREAK_THRESHOLD,
): boolean {
  if (!isAssignableCondition(condition)) return false;
  return emptyStreak >= threshold;
}

/**
 * Kaleng NON_AKTIF yang kembali berisi nominal positif harus otomatis kembali AKTIF
 * (keputusan 24). Hitungan kosong tidak disimpan, jadi tidak ada yang perlu direset.
 */
export function shouldRestoreActive(condition: CanConditionValue, latestNominal: number): boolean {
  return condition === 'NON_AKTIF' && Number(latestNominal) > 0;
}

/**
 * Transisi yang diizinkan. Menjaga agar aksi admin (dan service usulan) tidak
 * menciptakan kombinasi `is_active = false` dengan `condition != DIKEMBALIKAN`.
 */
export const ALLOWED_TRANSITIONS: Record<CanConditionValue, CanConditionValue[]> = {
  AKTIF: ['NON_AKTIF', 'RUSAK', 'HILANG', 'DIKEMBALIKAN'],
  NON_AKTIF: ['AKTIF', 'RUSAK', 'HILANG', 'DIKEMBALIKAN'],
  RUSAK: ['AKTIF', 'NON_AKTIF', 'HILANG', 'DIKEMBALIKAN'],
  HILANG: ['AKTIF', 'NON_AKTIF', 'RUSAK', 'DIKEMBALIKAN'],
  // DIKEMBALIKAN hanya bisa kembali bila ada pemasangan unit baru (transisi eksplisit ke AKTIF).
  DIKEMBALIKAN: ['AKTIF'],
};

export function isTransitionAllowed(from: CanConditionValue, to: CanConditionValue): boolean {
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Tentukan kondisi tujuan dari kode alasan tidak terjemput.
 * CAN_LOST → HILANG, CAN_DAMAGED → RUSAK; kode lain tidak mengusulkan apa pun.
 */
export function proposalForSkipReason(reasonCode: string): CanConditionValue | null {
  return SKIP_REASON_PROPOSALS[reasonCode as SkipReasonCode] ?? null;
}

/** Kunjungan PENGGANTIAN menutup kasus RUSAK/HILANG. */
export function conditionAfterReplacementVisit(current: CanConditionValue): CanConditionValue | null {
  if (current === 'RUSAK' || current === 'HILANG') return 'AKTIF';
  return null;
}

export function isValidVisitPurpose(purpose: string): purpose is CanVisitPurpose {
  return purpose === 'VERIFIKASI' || purpose === 'PENGGANTIAN' || purpose === 'PENCABUTAN';
}