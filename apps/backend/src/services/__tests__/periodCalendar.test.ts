/**
 * C1-T1 — uji batas kalender periode (syarat wajib T1).
 * Premise: server berjalan di zona operasional (Asia/Jakarta); konstruktor
 * lokal di bawah konsisten dengan `buildPeriodBoundaries`, sehingga urutan
 * milidetik benar di TZ server apa pun. Kebenaran absolut = WIB dipastikan
 * saat deploy via `checkOperationalTimezone` (T12).
 */
import {
  buildPeriodBoundaries,
  resolvePeriodStatus,
  isPeriodLocked,
  periodKey,
  shiftPeriod,
  checkOperationalTimezone,
} from '../periodCalendar';

describe('C1-T1 buildPeriodBoundaries — September 2026', () => {
  const b = buildPeriodBoundaries(2026, 9);

  test('assign tgl 20 00:00:00.000', () => {
    expect(b.assignDate.getFullYear()).toBe(2026);
    expect(b.assignDate.getMonth()).toBe(8);
    expect(b.assignDate.getDate()).toBe(20);
    expect([b.assignDate.getHours(), b.assignDate.getMinutes(), b.assignDate.getSeconds(), b.assignDate.getMilliseconds()])
      .toEqual([0, 0, 0, 0]);
  });

  test('due tgl 27 23:59:59.999', () => {
    expect(b.dueDate.getMonth()).toBe(8);
    expect(b.dueDate.getDate()).toBe(27);
    expect([b.dueDate.getHours(), b.dueDate.getMinutes(), b.dueDate.getSeconds(), b.dueDate.getMilliseconds()])
      .toEqual([23, 59, 59, 999]);
  });

  test('tolerance_end tgl 9 Okt 23:59:59.999', () => {
    expect(b.toleranceEnd.getFullYear()).toBe(2026);
    expect(b.toleranceEnd.getMonth()).toBe(9);
    expect(b.toleranceEnd.getDate()).toBe(9);
    expect([b.toleranceEnd.getHours(), b.toleranceEnd.getMinutes(), b.toleranceEnd.getSeconds(), b.toleranceEnd.getMilliseconds()])
      .toEqual([23, 59, 59, 999]);
  });
});

describe('C1-T1 lintas tahun — Desember → Januari', () => {
  const b = buildPeriodBoundaries(2026, 12);

  test('tolerance_end jatuh 9 Jan 2027 (tahun berganti)', () => {
    expect(b.toleranceEnd.getFullYear()).toBe(2027);
    expect(b.toleranceEnd.getMonth()).toBe(0);
    expect(b.toleranceEnd.getDate()).toBe(9);
  });

  test('assign/due tetap di Desember 2026', () => {
    expect(b.assignDate.getMonth()).toBe(11);
    expect(b.assignDate.getDate()).toBe(20);
    expect(b.dueDate.getMonth()).toBe(11);
    expect(b.dueDate.getDate()).toBe(27);
  });

  test('9 Jan 23:59:59 masih toleransi, 10 Jan 00:00:00 sudah LOCKED', () => {
    expect(resolvePeriodStatus(new Date(2027, 0, 9, 23, 59, 59), b)).toBe('TOLERANCE');
    expect(resolvePeriodStatus(new Date(2027, 0, 10, 0, 0, 0), b)).toBe('LOCKED');
  });
});

describe('C1-T1 batas wajib — 9 Okt 23:59:59 vs 10 Okt 00:00', () => {
  const b = buildPeriodBoundaries(2026, 9);

  test('tepat 23:59:59 tgl 9 masih dalam toleransi', () => {
    const at = new Date(2026, 9, 9, 23, 59, 59);
    expect(isPeriodLocked(at, b.toleranceEnd)).toBe(false);
    expect(resolvePeriodStatus(at, b)).toBe('TOLERANCE');
  });

  test('tepat 00:00:00 tgl 10 sudah LOCKED', () => {
    const at = new Date(2026, 9, 10, 0, 0, 0);
    expect(isPeriodLocked(at, b.toleranceEnd)).toBe(true);
    expect(resolvePeriodStatus(at, b)).toBe('LOCKED');
  });

  test('1 ms sebelum vs 1 ms sesudah tolerance_end (independen TZ)', () => {
    const before = new Date(b.toleranceEnd.getTime() - 1);
    const after = new Date(b.toleranceEnd.getTime() + 1);
    expect(resolvePeriodStatus(before, b)).toBe('TOLERANCE');
    expect(resolvePeriodStatus(after, b)).toBe('LOCKED');
  });
});

describe('C1-T1 jendela status', () => {
  const b = buildPeriodBoundaries(2026, 9);

  test('20 Sep siang = OPEN; 27 Sep siang = OPEN', () => {
    expect(resolvePeriodStatus(new Date(2026, 8, 20, 12, 0, 0), b)).toBe('OPEN');
    expect(resolvePeriodStatus(new Date(2026, 8, 27, 12, 0, 0), b)).toBe('OPEN');
  });

  test('28 Sep = TOLERANCE (pelaporan); 5 Okt = TOLERANCE', () => {
    expect(resolvePeriodStatus(new Date(2026, 8, 28, 0, 0, 0), b)).toBe('TOLERANCE');
    expect(resolvePeriodStatus(new Date(2026, 9, 5, 12, 0, 0), b)).toBe('TOLERANCE');
  });

  test('sebelum tgl 20 (baris disiapkan robot) = OPEN', () => {
    expect(resolvePeriodStatus(new Date(2026, 8, 15, 0, 0, 0), b)).toBe('OPEN');
  });
});

describe('C1-T1 util & validasi', () => {
  test('periodKey + shiftPeriod', () => {
    expect(periodKey(2026, 9)).toBe('2026-09');
    expect(shiftPeriod(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftPeriod(2027, 1, -1)).toEqual({ year: 2026, month: 12 });
  });

  test('bulan/tahun invalid ditolak', () => {
    expect(() => buildPeriodBoundaries(2026, 0)).toThrow();
    expect(() => buildPeriodBoundaries(2026, 13)).toThrow();
    expect(() => buildPeriodBoundaries(2026, 1.5)).toThrow();
    expect(() => buildPeriodBoundaries(1999, 9)).toThrow();
  });

  test('checkOperationalTimezone: struktur hasil (tanpa asumsi TZ CI)', () => {
    const r = checkOperationalTimezone(new Date(2026, 8, 20));
    expect(r.expected).toBe('Asia/Jakarta');
    expect(typeof r.serverTimeZone).toBe('string');
    expect(typeof r.ok).toBe('boolean');
    expect(typeof r.offsetMinutes).toBe('number');
  });
});
