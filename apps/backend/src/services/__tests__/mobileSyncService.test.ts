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

    const result = await syncCollectionsBatch([validItem], officerId);

    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results[0]).toEqual({
      offline_id: 'loc-1',
      server_id: 'srv-1',
      status: 'COMPLETED',
    });
  });

  it('mengembalian status ALREADY_SYNCED jika offline_id sudah ada di DB', async () => {
    (db.query.collections.findFirst as jest.Mock).mockResolvedValue({ id: 'srv-1' });

    const result = await syncCollectionsBatch([validItem], officerId);

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

    const result = await syncCollectionsBatch([validItem], officerId);

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

    const result = await syncCollectionsBatch([validItem], officerId);

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

    const result = await syncCollectionsBatch([validItem], officerId);

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
