// Cloudflare R2 Storage Service
// Untuk menyimpan QR Code PDF dan file upload lainnya

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env';

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
    }));

    return { success: true, key: params.key };
  } catch (err: any) {
    console.error('[R2] Gagal upload:', err.message);
    return { success: false, error: err.message };
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
  } catch (err: any) {
    console.error('[R2] Gagal generate signed URL:', err.message);
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
  } catch (err: any) {
    console.error('[R2] Gagal hapus file:', err.message);
    return false;
  }
}

/**
 * Upload QR Code PDF untuk sebuah kaleng
 * Key format: qr-pdfs/{branchCode}/{qrCode}.pdf
 */
export async function uploadQRCodePDF(params: {
  qrCode: string;
  branchCode: string;
  pdfBuffer: Buffer;
}): Promise<{ success: boolean; key?: string; signedUrl?: string; error?: string }> {
  const key = `qr-pdfs/${params.branchCode}/${params.qrCode}.pdf`;

  const result = await uploadToR2({
    key,
    body: params.pdfBuffer,
    contentType: 'application/pdf',
    metadata: {
      qrCode: params.qrCode,
      branchCode: params.branchCode,
      generatedAt: new Date().toISOString(),
    },
  });

  if (!result.success) return result;

  const signedUrl = await getSignedDownloadUrl(key);
  return { success: true, key, signedUrl: signedUrl || undefined };
}
