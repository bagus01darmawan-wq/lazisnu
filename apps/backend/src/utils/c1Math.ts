/**
 * C1-T0 — Rumus uang terkunci (§8 + revisi B-3 20 Sep 2026).
 *
 * Bahasa sederhana:
 * - `ceil1000`: bulatkan KE ATAS ke ribuan (86.750 → 87.000). Bukan ke bawah.
 * - `calcBisyaroh`: 10% dari total, lalu ceil_1000. Contoh: 867.500 → 87.000.
 * - `calcExpectedShare`: 30% × (total − bisyaroh). Contoh Pan. Barat:
 *   5.600.700 − bisyaroh → sisa × 30% = ekspektasi (vs aktual 1.675.000).
 * - `calcShareVariance`: aktual − ekspektasi. Bila |selisih| > 10.000 wajib alasan.
 *
 * Semua nominal dalam rupiah bulat (number). DB menyimpan bigint — konversi
 * BigInt↔number dilakukan di service saat baca/tulis (T4/T8), bukan di sini.
 */

export const BISYAROH_PCT = 10;
export const SHARE_PCT = 30;
export const SHARE_TOLERANCE = 10_000;

/** Bulatkan ke atas ke kelipatan 1.000. */
export function ceil1000(n: number): number {
  return Math.ceil(n / 1000) * 1000;
}

/** Bisyaroh = 10% × total, ceil_1000. */
export function calcBisyaroh(total: number): number {
  return ceil1000((total * BISYAROH_PCT) / 100);
}

/** Ekspektasi share MWC = 30% × (total − bisyaroh). */
export function calcExpectedShare(total: number, bisyaroh: number): number {
  return Math.round(((total - bisyaroh) * SHARE_PCT) / 100);
}

/** Selisih = aktual − ekspektasi (negatif = kurang bayar). */
export function calcShareVariance(aktual: number, ekspektasi: number): number {
  return aktual - ekspektasi;
}

/** True bila selisih butuh alasan wajib (|selisih| > Rp 10.000). */
export function needsVarianceReason(variance: number): boolean {
  return Math.abs(variance) > SHARE_TOLERANCE;
}
