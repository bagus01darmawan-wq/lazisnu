/**
 * Unit test untuk collectionSubmission service.
 *
 * Fokus: verifikasi invariants AppError — setiap error yang dilempar
 * harus membawa code, statusCode, dan isRetryable yang benar.
 *
 * Untuk integration test (dengan DB transaksi nyata), lihat Fase 4 plan.
 */
import { AppError, isAppError } from '../../utils/AppError';
import { Errors, ErrorCode } from '../../utils/errorCatalog';

// ---------------------------------------------------------------------------
// AppError unit tests — pastikan foundation Fase 1 solid
// ---------------------------------------------------------------------------

describe('AppError', () => {
  it('memiliki code, message, statusCode, dan isRetryable', () => {
    const err = new AppError('TEST_CODE', 'Test message', 418, true, { extra: 'info' });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('Test message');
    expect(err.statusCode).toBe(418);
    expect(err.isRetryable).toBe(true);
    expect(err.details).toEqual({ extra: 'info' });
    expect(err.name).toBe('AppError');
  });

  it('isAppError type guard mendeteksi AppError', () => {
    const appErr = new AppError('X', 'msg', 400);
    const stdErr = new Error('std');
    const plain = { code: 'X', message: 'msg' };

    expect(isAppError(appErr)).toBe(true);
    expect(isAppError(stdErr)).toBe(false);
    expect(isAppError(plain)).toBe(false);
  });

  it('fromUnknown membungkus Error biasa jadi AppError', () => {
    const wrapped = AppError.fromUnknown(new Error('raw message'));

    expect(isAppError(wrapped)).toBe(true);
    expect(wrapped.code).toBe('INTERNAL_ERROR');
    expect(wrapped.statusCode).toBe(500);
    expect(wrapped.isRetryable).toBe(true);
    expect(wrapped.message).toBe('raw message');
  });

  it('fromUnknown mengembalikan AppError asli tanpa ubah', () => {
    const original = new AppError('ORIGINAL', 'keep me', 409, false);
    const result = AppError.fromUnknown(original);

    expect(result).toBe(original); // referensi sama
    expect(result.code).toBe('ORIGINAL');
    expect(result.statusCode).toBe(409);
    expect(result.isRetryable).toBe(false);
  });

  it('fromUnknown untuk non-Error menghasilkan fallback', () => {
    const wrapped = AppError.fromUnknown('string error');

    expect(isAppError(wrapped)).toBe(true);
    expect(wrapped.code).toBe('INTERNAL_ERROR');
    expect(wrapped.message).toBe('Terjadi kesalahan server');
  });
});

// ---------------------------------------------------------------------------
// ErrorCatalog — pastikan semua pre-built Error konsisten
// ---------------------------------------------------------------------------

describe('ErrorCatalog — pre-built Errors', () => {
  const cases: Array<{
    name: string;
    factory: (msg?: string) => AppError;
    expectedCode: string;
    expectedStatus: number;
    expectedRetryable: boolean;
  }> = [
    { name: 'QR_ALREADY_SUBMITTED', factory: Errors.QR_ALREADY_SUBMITTED, expectedCode: ErrorCode.QR_ALREADY_SUBMITTED, expectedStatus: 409, expectedRetryable: false },
    { name: 'COLLECTION_NOT_FOUND', factory: Errors.COLLECTION_NOT_FOUND, expectedCode: ErrorCode.COLLECTION_NOT_FOUND, expectedStatus: 404, expectedRetryable: false },
    { name: 'NOT_LATEST', factory: Errors.NOT_LATEST, expectedCode: ErrorCode.NOT_LATEST, expectedStatus: 400, expectedRetryable: false },
    { name: 'ASSIGNMENT_INVALID', factory: Errors.ASSIGNMENT_INVALID, expectedCode: ErrorCode.ASSIGNMENT_INVALID, expectedStatus: 403, expectedRetryable: false },
    { name: 'CAN_ID_MISMATCH', factory: Errors.CAN_ID_MISMATCH, expectedCode: ErrorCode.CAN_ID_MISMATCH, expectedStatus: 400, expectedRetryable: false },
    { name: 'FORBIDDEN', factory: Errors.FORBIDDEN, expectedCode: ErrorCode.FORBIDDEN, expectedStatus: 403, expectedRetryable: false },
    { name: 'WA_SEND_FAILED', factory: Errors.WA_SEND_FAILED, expectedCode: ErrorCode.WA_SEND_FAILED, expectedStatus: 502, expectedRetryable: true },
    { name: 'INTERNAL_ERROR', factory: Errors.INTERNAL_ERROR, expectedCode: ErrorCode.INTERNAL_ERROR, expectedStatus: 500, expectedRetryable: true },
    { name: 'VALIDATION_ERROR', factory: Errors.VALIDATION_ERROR, expectedCode: ErrorCode.VALIDATION_ERROR, expectedStatus: 400, expectedRetryable: false },
  ];

  cases.forEach(({ name, factory, expectedCode, expectedStatus, expectedRetryable }) => {
    it(`Errors.${name}() membawa code=${expectedCode}, status=${expectedStatus}, isRetryable=${expectedRetryable}`, () => {
      const err = factory();
      expect(isAppError(err)).toBe(true);
      expect(err.code).toBe(expectedCode);
      expect(err.statusCode).toBe(expectedStatus);
      expect(err.isRetryable).toBe(expectedRetryable);
    });

    it(`Errors.${name}('custom msg') menerima custom message`, () => {
      const err = factory('Pesan kustom test');
      expect(err.message).toBe('Pesan kustom test');
      expect(err.code).toBe(expectedCode); // code tetap
    });
  });
});

