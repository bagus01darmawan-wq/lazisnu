/**
 * C1-T1 — Kalender periode tetap (sumber kebenaran tanggal).
 *
 * Aturan main (dari dokumen induk, kini di-track di
 * `docs/implementation/C1-RENCANA-SIKLUS-PERIODE-APPROVE-BERITA-ACARA-2026-09-19.md`
 * §2.1 + tinjauan B-2, dan syarat `C1-SYARAT-LANJUTAN-REVIEW-T0-2026-09-20.md`):
 * - assign_date   = tgl 20 bulan berjalan, 00:00:00
 * - due_date      = tgl 27 bulan berjalan, 23:59:59 (akhir hari)
 * - tolerance_end = tgl 9 bulan BERIKUTNYA, 23:59:59 (Des → Jan tahun+1)
 * - Status waktu: OPEN (s/d due) → TOLERANCE (s/d tolerance_end) → LOCKED (> tolerance_end).
 *   `DIBUKA_SEBAGIAN` hanya ditulis logika reopen T7, tidak pernah diturunkan dari jam.
 *
 * KEBIJAKAN ZONA (wajib dibaca sebelum menyentuh file ini):
 * Kolom `period_calendar` bertipe `timestamp` TANPA timezone, dan server WAJIB
 * berjalan di zona operasional (`OPERATIONAL_TIMEZONE`, default Asia/Jakarta) —
 * lihat `utils/operationalTimeZone.ts`. Karena itu konstruksi tanggal HANYA BOLEH
 * ada di `buildPeriodBoundaries` ini (satu helper tunggal). Dilarang menyebar
 * `new Date(y, m, ...)` asumsi-zona di file lain — preseden bug: server VM UTC,
 * `monthStart` dari `new Date()` (dashboard.ts:30, district.ts:194-195).
 * Verifikasi TZ container/VM dilakukan saat deploy (T12) via `checkOperationalTimezone`.
 */
import { OPERATIONAL_TIMEZONE, operationalOffsetMinutes } from '../utils/operationalTimeZone';

export type PeriodStatusValue = 'OPEN' | 'TOLERANCE' | 'LOCKED' | 'DIBUKA_SEBAGIAN';

export interface PeriodBoundaries {
  periodYear: number;
  periodMonth: number;
  /** Tgl 20 00:00:00.000 waktu server (= WIB bila premise TZ dipenuhi). */
  assignDate: Date;
  /** Tgl 27 23:59:59.999 waktu server. */
  dueDate: Date;
  /** Tgl 9 bulan berikut 23:59:59.999 waktu server. */
  toleranceEnd: Date;
}

/** Batas validasi input — cerminan `generateTasksSchema` di routes/scheduler.ts. */
const MIN_YEAR = 2020;
const MAX_YEAR = 2100;

/** Kunci "YYYY-MM" untuk satu periode (mis. untuk `linked_periods`). */
export function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Geser periode N bulan (menangani ganti tahun Des↔Jan). */
export function shiftPeriod(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function assertValidPeriod(year: number, month: number): void {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Periode tidak valid: year=${year}, month=${month} (month 1-12, bilangan bulat)`);
  }
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new Error(`Periode tidak valid: year=${year} di luar ${MIN_YEAR}-${MAX_YEAR}`);
  }
}

/**
 * SATU-SATUNYA tempat membangun batas tanggal periode. Semua kode lain
 * (scan, dashboard, scheduler, submission) wajib memanggil helper ini —
 * jangan mengkonstruksi `new Date(y, m, ...)` sendiri.
 */
export function buildPeriodBoundaries(year: number, month: number): PeriodBoundaries {
  assertValidPeriod(year, month);
  // Konstruktor lokal = wall-clock server; benar = WIB selama premise TZ dipenuhi.
  const assignDate = new Date(year, month - 1, 20, 0, 0, 0, 0);
  const dueDate = new Date(year, month - 1, 27, 23, 59, 59, 999);
  // Bulan berikut via konstruktor (otomatis rollover Des → Jan tahun+1).
  const toleranceEnd = new Date(year, month, 9, 23, 59, 59, 999);
  return { periodYear: year, periodMonth: month, assignDate, dueDate, toleranceEnd };
}

/**
 * Status periode pada satu titik waktu (perbandingan milidetik murni,
 * independen terhadap TZ server — asal batas & titik waktu dibangun konsisten).
 * - now > toleranceEnd → LOCKED (tgl 10 00:00:00.000 ke atas)
 * - now > dueDate      → TOLERANCE (28 bln berjalan s/d tgl 9 23:59:59.999)
 * - selain itu         → OPEN (termasuk sebelum tgl 20: baris sudah disiapkan robot)
 */
export function resolvePeriodStatus(now: Date, b: PeriodBoundaries): PeriodStatusValue {
  const t = now.getTime();
  if (t > b.toleranceEnd.getTime()) return 'LOCKED';
  if (t > b.dueDate.getTime()) return 'TOLERANCE';
  return 'OPEN';
}

/** True bila periode sudah dikunci pada titik waktu `now` (pemicu: kunci sistem tgl 10 00:00). */
export function isPeriodLocked(now: Date, toleranceEnd: Date): boolean {
  return now.getTime() > toleranceEnd.getTime();
}

/**
 * Cek deploy T12 (murni, tidak throw — aman di CI ber-TZ apa pun):
 * apakah zona server == zona operasional? Dipakai pipeline/runbook verifikasi,
 * bukan logika bisnis.
 */
export function checkOperationalTimezone(at: Date = new Date()): {
  ok: boolean;
  expected: string;
  serverTimeZone: string;
  offsetMinutes: number;
} {
  const expected = OPERATIONAL_TIMEZONE;
  let serverTimeZone = 'unknown';
  try {
    serverTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'unknown';
  } catch {
    serverTimeZone = 'unknown';
  }
  const offsetMinutes = operationalOffsetMinutes(at);
  return { ok: serverTimeZone === expected, expected, serverTimeZone, offsetMinutes };
}
