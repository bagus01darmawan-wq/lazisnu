/**
 * Tes helper tampilan overview (fungsi murni, tanpa render React).
 * Menjaga dua prinsip: pemformatan saja (tanpa kalkulasi definisi metrik) dan
 * label Indonesia yang tidak bergantung warna.
 */
import { describe, expect, it } from 'vitest';
import type { OverviewSummary } from '@lazisnu/shared-types';
import {
  CONDITION_LABEL,
  formatCaseAge,
  formatMonthKey,
  formatPeriod,
  formatRupiah,
  taskClosedRate,
  taskProgressLabel,
  taskSupportLabel,
  trendTotals,
} from '../overview/format';

const summary = (overrides: Partial<OverviewSummary> = {}): OverviewSummary => ({
  placement_coverage: 100,
  active_cans: 80,
  inactive_cans: 15,
  damaged_cans: 5,
  lost_cans: 4,
  returned_this_month: 2,
  returned_total: 10,
  action_required: 24,
  total_officers: 6,
  collection_nominal: 1_250_000,
  successful_collections: 40,
  task_active: 12,
  task_closed: 28,
  task_completed: 20,
  task_uncollected: 8,
  task_total: 40,
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
    expect(taskSupportLabel(summary({ task_active: 0, task_uncollected: 0 }))).toBe(
      'Tidak ada tugas pada periode ini',
    );
  });

  it('persentase penutupan dibulatkan dan 0 bila tidak ada tugas', () => {
    expect(taskClosedRate(summary())).toBe(70);
    expect(taskClosedRate(summary({ task_total: 0, task_closed: 0 }))).toBe(0);
  });
});

describe('tren', () => {
  it('menjumlahkan isi, kosong, tidak terjemput, dan nominal', () => {
    const totals = trendTotals([
      { month: '2026-08', collected: 30, empty: 10, uncollected: 2, task_closed: 32, task_total: 40, nominal: 500000 },
      { month: '2026-09', collected: 20, empty: 5, uncollected: 1, task_closed: 21, task_total: 40, nominal: 300000 },
    ]);
    expect(totals.collected).toBe(50);
    expect(totals.empty).toBe(15);
    expect(totals.uncollected).toBe(3);
    expect(totals.nominal).toBe(800000);
  });
});

describe('label kondisi', () => {
  it('setiap kondisi punya teks (informasi tidak bergantung warna)', () => {
    expect(CONDITION_LABEL.AKTIF).toBe('Aktif');
    expect(CONDITION_LABEL.NON_AKTIF).toBe('Nonaktif');
    expect(CONDITION_LABEL.RUSAK).toBe('Rusak');
    expect(CONDITION_LABEL.HILANG).toBe('Hilang');
    expect(CONDITION_LABEL.DIKEMBALIKAN).toBe('Dikembalikan');
  });
});