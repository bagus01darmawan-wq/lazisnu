/**
 * Tes helper tampilan overview (fungsi murni, tanpa render React).
 * Menjaga dua prinsip: pemformatan saja (tanpa kalkulasi definisi metrik) dan
 * label Indonesia yang tidak bergantung warna.
 */
import { describe, expect, it } from 'vitest';
import type { OverviewSummaryView } from '../overview/overviewView';
import {
  CONDITION_LABEL,
  averagePerFilledCan,
  filledCollectionCount,
  formatAveragePerFilledCan,
  formatCaseAge,
  formatMonthKey,
  formatPeriod,
  formatPeriodRange,
  formatRupiah,
  splitRupiah,
  taskClosedRate,
  taskProgressLabel,
  taskSupportLabel,
  trendTotals,
} from '../overview/format';

const summary = (overrides: Partial<OverviewSummaryView> = {}): OverviewSummaryView => ({
  placementCoverage: 100,
  activeCans: 80,
  inactiveCans: 15,
  damagedCans: 5,
  lostCans: 4,
  returnedThisMonth: 2,
  returnedTotal: 10,
  actionRequired: 24,
  totalOfficers: 6,
  collectionNominal: 1_250_000,
  successfulCollections: 40,
  reactivated: 3,
  taskActive: 12,
  taskClosed: 28,
  taskCompleted: 20,
  taskUncollected: 8,
  taskTotal: 40,
  ...overrides,
});

describe('formatRupiah', () => {
  it('memformat nominal dengan pemisah ribuan id-ID', () => {
    expect(formatRupiah(1250000)).toBe('Rp 1.250.000');
  });

  it('aman untuk undefined/null via Number coercion', () => {
    expect(formatRupiah(undefined as unknown as number)).toBe('Rp 0');
  });
});

describe('periode dan bulan', () => {
  it('formatPeriod memakai nama bulan Indonesia', () => {
    expect(formatPeriod(2026, 5)).toBe('Mei 2026');
  });

  it('formatMonthKey mengubah kunci YYYY-MM', () => {
    expect(formatMonthKey('2026-01')).toBe('Jan 2026');
    expect(formatMonthKey('2026-12')).toBe('Des 2026');
  });

  it('formatPeriodRange: tunggal, kontigu, tersebar, kosong', () => {
    expect(formatPeriodRange(2026, [9])).toBe('September 2026');
    expect(formatPeriodRange(2026, [9, 7, 8])).toBe('Juli–September 2026');
    expect(formatPeriodRange(2026, [1, 9])).toBe('2 bulan pilihan 2026');
    expect(formatPeriodRange(2026, [])).toBe('Tahun 2026');
  });

  it('rata-rata per kaleng berisi memakai jumlah isi, bukan semua penjemputan', () => {
    expect(averagePerFilledCan(1_000_000, filledCollectionCount(11, 1))).toBe(100_000);
    expect(averagePerFilledCan(1_000_000, 0)).toBe(0);
    expect(formatAveragePerFilledCan(1_250_000, 40)).toBe('Rp 31.250');
  });

  it('splitRupiah memisah mata uang dan angka', () => {
    expect(splitRupiah(1250000)).toEqual({ currency: 'Rp', amount: '1.250.000' });
    expect(splitRupiah(0)).toEqual({ currency: 'Rp', amount: '0' });
  });
});

describe('umur kasus', () => {
  it('kasus hari ini, hari, dan bulan', () => {
    const now = new Date('2026-09-15T00:00:00Z');
    expect(formatCaseAge('2026-09-15T00:00:00Z', now)).toBe('hari ini');
    expect(formatCaseAge('2026-09-12T00:00:00Z', now)).toBe('3 hari');
    expect(formatCaseAge('2026-07-01T00:00:00Z', now)).toBe('2 bulan');
  });
});

describe('ringkasan tugas', () => {
  it('label progres memakai bahasa manusia, bukan nama field', () => {
    expect(taskProgressLabel(summary())).toBe('28 dari 40 tugas sudah ditutup');
  });

  it('kalimat pendukung menyebut tugas belum ditutup dan ditutup tanpa penjemputan', () => {
    expect(taskSupportLabel(summary())).toBe('12 tugas belum ditutup • 8 ditutup tanpa penjemputan');
    expect(taskSupportLabel(summary({ taskActive: 0, taskUncollected: 0 }))).toBe(
      'Tidak ada tugas pada periode ini',
    );
  });

  it('persentase penutupan dibulatkan dan 0 bila tidak ada tugas', () => {
    expect(taskClosedRate(summary())).toBe(70);
    expect(taskClosedRate(summary({ taskTotal: 0, taskClosed: 0 }))).toBe(0);
  });
});

describe('tren', () => {
  it('memisahkan kaleng berisi dari jumlah penjemputan yang termasuk kaleng kosong', () => {
    const totals = trendTotals([
      { month: '2026-08', collected: 11, empty: 1, uncollected: 2, taskClosed: 13, taskTotal: 15, nominal: 500000 },
    ]);
    expect(totals.filled).toBe(10);
    expect(totals.empty).toBe(1);
    expect(totals.uncollected).toBe(2);
    expect(totals.nominal).toBe(500000);
  });
});

describe('label kondisi', () => {
  it('setiap kondisi punya teks (informasi tidak bergantung warna)', () => {
    expect(CONDITION_LABEL.AKTIF).toBe('Baik');
    expect(CONDITION_LABEL.NON_AKTIF).toBe('Nonaktif');
    expect(CONDITION_LABEL.RUSAK).toBe('Rusak');
    expect(CONDITION_LABEL.HILANG).toBe('Hilang');
    expect(CONDITION_LABEL.DIKEMBALIKAN).toBe('Dikembalikan');
  });
});