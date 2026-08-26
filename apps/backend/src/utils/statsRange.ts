/**
 * Utilitas rentang tanggal untuk statistik (endpoint /mobile/tasks/stats-range).
 * Murni tanpa side-effect — mudah diuji terpisah dari Fastify/DB.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Rentang maksimal yang diizinkan: 1 tahun (366 hari mengantisipasi tahun kabisat). */
export const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

export interface ParsedStatsRange {
  ok: boolean;
  error?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Verifikasi string tanggal benar-benar ada di kalender.
 * new Date('2026-02-30T00:00:00') diam-diam digulung ke 2 Mar oleh engine JS,
 * jadi cukup cek isNaN saja tidak — harus round-trip per komponen.
 */
function isValidDateString(s: string): boolean {
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    return false;
  }
  const [y, m, day] = s.split('-').map(Number);
  return d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === day;
}

/**
 * Validasi & parsing parameter rentang tanggal.
 * Format wajib YYYY-MM-DD, start <= end, dan span maksimal MAX_RANGE_MS.
 */
export function parseStatsRange(start?: string, end?: string): ParsedStatsRange {
  if (!start || !end || !DATE_RE.test(start) || !DATE_RE.test(end)) {
    return {ok: false, error: 'Parameter start & end wajib diisi dengan format YYYY-MM-DD'};
  }

  if (!isValidDateString(start) || !isValidDateString(end)) {
    return {ok: false, error: 'Tanggal tidak valid'};
  }

  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T23:59:59.999`);
  if (startDate > endDate) {
    return {ok: false, error: 'Tanggal mulai melebihi tanggal akhir'};
  }
  if (endDate.getTime() - startDate.getTime() > MAX_RANGE_MS) {
    return {ok: false, error: 'Rentang maksimal 1 tahun'};
  }

  return {ok: true, startDate, endDate};
}

/**
 * Daftar periode "YYYY-MM" yang tersentuh rentang [start..end] inklusif,
 * berdasarkan awal bulan tanggal mulai sampai bulan tanggal akhir.
 */
export function computeMonthsCovered(start: Date, end: Date): string[] {
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}
