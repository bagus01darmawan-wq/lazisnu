/**
 * C1-T2 — Klasifikasi hasil scan QR lintas periode (FUNGSI MURNI, tanpa DB).
 *
 * Sumber: dokumen induk §5 + §14.2/§14.4 (lookup toleran + 3 kode baru).
 * Route `GET /mobile/scan/:qrCode` mengambil SEMUA assignment milik petugas
 * untuk kaleng itu (miliknya saja — bukan tugas orang lain tidak tersentuh,
 * sehingga tidak ada bocor `owner_*`), lalu fungsi ini memutuskan:
 *
 * 1. HIT ........................ ACTIVE + masih dalam jendela
 *    (`now <= toleranceEnd` periode itu; toleransi = periode bulan lalu).
 *    Kasus jemput awal §6 (mis. 12 Okt untuk periode Okt) lolos di sini.
 * 2. ALREADY_COLLECTED .......... COMPLETED pada periode berjalan / toleransi
 *    (dipindai ulang setelah dijemput).
 * 3. PERIOD_CLOSED .............. assignment ACTIVE periode BULAN LALU yang
 *    baru saja dikunci → pesan mengarahkan ke periode berjalan
 *    ("Sept sudah dikunci, pakai tugas Okt", §14.4).
 * 4. WRONG_PERIOD ................ assignment ACTIVE miliknya pada periode lain
 *    (lebih lama / masa depan) — bukan tugas periode ini.
 * 5. NOT_ASSIGNED ................ bukan tugasnya sama sekali (tanpa owner_*).
 */
import {
  buildPeriodBoundaries,
  isPeriodLocked,
  periodKey,
  shiftPeriod,
} from './periodCalendar';

export interface ScanAssignmentRow {
  id: string;
  status: string;
  periodYear: number;
  periodMonth: number;
  assignedAt: Date;
}

export type ScanClassification =
  | { kind: 'HIT'; assignment: ScanAssignmentRow; tolerance: boolean; period: string }
  | { kind: 'ALREADY_COLLECTED'; period: string }
  | { kind: 'PERIOD_CLOSED'; period: string; nextPeriod: string }
  | { kind: 'WRONG_PERIOD'; period: string }
  | { kind: 'NOT_ASSIGNED' };

function rowPeriod(row: ScanAssignmentRow): string {
  return periodKey(row.periodYear, row.periodMonth);
}

function byPeriodDesc(a: ScanAssignmentRow, b: ScanAssignmentRow): number {
  return b.periodYear - a.periodYear || b.periodMonth - a.periodMonth;
}

/** Pesan siap tampil (periode disematkan agar kasat mata di HP). */
export function scanClosedMessage(period: string, nextPeriod: string): string {
  return `Periode ${period} sudah dikunci, pakai tugas ${nextPeriod}.`;
}

export function scanWrongPeriodMessage(period: string): string {
  return `Kaleng ini tugas Anda pada periode ${period} — di luar periode berjalan.`;
}

export function scanAlreadyCollectedMessage(period: string): string {
  return `Kaleng ini sudah dijemput pada periode ${period}.`;
}

export function classifyScan(rows: ScanAssignmentRow[], now: Date = new Date()): ScanClassification {
  if (rows.length === 0) return { kind: 'NOT_ASSIGNED' };

  const cur = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const prev = shiftPeriod(cur.year, cur.month, -1);
  const sorted = [...rows].sort(byPeriodDesc);

  // 1. HIT — ACTIVE dalam jendela (berjalan dulu, lalu toleransi bulan lalu).
  // Guard C1-T3 (syarat review-T2 butir a): HIT hanya sah untuk period <=
  // periode berjalan. Assignment ACTIVE masa depan (mis. Nov dipindai Okt)
  // jatuh ke WRONG_PERIOD di bawah — robot T3 memang tidak pernah melahirkan
  // assignment sebelum bulannya berjalan (hanya draft), dan approve menolak
  // draft masa depan. Nuansa §6: assignment Okt yang lahir 10 Okt (< assign
  // tgl 20) tetap sah karena Okt <= Okt berjalan (jemput awal).
  const activeInWindow = sorted.filter((r) => {
    if (r.status !== 'ACTIVE') return false;
    if (r.periodYear > cur.year || (r.periodYear === cur.year && r.periodMonth > cur.month)) return false;
    const b = buildPeriodBoundaries(r.periodYear, r.periodMonth);
    return !isPeriodLocked(now, b.toleranceEnd);
  });
  if (activeInWindow.length > 0) {
    const hit =
      activeInWindow.find((r) => r.periodYear === cur.year && r.periodMonth === cur.month) ??
      activeInWindow[0];
    const tolerance = !(hit.periodYear === cur.year && hit.periodMonth === cur.month);
    return { kind: 'HIT', assignment: hit, tolerance, period: rowPeriod(hit) };
  }

  // 2. Sudah dijemput — COMPLETED pada periode berjalan / toleransi bulan lalu.
  const collected = sorted.find((r) => {
    if (r.status !== 'COMPLETED') return false;
    const isCur = r.periodYear === cur.year && r.periodMonth === cur.month;
    const isPrev = r.periodYear === prev.year && r.periodMonth === prev.month;
    if (!isCur && !isPrev) return false;
    const b = buildPeriodBoundaries(r.periodYear, r.periodMonth);
    return !isPeriodLocked(now, b.toleranceEnd);
  });
  if (collected) return { kind: 'ALREADY_COLLECTED', period: rowPeriod(collected) };

  // 3. Baru dikunci — ACTIVE periode bulan lalu (kasus §14.4).
  const justLocked = sorted.find(
    (r) => r.status === 'ACTIVE' && r.periodYear === prev.year && r.periodMonth === prev.month,
  );
  if (justLocked) {
    const period = rowPeriod(justLocked);
    const next = shiftPeriod(justLocked.periodYear, justLocked.periodMonth, 1);
    return { kind: 'PERIOD_CLOSED', period, nextPeriod: periodKey(next.year, next.month) };
  }

  // 4. Periode lain — ACTIVE miliknya di luar jangkauan (lama / masa depan).
  const otherActive = sorted.find((r) => r.status === 'ACTIVE');
  if (otherActive) return { kind: 'WRONG_PERIOD', period: rowPeriod(otherActive) };

  // 5. Sisa (hanya UNCOLLECTED/REASSIGNED/COMPLETED lama): tidak bisa ditindak.
  return { kind: 'NOT_ASSIGNED' };
}
