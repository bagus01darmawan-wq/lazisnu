/**
 * Penurunan key R2 untuk label QR kaleng — fungsi murni, tanpa DB/IO.
 *
 * Dipisah dari `qrPdfService.ts` supaya bisa diuji tanpa memuat `pdf-lib`/`qrcode`/DB,
 * dan supaya aturan penamaan key punya satu tempat.
 *
 * **Aturan penting: key TIDAK BOLEH memuat waktu (`Date.now()`).**
 * Sebelum 23 Sep 2026 key memuat timestamp sehingga setiap penekanan "Generate QR"
 * membuat objek R2 baru yang tidak pernah dihapus → bucket menumpuk selamanya.
 * Label adalah turunan murni dari data kaleng, jadi generate ulang harus **menimpa**
 * objek yang sama. Objek hanya dipakai untuk mencetak signed URL sesaat, jadi
 * menimpa tidak merusak apa pun.
 */
import { createHash } from 'node:crypto';

/** Prefix seluruh label QR. Penyapu R2 hanya boleh menyentuh prefix ini. */
export const QR_PDF_PREFIX = 'qr-pdfs/';

/** Key label QR satu kaleng — deterministik per (ranting, nomor QR). */
export function qrPdfKey(branchCode: string, qrCode: string): string {
  return `${QR_PDF_PREFIX}${branchCode}/qr-${qrCode}.pdf`;
}

/**
 * Key label QR batch — deterministik dari **isi pilihan**, bukan dari waktu.
 * Pilihan yang sama menghasilkan objek yang sama (menimpa, bukan menumpuk).
 * Urutan nomor QR diabaikan (diurutkan dulu) supaya pilihan yang sama dengan
 * urutan berbeda tetap menunjuk objek yang sama.
 */
export function qrBatchPdfKey(branchCode: string, qrCodes: string[]): string {
  const digest = createHash('sha256')
    .update([...qrCodes].sort().join(','))
    .digest('hex')
    .slice(0, 16);
  return `${QR_PDF_PREFIX}batch/${branchCode}/batch-${digest}.pdf`;
}
