/**
 * Satu pintu pesan error yang JUJUR.
 *
 * Aturan:
 * 1. Error yang membawa pesan terbaca → tampilkan pesan itu. Bila jenisnya
 *    dikenal (pemetaan di bawah), terjemahkan ke penjelasan jujur yang
 *    berasal dari jenis error NYATA — bukan tuduhan penyebab yang belum
 *    terbukti.
 * 2. Error tanpa informasi → fallback NETRAL. Jangan pernah menyalahkan
 *    penyebab tanpa bukti (mis. "periksa sinyal", "periksa koneksi") —
 *    itu merugikan pengguna yang baik-baik saja.
 */

const MAX_MESSAGE_LENGTH = 140;

/**
 * Pesan teknis yang dikenal → penjelasan jujur (berasal dari jenis error nyata).
 * PENTING: setiap pola harus meng-anchoring SELURUH pesan (^...$) — kalau hanya
 * sebagian, sisa teks asli akan ikut menempel saat penggantian.
 */
const KNOWN_MESSAGES: Array<[RegExp, string]> = [
  [/^download interrupted\.?$/i, 'Unduhan terputus sebelum selesai — file tidak utuh.'],
  [/^download manager download failed\.?$/i, 'Unduhan gagal di sistem Android.'],
  [/^(failed to fetch|network request failed)\.?$/i, 'Koneksi jaringan bermasalah.'],
  [/^(aborted|timeout of .*)$/i, 'Waktu tunggu habis — server tidak merespons.'],
];

export function getErrorMessage(error: unknown, fallback = 'Terjadi kesalahan'): string {
  let raw: string | null = null;

  if (error instanceof Error) {
    raw = error.message;
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as {message?: unknown}).message === 'string'
  ) {
    raw = (error as {message: string}).message;
  }

  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const trimmed = raw.trim();

  // Status HTTP (mis. "HTTP 500") → sebutkan statusnya dengan jujur.
  const httpMatch = /^HTTP (\d{3})\.?$/.exec(trimmed);
  if (httpMatch) {
    return `Server menjawab dengan status HTTP ${httpMatch[1]}.`;
  }

  for (const [pattern, replacement] of KNOWN_MESSAGES) {
    if (pattern.test(trimmed)) {
      return trimmed.replace(pattern, replacement);
    }
  }

  return trimmed.length > MAX_MESSAGE_LENGTH
    ? `${trimmed.slice(0, MAX_MESSAGE_LENGTH)}…`
    : trimmed;
}
