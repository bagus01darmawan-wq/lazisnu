/**
 * Kode petugas berikutnya untuk satu ranting.
 *
 * Nomor diambil dari suffix numerik TERBESAR kode yang sudah ada, bukan dari
 * jumlah petugas. Petugas bisa dihapus, sehingga jumlah petugas lebih kecil
 * dari nomor terakhir — pola "jumlah + 1" lalu menghasilkan kode yang sudah
 * dipakai dan melanggar unique constraint `officers.employee_code`.
 *
 * Kode non-numerik (data lama) diabaikan; format hasil selalu `PREFIX-0001`.
 */
export function buildNextEmployeeCode(
  branchCode: string | null | undefined,
  existingCodes: readonly string[],
): string {
  const prefix = `${branchCode || 'XX'}-`;
  let maxSuffix = 0;

  for (const code of existingCodes) {
    if (!code || !code.startsWith(prefix)) {
      continue;
    }
    const match = /-(\d+)$/.exec(code);
    if (!match) {
      continue;
    }
    const suffix = Number(match[1]);
    if (Number.isFinite(suffix) && suffix > maxSuffix) {
      maxSuffix = suffix;
    }
  }

  return `${prefix}${String(maxSuffix + 1).padStart(4, '0')}`;
}
