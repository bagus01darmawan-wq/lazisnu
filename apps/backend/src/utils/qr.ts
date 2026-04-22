import crypto from 'crypto';
import { config } from '../config/env';

/**
 * Membangun token QR yang ditandatangani menggunakan HMAC-SHA256.
 * Format: hmac_signature.qr_code
 */
export function signQRCode(qrCode: string): string {
  const hmac = crypto.createHmac('sha256', config.APP_SECRET);
  hmac.update(qrCode);
  const signature = hmac.digest('hex').substring(0, 32); // Gunakan 32 karakter pertama untuk efisiensi
  return `${signature}.${qrCode}`;
}

/**
 * Memverifikasi token QR dan mengembalikan qrCode asli jika valid.
 * Format token: signature.qr_code
 */
export function verifyQRCode(token: string): string | null {
  if (!token || !token.includes('.')) return null;

  const [signature, qrCode] = token.split('.');
  if (!signature || !qrCode) return null;

  const expectedSignature = crypto
    .createHmac('sha256', config.APP_SECRET)
    .update(qrCode)
    .digest('hex')
    .substring(0, 32);

  if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return qrCode;
  }

  return null;
}
