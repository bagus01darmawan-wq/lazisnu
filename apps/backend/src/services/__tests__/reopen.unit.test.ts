/**
 * C1-T7 — unit murni: matematika jendela reopen + keketatan schema (tanpa DB).
 */
import { assertReopenWindowOpen } from '../collectionSubmission';
import { REOPEN_WINDOW_HOURS } from '../reopen';
import { reopenSubmissionSchema } from '../../routes/mobile/schemas';
import { reopenBranchSchema } from '../../routes/admin/schemas';

describe('C1-T7 jendela reopen 48 jam', () => {
  const T0 = new Date(2026, 9, 12, 10, 0, 0);
  const UNTIL = new Date(T0.getTime() + REOPEN_WINDOW_HOURS * 3_600_000);

  test('DRAFT normal (jendela NULL) selalu lolos', () => {
    expect(() => assertReopenWindowOpen({ reopenedUntil: null }, new Date(2026, 9, 20))).not.toThrow();
  });

  test('dalam jendela lolos; tepat di batas masih lolos (inklusif)', () => {
    expect(() => assertReopenWindowOpen({ reopenedUntil: UNTIL }, T0)).not.toThrow();
    expect(() => assertReopenWindowOpen({ reopenedUntil: UNTIL }, UNTIL)).not.toThrow();
  });

  test('lewat 1 detik → REOPEN_WINDOW_CLOSED', () => {
    const late = new Date(UNTIL.getTime() + 1000);
    try {
      assertReopenWindowOpen({ reopenedUntil: UNTIL }, late);
      throw new Error('seharusnya melempar');
    } catch (e: unknown) {
      expect(e).toMatchObject({ code: 'VALIDATION_ERROR', details: { reason: 'REOPEN_WINDOW_CLOSED' } });
    }
  });
});

describe('C1-T7 schema reopen ketat (.strict())', () => {
  test('alasan <10 ditolak; kunci asing ditolak', () => {
    expect(reopenSubmissionSchema.safeParse({ reason: 'kurang' }).success).toBe(false);
    expect(
      reopenSubmissionSchema.safeParse({ reason: 'koreksi nominal yang tertinggal', hacker: 1 }).success,
    ).toBe(false);
    expect(
      reopenBranchSchema.safeParse({ reason: 'tidak ada laporan susulan masuk', expected_version: 2 }).success,
    ).toBe(true);
  });
});