// ---------------------------------------------------------------------------
// Error taxonomy invariant: semua error collection tidak boleh retryable
// ---------------------------------------------------------------------------

describe('Error taxonomy — financial immutable invariants', () => {
  it('QR_ALREADY_SUBMITTED, COLLECTION_NOT_FOUND, NOT_LATEST, FORBIDDEN tidak retryable', () => {
    const nonRetryable = [
      Errors.QR_ALREADY_SUBMITTED(),
      Errors.COLLECTION_NOT_FOUND(),
      Errors.NOT_LATEST(),
      Errors.FORBIDDEN(),
      Errors.ASSIGNMENT_INVALID(),
      Errors.CAN_ID_MISMATCH(),
    ];

    nonRetryable.forEach(err => {
      expect(err.isRetryable).toBe(false);
    });
  });

  it('WA_SEND_FAILED dan INTERNAL_ERROR retryable', () => {
    expect(Errors.WA_SEND_FAILED().isRetryable).toBe(true);
    expect(Errors.INTERNAL_ERROR().isRetryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mobile sync error classification (tanpa DB)
// ---------------------------------------------------------------------------

describe('Mobile sync — error classification', () => {
  it('AppError dengan isRetryable=false diklasifikasi sebagai VALIDATION', () => {
    // Simulasi logika yang sama dengan sync.ts refactored
    const classify = (err: unknown) => {
      if (!isAppError(err)) return 'UNKNOWN';
      if (!err.isRetryable && err.code !== 'WA_SEND_FAILED' && err.code !== 'INTERNAL_ERROR') {
        return 'VALIDATION';
      }
      return 'SERVER';
    };

    expect(classify(Errors.QR_ALREADY_SUBMITTED())).toBe('VALIDATION');
    expect(classify(Errors.COLLECTION_NOT_FOUND())).toBe('VALIDATION');
    expect(classify(Errors.NOT_LATEST())).toBe('VALIDATION');
    expect(classify(Errors.ASSIGNMENT_INVALID())).toBe('VALIDATION');
    expect(classify(Errors.CAN_ID_MISMATCH())).toBe('VALIDATION');
  });

  it('AppError dengan WA_SEND_FAILED atau INTERNAL_ERROR diklasifikasi sebagai SERVER', () => {
    const classify = (err: unknown) => {
      if (!isAppError(err)) return 'UNKNOWN';
      if (!err.isRetryable && err.code !== 'WA_SEND_FAILED' && err.code !== 'INTERNAL_ERROR') {
        return 'VALIDATION';
      }
      return 'SERVER';
    };

    expect(classify(Errors.WA_SEND_FAILED())).toBe('SERVER');
    expect(classify(Errors.INTERNAL_ERROR())).toBe('SERVER');
  });

  it('Error non-AppError diklasifikasi sebagai UNKNOWN (fallback)', () => {
    const classify = (err: unknown) => {
      if (!isAppError(err)) return 'UNKNOWN';
      if (!err.isRetryable && err.code !== 'WA_SEND_FAILED' && err.code !== 'INTERNAL_ERROR') {
        return 'VALIDATION';
      }
      return 'SERVER';
    };

    expect(classify(new Error('something random'))).toBe('UNKNOWN');
    expect(classify('string error')).toBe('UNKNOWN');
  });
});

// ---------------------------------------------------------------------------
// Regression: pastikan semua AppError code unik (tidak ada duplikasi)
// ---------------------------------------------------------------------------

describe('ErrorCode uniqueness', () => {
  it('semua kode error di ErrorCode unik', () => {
    const values = Object.values(ErrorCode);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
