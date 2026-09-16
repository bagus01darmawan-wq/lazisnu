/**
 * Helper tampilan overview — fungsi murni tanpa React agar dapat diuji langsung
 * (lihat components/__tests__/overview-format.test.ts).
 *
 * Semua angka berasal dari server (OverviewResponse). TIDAK ada perhitungan definisi
 * metrik di sini: yang boleh hanya pemformatan.
 */
import type { CanCondition, OverviewMonthlyTrendItem, OverviewSummary } from '@lazisnu/shared-types';

export const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/** Label kondisi dalam bahasa Indonesia (bukan nilai bisnis). */
export const CONDITION_LABEL: Record<CanCondition, string> = {
  AKTIF: 'Aktif',
  NON_AKTIF: 'Nonaktif',
  RUSAK: 'Rusak',
  HILANG: 'Hilang',
  DIKEMBALIKAN: 'Dikembalikan',
};

/**
 * Kelas badge per kondisi. Setiap kondisi SELALU disertai label teks di komponen,
 * warna hanya penguat — informasi tidak boleh bergantung pada warna saja.
 */
export const CONDITION_BADGE_CLASS: Record<CanCondition, string> = {
  AKTIF: 'bg-[#1F8243]/15 text-[#1F8243] border-[#1F8243]/30',
  NON_AKTIF: 'bg-[#F4F1EA]/10 text-[#F4F1EA]/70 border-[#F4F1EA]/20',
  RUSAK: 'bg-[#DE6F4A]/15 text-[#DE6F4A] border-[#DE6F4A]/30',
  HILANG: 'bg-[#D97A76]/15 text-[#D97A76] border-[#D97A76]/30',
  DIKEMBALIKAN: 'bg-[#6B9E9F]/15 text-[#6B9E9F] border-[#6B9E9F]/30',
};

export function formatRupiah(value: number): string {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

export function formatPeriod(year: number, month: number): string {
  const name = MONTH_NAMES_ID[month - 1] ?? String(month);
  return `${name} ${year}`;
}

/** '2026-05' → 'Mei 2026' */
export function formatMonthKey(key: string): string {
  const [year, month] = key.split('-');
  const name = MONTH_NAMES_ID[Number(month) - 1] ?? key;
  return `${name.slice(0, 3)} ${year}`;
}

export function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/** Umur kasus dalam kalimat pendek: 'hari ini', '3 hari', '2 bulan'. */
export function formatCaseAge(since: string, now: Date = new Date()): string {
  const start = new Date(since);
  if (Number.isNaN(start.getTime())) return '-';
  const days = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86_400_000));
  if (days === 0) return 'hari ini';
  if (days < 31) return `${days} hari`;
  const months = Math.floor(days / 30);
  return `${months} bulan`;
}

/** Ringkasan tugas: '12 dari 40 tugas sudah ditutup'. */
export function taskProgressLabel(summary: OverviewSummary): string {
  return `${summary.task_closed} dari ${summary.task_total} tugas sudah ditutup`;
}

/** Kalimat pendukung kartu tugas — memakai bahasa manusia, bukan nama field. */
export function taskSupportLabel(summary: OverviewSummary): string {
  const parts: string[] = [];
  if (summary.task_active > 0) parts.push(`${summary.task_active} tugas belum ditutup`);
  if (summary.task_uncollected > 0) parts.push(`${summary.task_uncollected} ditutup tanpa penjemputan`);
  return parts.length > 0 ? parts.join(' • ') : 'Tidak ada tugas pada periode ini';
}

/** Persentase penutupan tugas, dibulatkan; 0 bila tidak ada tugas. */
export function taskClosedRate(summary: OverviewSummary): number {
  if (!summary.task_total) return 0;
  return Math.round((summary.task_closed / summary.task_total) * 100);
}

/** Total penjemputan pada tren (isi + kosong) untuk label seri. */
export function trendTotals(trend: OverviewMonthlyTrendItem[]) {
  return trend.reduce(
    (acc, item) => ({
      collected: acc.collected + item.collected,
      empty: acc.empty + item.empty,
      uncollected: acc.uncollected + item.uncollected,
      nominal: acc.nominal + item.nominal,
    }),
    { collected: 0, empty: 0, uncollected: 0, nominal: 0 },
  );
}