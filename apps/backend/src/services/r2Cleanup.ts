/**
 * R2 Cleanup Service — pembersih berkas sementara di R2.
 *
 * Latar belakang (temuan 23 Sep 2026): `qrPdfService` dulu memakai key bertimestamp
 * (`...-{Date.now()}.pdf`) sehingga **setiap** penekanan "Generate QR" membuat objek
 * R2 baru yang tidak pernah dihapus. Tidak ada cron, tidak ada penyapu — bucket
 * menumpuk selamanya.
 *
 * Dua lapis perbaikan:
 *  1. **Akar masalah** — key label QR kini deterministik (`qrPdfKey`/`qrBatchPdfKey`
 *     di `qrPdfKeys.ts`), jadi generate ulang menimpa, bukan menumpuk.
 *  2. **Sisa lama** — penyapu di berkas ini menghapus objek `qr-pdfs/` yang lebih tua
 *     dari masa retensi.
 *
 * ⚠️ Penyapu ini **hanya** menyentuh prefix `qr-pdfs/`. PDF BA/BAST di `ba-pdfs/`
 * sengaja disimpan permanen sebagai arsip hukum — **jangan pernah** ikut dihapus.
 */
import { listObjectsFromR2, deleteManyFromR2, type R2ObjectInfo } from './r2';
import { QR_PDF_PREFIX } from './qrPdfKeys';

export { QR_PDF_PREFIX };

/** Retensi bawaan label QR: 7 hari (label hanya perlu sampai tercetak). */
export const DEFAULT_QR_RETENTION_DAYS = 7;

/**
 * Lantai pengaman: retensi < 1 hari berarti "hapus hampir semuanya".
 * Salah ketik satu angka di cron tidak boleh mengosongkan bucket.
 */
const MIN_RETENTION_DAYS = 1;

/** Batas key yang dipindai per sekali jalan — menjaga durasi & memori. */
const MAX_KEYS_PER_RUN = 20_000;

export interface QrPdfSweepResult {
  prefix: string;
  retention_days: number;
  cutoff: string;
  /** Jumlah objek yang dilihat di bawah prefix. */
  scanned: number;
  /** Jumlah objek yang lebih tua dari cutoff. */
  expired: number;
  deleted: number;
  failed: number;
  /**
   * Perkiraan byte yang dibebaskan (jumlah ukuran objek kedaluwarsa).
   * Ini **batas atas**, bukan angka pasti: kalau `failed > 0`, sebagian tidak
   * benar-benar terhapus. Dilaporkan sebagai perkiraan supaya tidak menyesatkan.
   */
  bytes_freed_estimate: number;
  /** true bila masih ada objek di luar `MAX_KEYS_PER_RUN` (jalankan lagi). */
  capped: boolean;
  dry_run: boolean;
}

/**
 * Sapu objek `qr-pdfs/` yang lebih tua dari `retentionDays`.
 *
 * Idempoten dan aman dijalankan berkali-kali / dobel cron. Objek yang tidak punya
 * `lastModified` **tidak** dihapus (kita tidak menghapus berkas yang umurnya tidak
 * bisa dipastikan).
 */
export async function sweepQrPdfs(
  opts: { retentionDays?: number; dryRun?: boolean } = {},
): Promise<QrPdfSweepResult> {
  const requested = opts.retentionDays ?? DEFAULT_QR_RETENTION_DAYS;
  const retentionDays = Number.isFinite(requested)
    ? Math.max(MIN_RETENTION_DAYS, Math.floor(requested))
    : DEFAULT_QR_RETENTION_DAYS;
  const dryRun = opts.dryRun ?? false;

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const { objects, truncated } = await listObjectsFromR2(QR_PDF_PREFIX, {
    limit: MAX_KEYS_PER_RUN,
  });

  const expired: R2ObjectInfo[] = objects.filter(
    (o): o is R2ObjectInfo & { lastModified: Date } =>
      o.lastModified instanceof Date && o.lastModified.getTime() < cutoff.getTime(),
  );

  const base = {
    prefix: QR_PDF_PREFIX,
    retention_days: retentionDays,
    cutoff: cutoff.toISOString(),
    scanned: objects.length,
    expired: expired.length,
    bytes_freed_estimate: expired.reduce((sum, o) => sum + (o.size || 0), 0),
    capped: truncated,
    dry_run: dryRun,
  };

  if (dryRun || expired.length === 0) {
    return { ...base, deleted: 0, failed: 0 };
  }

  const { deleted, failed } = await deleteManyFromR2(expired.map((o) => o.key));

  return { ...base, deleted, failed };
}
