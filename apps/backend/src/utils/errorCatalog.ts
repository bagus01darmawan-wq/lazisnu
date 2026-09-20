/**
 * Error code catalog — satu sumber kebenaran untuk semua kode error domain.
 *
 * Gunakan `ErrorCode.XXX` di service, bukan string literal.
 * Gunakan `toAppError()` factory untuk membuat AppError dengan kode dari catalog ini.
 */
import { AppError } from './AppError';

export const ErrorCode = {
  // Collection errors
  QR_ALREADY_SUBMITTED: 'QR_ALREADY_SUBMITTED',
  COLLECTION_NOT_FOUND: 'COLLECTION_NOT_FOUND',
  NOT_LATEST: 'NOT_LATEST',

  // Assignment errors
  ASSIGNMENT_INVALID: 'ASSIGNMENT_INVALID',
  CAN_ID_MISMATCH: 'CAN_ID_MISMATCH',

  // C1-T2 (§14.2/14.4 + B1): hasil klasifikasi scan/submit lintas periode.
  // Non-retryable: sync mobile memindah ke gagal permanen yang terlihat
  // (tidak retry ngotot, tidak hilang diam-diam, tidak spam).
  QR_NOT_ASSIGNED: 'QR_NOT_ASSIGNED',
  QR_WRONG_PERIOD: 'QR_WRONG_PERIOD',
  QR_PERIOD_CLOSED: 'QR_PERIOD_CLOSED',

  // C1-T3 (§14.12): draft penugasan tidak ditemukan.
  DRAFT_NOT_FOUND: 'DRAFT_NOT_FOUND',

  // C1-T4 (§14.10): konflik versi / status pada FINAL (tombol ganda, data berubah).
  CONFLICT: 'CONFLICT',

  // Auth / access
  FORBIDDEN: 'FORBIDDEN',
  FORBIDDEN_SCOPE: 'FORBIDDEN_SCOPE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  REFRESH_REVOKED: 'REFRESH_REVOKED',
  OFFICER_INACTIVE: 'OFFICER_INACTIVE',
  OTP_TOO_MANY_ATTEMPTS: 'OTP_TOO_MANY_ATTEMPTS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_ALREADY_REVOKED: 'SESSION_ALREADY_REVOKED',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // Infrastructure
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  WA_SEND_FAILED: 'WA_SEND_FAILED',
  OFFLINE_ID_DUPLICATE: 'OFFLINE_ID_DUPLICATE',
  DUKUH_IN_USE: 'DUKUH_IN_USE',
  COLLECTION_IN_USE: 'COLLECTION_IN_USE',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Factory: buat AppError dengan kode dari ErrorCode catalog.
 * Default: statusCode 500, isRetryable false.
 */
export function toAppError(code: ErrorCodeType, message: string, statusCode?: number, isRetryable?: boolean): AppError {
  return new AppError(code, message, statusCode, isRetryable);
}

/**
 * Pre-built AppError instances untuk kode yang sering dipakai.
 * Gunakan langsung: `throw Errors.NOT_LATEST` tanpa perlu bikin baru tiap kali.
 */
export const Errors = {
  QR_ALREADY_SUBMITTED: (msg?: string) =>
    new AppError(ErrorCode.QR_ALREADY_SUBMITTED, msg || 'Kaleng ini sudah pernah di-submit untuk assignment ini', 409),

  COLLECTION_NOT_FOUND: (msg?: string) =>
    new AppError(ErrorCode.COLLECTION_NOT_FOUND, msg || 'Data perolehan tidak ditemukan', 404),

  NOT_LATEST: (msg?: string) =>
    new AppError(ErrorCode.NOT_LATEST, msg || 'Hanya record terbaru yang bisa di-resubmit', 400),

  ASSIGNMENT_INVALID: (msg?: string) =>
    new AppError(ErrorCode.ASSIGNMENT_INVALID, msg || 'Assignment tidak valid, bukan milik Anda, atau sudah selesai', 403),

  CAN_ID_MISMATCH: (msg?: string) =>
    new AppError(ErrorCode.CAN_ID_MISMATCH, msg || 'can_id tidak sesuai dengan assignment', 400),

  QR_NOT_ASSIGNED: (msg?: string, details?: unknown) =>
    new AppError(ErrorCode.QR_NOT_ASSIGNED, msg || 'Kaleng ini bukan tugas Anda pada periode berjalan', 403, false, details),

  QR_WRONG_PERIOD: (msg?: string, details?: unknown) =>
    new AppError(ErrorCode.QR_WRONG_PERIOD, msg || 'Kaleng ini tugas Anda pada periode lain — di luar periode berjalan', 409, false, details),

  QR_PERIOD_CLOSED: (msg?: string, details?: unknown) =>
    new AppError(ErrorCode.QR_PERIOD_CLOSED, msg || 'Periode sudah dikunci, pakai tugas periode berjalan', 409, false, details),

  DRAFT_NOT_FOUND: (msg?: string, details?: unknown) =>
    new AppError(ErrorCode.DRAFT_NOT_FOUND, msg || 'Draft penugasan tidak ditemukan', 404, false, details),

  CONFLICT: (msg?: string, details?: unknown) =>
    new AppError(ErrorCode.CONFLICT, msg || 'Data berubah — muat ulang lalu coba lagi', 409, false, details),

  FORBIDDEN: (msg?: string) =>
    new AppError(ErrorCode.FORBIDDEN, msg || 'Anda tidak memiliki akses', 403),

  FORBIDDEN_SCOPE: (msg?: string) =>
    new AppError(ErrorCode.FORBIDDEN_SCOPE, msg || 'Tidak punya akses ke resource ini', 403, false),

  REFRESH_REVOKED: (msg?: string) =>
    new AppError(ErrorCode.REFRESH_REVOKED, msg || 'Refresh token sudah tidak berlaku', 401, false),

  OFFICER_INACTIVE: (msg?: string) =>
    new AppError(ErrorCode.OFFICER_INACTIVE, msg || 'Petugas sudah non-aktif', 403, false),

  OTP_TOO_MANY_ATTEMPTS: (msg?: string) =>
    new AppError(ErrorCode.OTP_TOO_MANY_ATTEMPTS, msg || 'Terlalu banyak percobaan, minta OTP baru', 429, false),

  ACCOUNT_LOCKED: (msg?: string) =>
    new AppError(ErrorCode.ACCOUNT_LOCKED, msg || 'Akun terkunci sementara, coba lagi nanti', 423, false),

  SESSION_NOT_FOUND: (msg?: string) =>
    new AppError(ErrorCode.SESSION_NOT_FOUND, msg || 'Sesi tidak ditemukan', 404, false),

  SESSION_ALREADY_REVOKED: (msg?: string) =>
    new AppError(ErrorCode.SESSION_ALREADY_REVOKED, msg || 'Sesi sudah dicabut', 410, false),

  WA_SEND_FAILED: (msg?: string) =>
    new AppError(ErrorCode.WA_SEND_FAILED, msg || 'Gagal mengirim notifikasi WhatsApp', 502, true),

  INTERNAL_ERROR: (msg?: string) =>
    new AppError(ErrorCode.INTERNAL_ERROR, msg || 'Terjadi kesalahan server', 500, true),

  DUKUH_IN_USE: (msg?: string) =>
    new AppError(ErrorCode.DUKUH_IN_USE, msg || 'Dukuh tidak bisa dihapus karena masih digunakan oleh kaleng yang sedang AKTIF', 400, false),

  COLLECTION_IN_USE: (msg?: string) =>
    new AppError(ErrorCode.COLLECTION_IN_USE, msg || 'Tidak bisa dihapus karena masih ada data terkait', 400, false),

  VALIDATION_ERROR: (msg?: string, details?: unknown) =>
    new AppError(ErrorCode.VALIDATION_ERROR, msg || 'Input tidak valid', 400, false, details),
} as const;
