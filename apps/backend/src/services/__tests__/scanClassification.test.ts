/**
 * C1-T2 — uji klasifikasi scan lintas periode (fungsi murni, tanpa DB).
 *
 * Skenario inti dari dokumen induk §12: scan Sept pada 5 Okt lolos toleransi,
 * scan Sept pada 10 Okt → QR_PERIOD_CLOSED; + kasus B1 (periode lain,
 * sudah dijemput, bukan tugas).
 */
import { classifyScan, scanClosedMessage } from '../scanClassification';
import type { ScanAssignmentRow } from '../scanClassification';

const row = (periodYear: number, periodMonth: number, status: string, id = `${periodYear}-${periodMonth}`): ScanAssignmentRow => ({
  id,
  status,
  periodYear,
  periodMonth,
  assignedAt: new Date(periodYear, periodMonth - 1, 20, 0, 0, 0),
});

describe('C1-T2 classifyScan — HIT', () => {
  test('ACTIVE periode berjalan → HIT tanpa toleransi', () => {
    const r = classifyScan([row(2026, 9, 'ACTIVE')], new Date(2026, 8, 25, 12, 0, 0));
    expect(r).toMatchObject({ kind: 'HIT', tolerance: false, period: '2026-09' });
  });

  test('uji §12.1: scan Sept pada 5 Okt → HIT toleransi Sept', () => {
    const r = classifyScan([row(2026, 9, 'ACTIVE')], new Date(2026, 9, 5, 12, 0, 0));
    expect(r).toMatchObject({ kind: 'HIT', tolerance: true, period: '2026-09' });
  });

  test('kasus §6: jemput awal 12 Okt untuk periode Okt → HIT', () => {
    const r = classifyScan([row(2026, 10, 'ACTIVE')], new Date(2026, 9, 12, 10, 0, 0));
    expect(r).toMatchObject({ kind: 'HIT', tolerance: false, period: '2026-10' });
  });

  test('dua ACTIVE (Sept+Okt) pada 5 Okt → pilih Sept toleransi? tidak: pilih berjalan bila ada', () => {
    // 5 Okt: Sept dalam toleransi, Okt belum di-generate (di dunia nyata).
    // Bila keduanya ada, periode berjalan (kalender) diprioritaskan.
    const r = classifyScan(
      [row(2026, 9, 'ACTIVE', 'sept'), row(2026, 10, 'ACTIVE', 'okt')],
      new Date(2026, 9, 5, 12, 0, 0),
    );
    expect(r).toMatchObject({ kind: 'HIT', period: '2026-10', tolerance: false });
  });
});

describe('C1-T2 classifyScan — penolakan', () => {
  test('uji §12.2: scan Sept pada 10 Okt → PERIOD_CLOSED + arahan Okt', () => {
    const r = classifyScan([row(2026, 9, 'ACTIVE')], new Date(2026, 9, 10, 0, 0, 0));
    expect(r).toEqual({ kind: 'PERIOD_CLOSED', period: '2026-09', nextPeriod: '2026-10' });
    expect(scanClosedMessage('2026-09', '2026-10')).toContain('2026-10');
  });

  test('lintas tahun: Des dikunci 10 Jan → PERIOD_CLOSED + arahan Jan', () => {
    const r = classifyScan([row(2026, 12, 'ACTIVE')], new Date(2027, 0, 10, 0, 0, 1));
    expect(r).toEqual({ kind: 'PERIOD_CLOSED', period: '2026-12', nextPeriod: '2027-01' });
  });

  test('kasus B1: ACTIVE Juli dipindai Sept → WRONG_PERIOD (bukan CLOSED)', () => {
    const r = classifyScan([row(2026, 7, 'ACTIVE')], new Date(2026, 8, 15, 12, 0, 0));
    expect(r).toEqual({ kind: 'WRONG_PERIOD', period: '2026-07' });
  });

  test('sudah dijemput periode berjalan → ALREADY_COLLECTED', () => {
    const r = classifyScan([row(2026, 9, 'COMPLETED')], new Date(2026, 8, 25, 12, 0, 0));
    expect(r).toEqual({ kind: 'ALREADY_COLLECTED', period: '2026-09' });
  });

  test('sudah dijemput dalam toleransi (Okt, assignment Sept COMPLETED) → ALREADY_COLLECTED', () => {
    const r = classifyScan([row(2026, 9, 'COMPLETED')], new Date(2026, 9, 5, 12, 0, 0));
    expect(r).toEqual({ kind: 'ALREADY_COLLECTED', period: '2026-09' });
  });

  test('bukan tugas sama sekali → NOT_ASSIGNED', () => {
    expect(classifyScan([], new Date(2026, 8, 25))).toEqual({ kind: 'NOT_ASSIGNED' });
  });

  test('hanya UNCOLLECTED periode berjalan → NOT_ASSIGNED (tak bisa ditindak)', () => {
    const r = classifyScan([row(2026, 9, 'UNCOLLECTED')], new Date(2026, 8, 25, 12, 0, 0));
    expect(r).toEqual({ kind: 'NOT_ASSIGNED' });
  });

  test('COMPLETED lama (Juli) dipindai Sept → NOT_ASSIGNED (bukan CLOSED/WARN salah)', () => {
    // Juli COMPLETED = sudah beres; tak ada arahan relevan → jangan tuduh terkunci.
    const r = classifyScan([row(2026, 7, 'COMPLETED')], new Date(2026, 8, 15, 12, 0, 0));
    expect(r).toEqual({ kind: 'NOT_ASSIGNED' });
  });
});

describe('C1-T3 guard HIT masa depan (syarat review-T2 butir a)', () => {
  test('ACTIVE Nov dipindai Okt → WRONG_PERIOD (bukan HIT)', () => {
    const r = classifyScan([row(2026, 11, 'ACTIVE')], new Date(2026, 9, 15, 12, 0, 0));
    expect(r).toEqual({ kind: 'WRONG_PERIOD', period: '2026-11' });
  });

  test('Okt + Nov aktif dipindai Okt → HIT Okt (masa depan diabaikan)', () => {
    const r = classifyScan(
      [row(2026, 11, 'ACTIVE', 'nov'), row(2026, 10, 'ACTIVE', 'okt')],
      new Date(2026, 9, 15, 12, 0, 0),
    );
    expect(r).toMatchObject({ kind: 'HIT', period: '2026-10', tolerance: false });
  });

  test('hanya Nov aktif (Okt COMPLETED) → ALREADY_COLLECTED Okt, bukan HIT Nov', () => {
    const r = classifyScan(
      [row(2026, 11, 'ACTIVE', 'nov'), row(2026, 10, 'COMPLETED', 'okt')],
      new Date(2026, 9, 15, 12, 0, 0),
    );
    expect(r).toEqual({ kind: 'ALREADY_COLLECTED', period: '2026-10' });
  });
});
