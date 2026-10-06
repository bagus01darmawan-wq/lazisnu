// Cloudflare R2 Storage Service
// Untuk menyimpan QR Code PDF dan file upload lainnya

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env';
import { getErrorMessage } from '../utils/error-guards';

let r2Client: S3Client | null = null;

/**
 * Inisialisasi R2 client dengan graceful fallback
 */
function getR2Client(): S3Client | null {
  if (r2Client) return r2Client;

  if (!config.R2_ACCOUNT_ID || !config.R2_ACCESS_KEY_ID || !config.R2_SECRET_ACCESS_KEY || !config.R2_BUCKET_NAME) {
    console.warn('⚠️ [R2] Cloudflare R2 credentials tidak dikonfigurasi. File storage dinonaktifkan.');
    return null;
  }

  r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
  });

  console.log('✅ [R2] Cloudflare R2 client berhasil diinisialisasi.');
  return r2Client;
}

/**
 * Upload file ke R2
 */
export async function uploadToR2(params: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  metadata?: Record<string, string>;
  /** C1-T5 (§14.9): berkas privat — selalu 'private' untuk TTD/BA. */
  cacheControl?: string;
}): Promise<{ success: boolean; key?: string; url?: string; error?: string }> {
  const client = getR2Client();
  if (!client) return { success: false, error: 'R2 storage tidak dikonfigurasi' };

  try {
    await client.send(new PutObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      Metadata: params.metadata,
      ...(params.cacheControl ? { CacheControl: params.cacheControl } : {}),
    }));

    return { success: true, key: params.key };
  } catch (err: unknown) {
    const message = getErrorMessage(err, 'Gagal upload file');
    console.error('[R2] Gagal upload:', message);
    return { success: false, error: message };
  }
}

/**
 * C1-T5: unduh bytes dari R2 (untuk menyematkan gambar TTD ke PDF di server).
 * Bucket privat — hanya dipakai server-side, tidak pernah diekspos ke klien.
 */
export async function downloadFromR2(key: string): Promise<Buffer | null> {
  const client = getR2Client();
  if (!client) return null;

  try {
    const out = await client.send(new GetObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
    }));
    const body = out.Body as unknown as AsyncIterable<Uint8Array> | undefined;
    if (!body || typeof body[Symbol.asyncIterator] !== 'function') return null;
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch (err: unknown) {
    console.error('[R2] Gagal unduh:', getErrorMessage(err, 'Gagal unduh file'));
    return null;
  }
}

/**
 * Generate signed URL untuk download (berlaku 1 jam)
 */
export async function getSignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string | null> {
  const client = getR2Client();
  if (!client) return null;

  try {
    const command = new GetObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
    });
    return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  } catch (err: unknown) {
    const message = getErrorMessage(err, 'Gagal generate signed URL');
    console.error('[R2] Gagal generate signed URL:', message);
    return null;
  }
}

/**
 * Hapus file dari R2
 */
export async function deleteFromR2(key: string): Promise<boolean> {
  const client = getR2Client();
  if (!client) return false;

  try {
    await client.send(new DeleteObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
    }));
    return true;
  } catch (err: unknown) {
    const message = getErrorMessage(err, 'Gagal hapus file');
    console.error('[R2] Gagal hapus file:', message);
    return false;
  }
}

export interface R2ObjectInfo {
  key: string;
  size: number;
  lastModified: Date | null;
}

/**
 * Daftar objek di bawah sebuah prefix (paginated).
 *
 * Dipakai pembersih QR PDF (retensi) — sebelumnya tidak ada cara melihat isi
 * bucket sama sekali, jadi berkas yang menumpuk tak pernah bisa ditemukan.
 * R2/S3 membatasi 1000 key per halaman; `limit` memotong total yang dikembalikan
 * dan `truncated` menandai masih ada sisa di luar `limit`.
 */
export async function listObjectsFromR2(
  prefix: string,
  opts: { limit?: number } = {},
): Promise<{ objects: R2ObjectInfo[]; truncated: boolean }> {
  const client = getR2Client();
  if (!client) return { objects: [], truncated: false };

  const limit = opts.limit ?? 1000;
  const objects: R2ObjectInfo[] = [];
  let continuationToken: string | undefined;
  let truncated = false;

  try {
    do {
      const remaining = limit - objects.length;
      if (remaining <= 0) {
        truncated = true;
        break;
      }

      const out = await client.send(new ListObjectsV2Command({
        Bucket: config.R2_BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: Math.min(1000, remaining),
        ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
      }));

      for (const o of out.Contents ?? []) {
        if (!o.Key) continue;
        objects.push({
          key: o.Key,
          size: o.Size ?? 0,
          lastModified: o.LastModified ?? null,
        });
      }

      continuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
      truncated = Boolean(out.IsTruncated);
    } while (continuationToken && objects.length < limit);

    return { objects, truncated };
  } catch (err: unknown) {
    const message = getErrorMessage(err, 'Gagal list objek');
    console.error('[R2] Gagal list objek:', message);
    return { objects: [], truncated: false };
  }
}

/**
 * Hapus banyak objek sekaligus (DeleteObjects, maks 1000 key per panggilan).
 *
 * Penting: R2/S3 membalas HTTP 200 walau sebagian key gagal dihapus — kegagalan
 * per key dilaporkan di `Errors`. Jadi yang dihitung adalah `Errors`, bukan
 * status HTTP, supaya pemanggil tidak mengira "sukses" padahal berkas masih ada.
 */
export async function deleteManyFromR2(keys: string[]): Promise<{ deleted: number; failed: number }> {
  const client = getR2Client();
  if (!client || keys.length === 0) return { deleted: 0, failed: 0 };

  let deleted = 0;
  let failed = 0;

  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    try {
      const out = await client.send(new DeleteObjectsCommand({
        Bucket: config.R2_BUCKET_NAME,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: false },
      }));
      const errCount = out.Errors?.length ?? 0;
      failed += errCount;
      deleted += batch.length - errCount;
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Gagal hapus batch');
      console.error('[R2] Gagal hapus batch:', message);
      failed += batch.length;
    }
  }

  return { deleted, failed };
}
