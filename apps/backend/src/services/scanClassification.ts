/**
 * C1-T2 — Klasifikasi hasil scan QR lintas periode (FUNGSI MURNI, tanpa DB).
 *
 * Sumber: dokumen induk §5 + §14.2/§14.4 (lookup toleran + 3 kode baru).
 * Route `GET /mobile/scan/:qrCode` mengambil SEMUA assignment milik petugas
 * untuk kaleng itu (miliknya saja — bukan tugas orang lain tidak tersentuh,
 * sehingga tidak ada bocor `owner_*`), lalu fungsi ini memutuskan:
 *
 * Direvisi 2026-11-03: kunci periode berbasis tanggal DIHAPUS — periode maju
 * karena rantai aksi, bukan jam. Klasifikasi kini:
 * 1. HIT ........................ ACTIVE pada periode berjalan atau lampau.
 * 2. ALREADY_COLLECTED .......... COMPLETED terbaru (dipindai ulang).
 * 3. WRONG_PERIOD ................ assignment ACTIVE masa depan.
 * 4. NOT_ASSIGNED ................ bukan tugasnya / sudah tidak bisa ditindak.
 */
import { periodKey } from './periodCalendar';
import { currentOperationalPeriod } from '../utils/operationalTimeZone';

export interface ScanAssignmentRow {
  id: string;
  status: string;
  kind?: string;
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

  const cur = currentOperationalPeriod(now);
  const sorted = [...rows].sort(byPeriodDesc);

  // 1. HIT — ACTIVE pada periode berjalan atau lampau. Tidak ada lagi gerbang
  // tanggal: tugas periode lama tetap bisa dijemput (hanya jadi "terlambat"
  // di laporan). Assignment masa depan tetap bukan tugas periode berjalan.
  const activeInWindow = sorted.filter((r) => {
    if (r.status !== 'ACTIVE') return false;
    return !(r.periodYear > cur.year || (r.periodYear === cur.year && r.periodMonth > cur.month));
  });
  if (activeInWindow.length > 0) {
    const hit =
      activeInWindow.find((r) => r.periodYear === cur.year && r.periodMonth === cur.month) ??
      activeInWindow[0];
    const tolerance = !(hit.periodYear === cur.year && hit.periodMonth === cur.month);
    return { kind: 'HIT', assignment: hit, tolerance, period: rowPeriod(hit) };
  }

  // 2. Sudah dijemput — COMPLETED terbaru, berapa pun umur periodenya.
  const collected = sorted.find((r) => r.status === 'COMPLETED');
  if (collected) return { kind: 'ALREADY_COLLECTED', period: rowPeriod(collected) };

  // 3. Periode lain — ACTIVE miliknya di masa depan (belum bisa ditindak).
  const otherActive = sorted.find((r) => r.status === 'ACTIVE');
  if (otherActive) return { kind: 'WRONG_PERIOD', period: rowPeriod(otherActive) };

  // 4. Sisa (hanya UNCOLLECTED/REASSIGNED): tidak bisa ditindak.
  return { kind: 'NOT_ASSIGNED' };
}
