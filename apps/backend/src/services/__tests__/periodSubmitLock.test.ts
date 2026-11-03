/**
 * C1-T2 (direvisi 2026-11-03) — jendela `collected_at` kini PENANDA, bukan
 * gerbang. Tanggal di luar [assign 20, toleransi tgl 9] tetap diterima dan
 * hanya menghasilkan `late: true` untuk badge UI. Atribusi uang tetap memakai
 * periode assignment, bukan bulan `collected_at`.
 */
import { assertCollectedAtInWindow, CLOCK_SKEW_MINUTES } from '../collectionSubmission';
import { buildPeriodBoundaries } from '../periodCalendar';
import { ErrorCode } from '../../utils/errorCatalog';

describe('C1-T2 collectWindowStatus — Sept 2026', () => {
  const Y = 2026;
  const M = 9;
  const b = buildPeriodBoundaries(Y, M);

  test(`skew terkunci ${CLOCK_SKEW_MINUTES} menit`, () => {
    expect(CLOCK_SKEW_MINUTES).toBe(10);
  });

  test('jemput 25 Sep siang → tidak terlambat', () => {
    expect(assertCollectedAtInWindow(new Date(2026, 8, 25, 12, 0, 0), Y, M).late).toBe(false);
  });

  test('jemput 5 Okt (toleransi) → tidak terlambat, tercatat Sept', () => {
    const s = assertCollectedAtInWindow(new Date(2026, 9, 5, 12, 0, 0), Y, M);
    expect(s.late).toBe(false);
    expect(s.period).toBe('2026-09');
  });

  test('jemput 9 Okt 23:59:59 → tidak terlambat (batas akhir)', () => {
    expect(assertCollectedAtInWindow(new Date(2026, 9, 9, 23, 59, 59), Y, M).late).toBe(false);
  });

  test('backdating 20 Agu untuk Sept → late, TIDAK ditolak', () => {
    const s = assertCollectedAtInWindow(new Date(2026, 7, 20, 12, 0, 0), Y, M);
    expect(s.late).toBe(true);
    expect(s.period).toBe('2026-09');
  });

  test('forward-dating 11 Okt untuk Sept → late, TIDAK ditolak', () => {
    expect(assertCollectedAtInWindow(new Date(2026, 9, 11, 0, 0, 0), Y, M).late).toBe(true);
  });

  test('dalam skew: 19 Sep 23:55 (5 mnt sebelum assign) → tidak terlambat', () => {
    expect(assertCollectedAtInWindow(new Date(2026, 8, 19, 23, 55, 0), Y, M).late).toBe(false);
  });

  test('luar skew: 19 Sep 23:30 (30 mnt sebelum assign) → late, TIDAK ditolak', () => {
    expect(assertCollectedAtInWindow(new Date(2026, 8, 19, 23, 30, 0), Y, M).late).toBe(true);
  });

  test('dalam skew: 10 Okt 00:05 (5 mnt sesudah tolerance_end) → tidak terlambat', () => {
    expect(assertCollectedAtInWindow(new Date(2026, 9, 10, 0, 5, 0), Y, M).late).toBe(false);
  });

  test('collected_at tidak valid tetap ditolak (input rusak, bukan gerbang)', () => {
    try {
      assertCollectedAtInWindow(new Date('bukan-tanggal'), Y, M);
      throw new Error('seharusnya ditolak');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(err.details?.reason).toBe('COLLECTED_AT_INVALID');
    }
  });

  test('batas dihitung dari helper tunggal (konsisten dengan DB)', () => {
    expect(b.assignDate.getTime()).toBe(new Date(2026, 8, 20, 0, 0, 0, 0).getTime());
    expect(b.toleranceEnd.getTime()).toBe(new Date(2026, 9, 9, 23, 59, 59, 999).getTime());
  });
});
