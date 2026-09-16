/**
 * Kebijakan zona waktu operasional — satu-satunya tempat yang boleh menentukan
 * batas hari/bulan untuk laporan.
 *
 * Kondisi saat ini: kolom timestamp di database bertipe `timestamp without time zone`
 * dan nilai batas periode dihitung dengan waktu lokal server (`new Date(y, m-1, 1)`).
 * Karena itu server WAJIB berjalan pada zona waktu operasional; nilai di bawah
 * dipakai untuk (a) melaporkan zona waktu pada respons API dan (b) dokumentasi
 * kapan kebijakan dapat dipindahkan ke `AT TIME ZONE` setelah kolom menjadi
 * `timestamptz`.
 *
 * Risiko yang ditutup: sebelum ambang "enam kali kosong" dipakai, kebijakan ini
 * harus tunggal — jangan menyebar `new Date()` dengan asumsi zona berbeda.
 */
export const OPERATIONAL_TIMEZONE = process.env.OPERATIONAL_TIMEZONE || 'Asia/Jakarta';

/** Offset menit zona operasional terhadap UTC pada waktu tertentu (default +7). */
export function operationalOffsetMinutes(at: Date = new Date()): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: OPERATIONAL_TIMEZONE,
      timeZoneName: 'shortOffset',
    });
    const part = formatter.formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+7';
    const match = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return 420;
    const sign = match[1] === '-' ? -1 : 1;
    return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
  } catch {
    return 420;
  }
}