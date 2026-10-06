/**
 * C1-T3 — uji murni logika draft (tanpa DB): eskalasi 24 jam, komparator
 * baris kalender (syarat review-T2 butir b), gerbang scope, jenis event T11.
 */
import {
  ESCALATION_HOURS,
  approvalEventKind,
  assertDraftAccess,
  isEscalated,
  periodCalendarRowMatches,
  type DraftActor,
} from '../periodDrafts';
import { buildPeriodBoundaries } from '../periodCalendar';
import { ErrorCode } from '../../utils/errorCatalog';

describe('C1-T3 isEscalated — 24 jam', () => {
  test(`konstanta ${ESCALATION_HOURS} jam`, () => {
    expect(ESCALATION_HOURS).toBe(24);
  });

  const prepared = new Date(2026, 9, 10, 0, 0, 0);

  test('23:59:59 sesudah siapkan → belum eskalasi', () => {
    expect(isEscalated(prepared, new Date(2026, 9, 10, 23, 59, 59))).toBe(false);
  });

  test('tepat 24 jam → eskalasi', () => {
    expect(isEscalated(prepared, new Date(prepared.getTime() + 24 * 3_600_000))).toBe(true);
  });

  test('25 jam → eskalasi', () => {
    expect(isEscalated(prepared, new Date(2026, 9, 11, 1, 0, 0))).toBe(true);
  });
});

describe('C1-T3 periodCalendarRowMatches — smoke T12', () => {
  test('output helper identik dengan dirinya → true', () => {
    const b = buildPeriodBoundaries(2026, 10);
    expect(periodCalendarRowMatches(b, 2026, 10)).toBe(true);
  });

  test('meleset 1 ms → false', () => {
    const b = buildPeriodBoundaries(2026, 10);
    const off = { ...b, toleranceEnd: new Date(b.toleranceEnd.getTime() + 1) };
    expect(periodCalendarRowMatches(off, 2026, 10)).toBe(false);
  });

  test('periode beda → false', () => {
    const b = buildPeriodBoundaries(2026, 10);
    expect(periodCalendarRowMatches(b, 2026, 9)).toBe(false);
  });

  test('Des → Jan rollover ikut dibandingkan', () => {
    const b = buildPeriodBoundaries(2026, 12);
    expect(b.toleranceEnd.getFullYear()).toBe(2027);
    expect(periodCalendarRowMatches(b, 2026, 12)).toBe(true);
  });
});

describe('C1-T3 approvalEventKind — persiapan T11', () => {
  test('APPROVED → APPROVED', () => {
    expect(
      approvalEventKind({ status: 'APPROVED', preparedAt: new Date(2026, 9, 10) }, new Date(2026, 9, 20)),
    ).toBe('APPROVED');
  });

  test('DRAFT segar → PENDING', () => {
    expect(
      approvalEventKind({ status: 'DRAFT', preparedAt: new Date(2026, 9, 10, 0, 0, 0) }, new Date(2026, 9, 10, 12, 0, 0)),
    ).toBe('PENDING');
  });

  test('DRAFT 25 jam → ESCALATED', () => {
    expect(
      approvalEventKind({ status: 'DRAFT', preparedAt: new Date(2026, 9, 10, 0, 0, 0) }, new Date(2026, 9, 11, 1, 0, 0)),
    ).toBe('ESCALATED');
  });
});

describe('C1-T3 assertDraftAccess — matriks scope (§14.13)', () => {
  const rantingDraft = { branchId: 'br-r', districtId: 'dt', branchKind: 'RANTING' as const };
  const programDraft = { branchId: 'br-taqwa', districtId: 'dt', branchKind: 'PROGRAM_MWC' as const };

  const stafR: DraftActor = { userId: 'u1', role: 'STAF_PENGUMPULAN', branchId: 'br-r', districtId: 'dt' };
  const stafMwc: DraftActor = { userId: 'u2', role: 'STAF_PENGUMPULAN', branchId: null, districtId: 'dt' };
  const keuR: DraftActor = { userId: 'u3', role: 'STAF_KEUANGAN', branchId: 'br-r', districtId: 'dt' };

  test('pengumpulan ranting → draft rantingnya lolos', () => {
    expect(() => assertDraftAccess(stafR, rantingDraft)).not.toThrow();
  });

  test('pengumpulan ranting → draft ranting lain ditolak', () => {
    try {
      assertDraftAccess(stafR, { ...rantingDraft, branchId: 'br-lain' });
      throw new Error('seharusnya ditolak');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.FORBIDDEN_SCOPE);
    }
  });

  test('pengumpulan MWC → draft program lolos, draft ranting ditolak', () => {
    expect(() => assertDraftAccess(stafMwc, programDraft)).not.toThrow();
    try {
      assertDraftAccess(stafMwc, rantingDraft);
      throw new Error('seharusnya ditolak');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.FORBIDDEN_SCOPE);
    }
  });

  test('keuangan ranting → draft rantingnya lolos (timing eskalasi dicek saat approve)', () => {
    expect(() => assertDraftAccess(keuR, rantingDraft)).not.toThrow();
  });

  test('PETUGAS / admin → ditolak (bukan pengelola draft)', () => {
    for (const role of ['PETUGAS', 'ADMIN_RANTING', 'ADMIN_KECAMATAN']) {
      try {
        assertDraftAccess({ userId: 'x', role, branchId: 'br-r', districtId: 'dt' }, rantingDraft);
        throw new Error(`seharusnya ditolak untuk ${role}`);
      } catch (err: any) {
        expect(err.code).toBe(ErrorCode.FORBIDDEN);
      }
    }
  });

  test('staf tanpa scope → 403', () => {
    try {
      assertDraftAccess({ userId: 'x', role: 'STAF_PENGUMPULAN', branchId: null, districtId: null }, rantingDraft);
      throw new Error('seharusnya ditolak');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.FORBIDDEN_SCOPE);
    }
  });
});
