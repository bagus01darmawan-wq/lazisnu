/**
 * authSessionPolicy — satu sumber aturan "kode error server → aksi sesi".
 *
 * Prinsip Sesi Permanen Sliding: aplikasi TIDAK logout karena masalah teknis
 * (jaringan, server, token invalid sesaat). Logout dipicu HANYA oleh penolakan
 * bisnis yang eksplisit dari server.
 */

/** Kode penolakan bisnis — satu-satunya yang memicu pembersihan sesi lokal. */
export const SESSION_DENIAL_CODES = [
  'REFRESH_REVOKED', // sesi device dicabut (logout perangkat lain / admin)
  'ACCOUNT_DISABLED', // akun dinonaktifkan admin
  'OFFICER_DISABLED', // akun petugas dinonaktifkan admin
] as const;

export type SessionAction = 'logout' | 'keep';

/**
 * Putuskan aksi berdasarkan kode error dari endpoint auth.
 * Semua kode lain (INVALID_TOKEN, NETWORK_ERROR, UNKNOWN_ERROR, ...) = keep.
 */
export function resolveSessionAction(errorCode?: string | null): SessionAction {
  if (!errorCode) {
    return 'keep';
  }
  return (SESSION_DENIAL_CODES as readonly string[]).includes(errorCode) ? 'logout' : 'keep';
}

/** Pesan UX spesifik per kode — pengganti "Sesi telah berakhir" generik. */
export function sessionExpiredMessage(reasonCode?: string | null): string {
  switch (reasonCode) {
    case 'ACCOUNT_DISABLED':
      return 'Akun Anda dinonaktifkan admin. Hubungi pengurus untuk informasi lebih lanjut.';
    case 'OFFICER_DISABLED':
      return 'Akun petugas Anda dinonaktifkan admin. Hubungi pengurus ranting/kecamatan.';
    case 'REFRESH_REVOKED':
      return 'Sesi di perangkat ini telah dicabut. Silakan login kembali.';
    default:
      return 'Sesi telah berakhir. Silakan login kembali.';
  }
}
