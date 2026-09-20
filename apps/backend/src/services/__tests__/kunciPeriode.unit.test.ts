/**
 * C1-T6 — unit murni: gerbang fase kunci berlapis + keketatan schema co-sign (F4).
 * Tanpa DB/IO.
 */
import {
  buildPeriodBoundaries,
  resolveKunciPeriodePhase,
} from '../periodCalendar';
import { signSubmissionSchema } from '../../routes/mobile/schemas';
import { signBranchSchema } from '../../routes/admin/schemas';

describe('C1-T6 resolveKunciPeriodePhase — September 2026', () => {
  const b = buildPeriodBoundaries(2026, 9);
  // Batas: assign 20 Sep 00:00, due 27 Sep 23:59:59.999, toleransi 9 Okt 23:59:59.999.

  test('sebelum 27 00:00 → BELUM_SAATNYA', () => {
    expect(resolveKunciPeriodePhase(new Date(2026, 8, 26, 23, 59, 59), b)).toBe('BELUM_SAATNYA');
    expect(b.kunciPeriodeStart.getTime()).toBe(new Date(2026, 8, 27, 0, 0, 0, 0).getTime());
  });

  test('27 00:00 tepat → REKAP (aktif)', () => {
    expect(resolveKunciPeriodePhase(new Date(2026, 8, 27, 0, 0, 0, 0), b)).toBe('REKAP');
  });

  test('27–9 → REKAP (ekor OPEN + seluruh TOLERANCE)', () => {
    expect(resolveKunciPeriodePhase(new Date(2026, 8, 27, 12, 0, 0), b)).toBe('REKAP');
    expect(resolveKunciPeriodePhase(new Date(2026, 8, 28, 0, 0, 0), b)).toBe('REKAP');
    expect(resolveKunciPeriodePhase(new Date(2026, 9, 5, 12, 0, 0), b)).toBe('REKAP');
    expect(resolveKunciPeriodePhase(new Date(2026, 9, 9, 23, 59, 59, 999), b)).toBe('REKAP');
  });

  test('10 00:00 → KUNCI_KERAS (batas toleransi, Des→Jan aman)', () => {
    expect(resolveKunciPeriodePhase(new Date(2026, 9, 10, 0, 0, 0, 0), b)).toBe('KUNCI_KERAS');
    const dec = buildPeriodBoundaries(2026, 12);
    expect(resolveKunciPeriodePhase(new Date(2027, 0, 9, 23, 59, 59, 999), dec)).toBe('REKAP');
    expect(resolveKunciPeriodePhase(new Date(2027, 0, 10, 0, 0, 0), dec)).toBe('KUNCI_KERAS');
  });
});

describe('C1-T6 F4 — body ber-signer_id harus 400 (.strict())', () => {
  test('sign PPK menolak ppk_signer_id di body', () => {
    const r = signSubmissionSchema.safeParse({
      signature_png: 'x'.repeat(100),
      consent: true,
      ppk_signer_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(r.success).toBe(false);
  });

  test('sign ranting menolak ranting_signer_id di body', () => {
    const r = signBranchSchema.safeParse({
      signature_png: 'x'.repeat(100),
      consent: true,
      share_mwc: 0,
      ranting_signer_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(r.success).toBe(false);
  });
});
