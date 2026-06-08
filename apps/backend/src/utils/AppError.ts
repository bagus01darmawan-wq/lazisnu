/**
 * Domain error class untuk menggantikan `throw new Error('CODE')` mentah.
 *
 * Membawa: code (machine-readable), statusCode, isRetryable, details.
 * Gunakan `instanceof AppError` untuk klasifikasi error di route/middleware,
 * bukan string matching ke `error.message`.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isRetryable: boolean;
  public readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    statusCode = 500,
    isRetryable = false,
    details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
    this.details = details;

    // Pastikan prototype chain benar untuk `instanceof` di runtime
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Normalisasi error unknown menjadi AppError.
   * Gunakan di catch block untuk memetakan error dari layer service ke HTTP response.
   */
  static fromUnknown(error: unknown, fallbackMessage = 'Terjadi kesalahan server'): AppError {
    if (error instanceof AppError) return error;

    if (error instanceof Error) {
      return new AppError(
        'INTERNAL_ERROR',
        error.message || fallbackMessage,
        500,
        true
      );
    }

    return new AppError('INTERNAL_ERROR', fallbackMessage, 500, true);
  }
}

/**
 * Type guard: cek apakah suatu error adalah AppError.
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
