/**
 * Unit test periode multi-bulan overview (filter PeriodPicker).
 *
 * Fungsi yang diuji murni (tanpa DB): parseOverviewPeriod,
 * normalizePeriodMonths, effectiveMonths, periodRanges. Kompatibilitas
 * pemanggil lama: tanpa `months` = bulan tunggal `month`.
 */
import {
  effectiveMonths,
  normalizePeriodMonths,
  overviewSnapshotCutoff,
  parseOverviewPeriod,
  periodRanges,
} from '../overviewService.js';
import { currentOperationalPeriod } from '../../utils/operationalTimeZone';

describe('normalizePeriodMonths', () => {
  it('membuang di luar 1-12, dedup, dan mengurutkan', () => {
    expect(normalizePeriodMonths([9, 7, 7, 13, 0, -1])).toEqual([7, 9]);
  });

  it('non-array dan kosong menghasilkan []', () => {
    expect(normalizePeriodMonths(undefined)).toEqual([]);
    expect(normalizePeriodMonths('9')).toEqual([]);
    expect(normalizePeriodMonths([])).toEqual([]);
  });
});

describe('effectiveMonths', () => {
  it('tanpa months memakai month tunggal (kompatibel lama)', () => {
    expect(effectiveMonths({ year: 2026, month: 5 })).toEqual([5]);
  });

  it('months menimpa month tunggal', () => {
    expect(effectiveMonths({ year: 2026, month: 5, months: [7, 8, 9] })).toEqual([7, 8, 9]);
  });
});

describe('periodRanges', () => {
  it('satu bulan = satu rentang [awal, akhir)', () => {
    const [r] = periodRanges(2026, [9]);
    expect(r.start).toEqual(new Date(2026, 8, 1));
    expect(r.end).toEqual(new Date(2026, 9, 1));
  });

  it('multi-bulan diskrit (bukan min-max)', () => {
    const ranges = periodRanges(2026, [7, 9]);
    expect(ranges).toHaveLength(2);
    expect(ranges[0].start).toEqual(new Date(2026, 6, 1));
    expect(ranges[1].start).toEqual(new Date(2026, 8, 1));
  });
});

describe('parseOverviewPeriod', () => {
  it('tanpa param = bulan berjalan (perilaku lama)', () => {
    const current = currentOperationalPeriod();
    expect(parseOverviewPeriod(undefined, undefined)).toEqual({
      year: current.year,
      month: current.month,
      months: [current.month],
    });
  });

  it('multi-bulan diurutkan, month = terbesar', () => {
    expect(parseOverviewPeriod('2026', '9,7,7', new Date('2026-11-14T00:00:00Z'))).toEqual({
      year: 2026,
      month: 9,
      months: [7, 9],
    });
  });

  it('menolak year dan months invalid', () => {
    expect(parseOverviewPeriod('1999', '9')).toBeNull();
    expect(parseOverviewPeriod('abcd', '9')).toBeNull();
    expect(parseOverviewPeriod('2026', '13')).toBeNull();
    expect(parseOverviewPeriod('2026', '0')).toBeNull();
    expect(parseOverviewPeriod('2026', '1,2,3,4,5,6,7,8,9,10,11,12,12')).toBeNull();
  });

  it('menolak tahun/bulan masa depan secara eksplisit', () => {
    const now = new Date('2026-11-14T03:00:00Z');
    expect(parseOverviewPeriod('2027', '1', now)).toBeNull();
    expect(parseOverviewPeriod('2026', '12', now)).toBeNull();
    // Daftar multi-bulan yang salah satunya masa depan juga ditolak.
    expect(parseOverviewPeriod('2026', '10,12', now)).toBeNull();
    // Bulan berjalan tetap diizinkan (cutoff now).
    expect(parseOverviewPeriod('2026', '11', now)).toEqual({
      year: 2026,
      month: 11,
      months: [11],
    });
  });
});

describe('overviewSnapshotCutoff', () => {
  it('bulan berjalan memakai now inklusif', () => {
    const now = new Date('2026-11-14T03:00:00Z');
    expect(overviewSnapshotCutoff({ year: 2026, month: 11, months: [11] }, now)).toEqual({
      at: now,
      inclusive: true,
    });
  });

  it('bulan historis memakai awal bulan berikutnya, setengah terbuka', () => {
    const cutoff = overviewSnapshotCutoff(
      { year: 2026, month: 10, months: [10] },
      new Date('2026-11-14T03:00:00Z'),
    );
    expect(cutoff.inclusive).toBe(false);
    expect(cutoff.at).toEqual(new Date(2026, 10, 1, 0, 0, 0, 0));
  });

  it('multi-bulan memakai bulan terpilih paling akhir, bukan penjumlahan', () => {
    const cutoff = overviewSnapshotCutoff(
      { year: 2026, month: 1, months: [7, 9] },
      new Date('2026-11-14T03:00:00Z'),
    );
    expect(cutoff.at).toEqual(new Date(2026, 9, 1, 0, 0, 0, 0));
  });

  it('Desember bergulir ke Januari tahun berikutnya', () => {
    const cutoff = overviewSnapshotCutoff(
      { year: 2026, month: 12, months: [12] },
      new Date('2027-01-10T03:00:00Z'),
    );
    expect(cutoff.at).toEqual(new Date(2027, 0, 1, 0, 0, 0, 0));
  });

  it('menolak periode masa depan secara eksplisit', () => {
    expect(() => overviewSnapshotCutoff(
      { year: 2026, month: 12, months: [12] },
      new Date('2026-11-14T03:00:00Z'),
    )).toThrow(/masa depan/i);
  });
});
