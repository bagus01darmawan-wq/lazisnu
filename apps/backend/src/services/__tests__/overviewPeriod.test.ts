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
  parseOverviewPeriod,
  periodRanges,
} from '../overviewService.js';

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
    const now = new Date();
    expect(parseOverviewPeriod(undefined, undefined)).toEqual({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      months: [now.getMonth() + 1],
    });
  });

  it('multi-bulan diurutkan, month = terbesar', () => {
    expect(parseOverviewPeriod('2026', '9,7,7')).toEqual({
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
});
