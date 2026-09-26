import { syncCollectionsBatch } from '../mobileSyncService';
import { AppError } from '../../utils/AppError';
import { db } from '../../config/database';
import { submitCollection, validateAssignmentForSubmit } from '../collectionSubmission';

jest.mock('../../config/database', () => ({
  db: {
    query: {
      collections: {
        findFirst: jest.fn(),
      },
      cans: { findFirst: jest.fn() },
      officers: { findFirst: jest.fn() },
    },
    transaction: jest.fn(),
  },
}));

jest.mock('../collectionSubmission', () => ({
  validateAssignmentForSubmit: jest.fn(),
  submitCollection: jest.fn(),
  // C1-T2: mobileSyncService kini memanggil assertCollectedAtInWindow.
  assertCollectedAtInWindow: jest.fn(),
}));

const { assertCollectedAtInWindow } = jest.requireMock('../collectionSubmission') as {
  assertCollectedAtInWindow: jest.Mock;
};

jest.mock('../conditionProposalService', () => ({
  evaluateEmptyStreakForCan: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../auditLogService', () => ({
  insertActivityLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../whatsapp', () => ({
  sendWhatsAppNotification: jest.fn(),
}));

describe('mobileSyncService syncCollectionsBatch', () => {
  const officerId = 'officer-123';
  const validItem = {
    offline_id: 'loc-1',
    assignment_id: '00000000-0000-0000-0000-000000000001',
    can_id: '00000000-0000-0000-0000-000000000002',
    nominal: 50000,
    condition: 'AKTIF' as const,
    collected_at: '2026-05-17T10:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('berhasil memproses item baru yang belum pernah disinkronisasi', async () => {
    (db.query.collections.findFirst as jest.Mock).mockResolvedValue(null);
    (db.transaction as jest.Mock).mockImplementation(async (cb) => cb());
    (validateAssignmentForSubmit as jest.Mock).mockResolvedValue({ periodYear: 2026, periodMonth: 5 });
    (submitCollection as jest.Mock).mockResolvedValue({ id: 'srv-1' });

    const result = await syncCollectionsBatch([validItem], officerId, 'user-123');

    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results[0]).toEqual({
      offline_id: 'loc-1',
      server_id: 'srv-1',
      status: 'COMPLETED',
    });
  });

  it('memakai assignment kunjungan on-demand untuk visit_outcome ISI', async () => {
    const visitAssignment = {
      id: 'visit-assignment-1',
      periodYear: 2026,
      periodMonth: 9,
    };
    const tx = {
      query: {
        cans: {
          findFirst: jest.fn().mockResolvedValue({
            id: validItem.can_id,
            branchId: 'branch-1',
            condition: 'NON_AKTIF',
          }),
        },
        officers: {
          findFirst: jest.fn().mockResolvedValue({ branchId: 'branch-1' }),
        },
        assignments: {
          findFirst: jest.fn().mockResolvedValue(visitAssignment),
        },
      },
      insert: jest.fn(() => ({
        values: jest.fn().mockResolvedValue(undefined),
      })),
    };

    (db.query.collections.findFirst as jest.Mock).mockResolvedValue(null);
    (db.query.cans.findFirst as jest.Mock).mockResolvedValue(null);
    (db.query.officers.findFirst as jest.Mock).mockResolvedValue(null);
    (db.transaction as jest.Mock).mockImplementation(async (cb) => cb(tx));
    (validateAssignmentForSubmit as jest.Mock).mockResolvedValue({
      periodYear: 2026,
      periodMonth: 9,
    });
    (submitCollection as jest.Mock).mockResolvedValue({ id: 'srv-visit-1' });

    const result = await syncCollectionsBatch(
      [{ ...validItem, assignment_id: 'ordinary-assignment-1', visit_outcome: 'ISI' }],
      officerId,
      'user-123',
    );

    expect(result.succeeded).toBe(1);
    expect(validateAssignmentForSubmit).toHaveBeenCalledWith(
      tx,
      'visit-assignment-1',
      validItem.can_id,
      officerId,
    );
    expect(submitCollection).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        assignmentId: 'visit-assignment-1',
        visitOutcome: 'ISI',
      }),
    );
  });

  it('mengembalian status ALREADY_SYNCED jika offline_id sudah ada di DB', async () => {
    (db.query.collections.findFirst as jest.Mock).mockResolvedValue({ id: 'srv-1' });

    const result = await syncCollectionsBatch([validItem], officerId, 'user-123');

    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results[0]).toEqual({
      offline_id: 'loc-1',
      server_id: 'srv-1',
      status: 'ALREADY_SYNCED',
    });
  });

  it('mengklasifikasikan validation error (isRetryable = false) sebagai FAILED + can_retry = false', async () => {
    (db.query.collections.findFirst as jest.Mock).mockResolvedValue(null);
    (db.transaction as jest.Mock).mockImplementation(async (cb) => {
      throw new AppError('QR_INVALID', 'Kaleng tidak valid', 400, false);
    });

    const result = await syncCollectionsBatch([validItem], officerId, 'user-123');

    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toEqual({
      offline_id: 'loc-1',
      status: 'FAILED',
      error: 'Kaleng tidak valid',
      error_code: 'QR_INVALID',
      error_type: 'VALIDATION',
      can_retry: false,
    });
  });

  it('mengklasifikasikan server error (isRetryable = true) sebagai FAILED + can_retry = true', async () => {
    (db.query.collections.findFirst as jest.Mock).mockResolvedValue(null);
    (db.transaction as jest.Mock).mockImplementation(async (cb) => {
      throw new AppError('INTERNAL_ERROR', 'Koneksi database terputus', 500, true);
    });

    const result = await syncCollectionsBatch([validItem], officerId, 'user-123');

    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toEqual({
      offline_id: 'loc-1',
      status: 'FAILED',
      error: 'Koneksi database terputus',
      error_code: 'INTERNAL_ERROR',
      error_type: 'SERVER',
      can_retry: true,
    });
  });

  it('C1-T2: collected_at di luar jendela → FAILED VALIDATION can_retry=false (tidak spam)', async () => {
    // Pakai implementasi asli penegak jendela; assignment Mei, klaim 20 Agu.
    const real = jest.requireActual('../collectionSubmission') as typeof import('../collectionSubmission');
    assertCollectedAtInWindow.mockImplementationOnce(real.assertCollectedAtInWindow);
    (validateAssignmentForSubmit as jest.Mock).mockResolvedValue({ periodYear: 2026, periodMonth: 5 });
    (db.query.collections.findFirst as jest.Mock).mockResolvedValue(null);
    (db.transaction as jest.Mock).mockImplementation(async (cb) => cb());

    const result = await syncCollectionsBatch(
      [{ ...validItem, collected_at: '2026-08-20T12:00:00.000Z' }],
      officerId,
      'user-123',
    );

    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toMatchObject({
      offline_id: 'loc-1',
      status: 'FAILED',
      error_code: 'VALIDATION_ERROR',
      error_type: 'VALIDATION',
      can_retry: false,
    });
    // Audit COLLECTED_AT_REJECTED tidak boleh meledak meski db audit tak di-mock
    // (dibungkus try/catch di service) — hasil di atas sudah membuktikannya.
  });

  it('mengklasifikasikan error tidak dikenal (non-AppError) sebagai SERVER error + can_retry = true', async () => {
    (db.query.collections.findFirst as jest.Mock).mockResolvedValue(null);
    (db.transaction as jest.Mock).mockImplementation(async (cb) => {
      throw new Error('Database down connection error');
    });

    const result = await syncCollectionsBatch([validItem], officerId, 'user-123');

    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toEqual({
      offline_id: 'loc-1',
      status: 'FAILED',
      error: 'Database down connection error',
      error_code: 'UNKNOWN',
      error_type: 'SERVER',
      can_retry: true,
    });
  });
});
