/**
 * C1-T2 — uji jendela collected_at + kunci periode (murni, tanpa DB).
 *
 * §14.3: collected_at ∈ [assign_date 00:00, tolerance_end 23:59] + skew ±10 mnt.
 * Kunci keras tgl 10 00:00 diuji lewat isPeriodLocked (sudah hijau di T1) dan
 * jalur validateAssignmentForSubmit pada periodLock.integration.test.ts.
 */
import { assertCollectedAtInWindow, CLOCK_SKEW_MINUTES } from '../collectionSubmission';
import { buildPeriodBoundaries } from '../periodCalendar';
import { ErrorCode } from '../../utils/errorCatalog';

describe('C1-T2 assertCollectedAtInWindow — Sept 2026', () => {
  const Y = 2026;
  const M = 9;
  const b = buildPeriodBoundaries(Y, M);

  test(`skew terkunci ${CLOCK_SKEW_MINUTES} menit`, () => {
    expect(CLOCK_SKEW_MINUTES).toBe(10);
  });

  test('jemput 25 Sep siang → lolos', () => {
    expect(() => assertCollectedAtInWindow(new Date(2026, 8, 25, 12, 0, 0), Y, M)).not.toThrow();
  });

  test('jemput 5 Okt (toleransi) → lolos, tercatat Sept', () => {
    expect(() => assertCollectedAtInWindow(new Date(2026, 9, 5, 12, 0, 0), Y, M)).not.toThrow();
  });

  test('jemput 9 Okt 23:59:59 → lolos (batas akhir)', () => {
    expect(() => assertCollectedAtInWindow(new Date(2026, 9, 9, 23, 59, 59), Y, M)).not.toThrow();
  });

  test('backdating 20 Agu untuk Sept → VALIDATION_ERROR', () => {
    try {
      assertCollectedAtInWindow(new Date(2026, 7, 20, 12, 0, 0), Y, M);
      throw new Error('seharusnya ditolak');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(err.isRetryable).toBe(false);
      expect(err.details?.reason).toBe('COLLECTED_AT_OUT_OF_WINDOW');
      expect(err.details?.period).toBe('2026-09');
    }
  });

  test('forward-dating 11 Okt untuk Sept → VALIDATION_ERROR', () => {
    try {
      assertCollectedAtInWindow(new Date(2026, 9, 11, 0, 0, 0), Y, M);
      throw new Error('seharusnya ditolak');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(err.details?.reason).toBe('COLLECTED_AT_OUT_OF_WINDOW');
    }
  });

  test('dalam skew: 19 Sep 23:55 (5 mnt sebelum assign) → lolos', () => {
    expect(() => assertCollectedAtInWindow(new Date(2026, 8, 19, 23, 55, 0), Y, M)).not.toThrow();
  });

  test('luar skew: 19 Sep 23:30 (30 mnt sebelum assign) → ditolak', () => {
    expect(() => assertCollectedAtInWindow(new Date(2026, 8, 19, 23, 30, 0), Y, M)).toThrow();
  });

  test('dalam skew: 10 Okt 00:05 (5 mnt sesudah tolerance_end) → lolos', () => {
    expect(() => assertCollectedAtInWindow(new Date(2026, 9, 10, 0, 5, 0), Y, M)).not.toThrow();
  });

  test('batas dihitung dari helper tunggal (konsisten dengan DB)', () => {
    expect(b.assignDate.getTime()).toBe(new Date(2026, 8, 20, 0, 0, 0, 0).getTime());
    expect(b.toleranceEnd.getTime()).toBe(new Date(2026, 9, 9, 23, 59, 59, 999).getTime());
  });
});
