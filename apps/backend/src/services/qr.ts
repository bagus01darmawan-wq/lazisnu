import crypto from 'crypto';
import { config } from '../config/env';

// Gunakan secret key dari .env atau fallback untuk development
const QR_SECRET = config.JWT_SECRET || 'lazisnu-secret-key';

export function generateQrToken(kalengId: string, bulan: number, tahun: number): string {
  const payload = `${kalengId}|${bulan}|${tahun}`;
  return crypto.createHmac('sha256', QR_SECRET)
    .update(payload)
    .digest('hex');
}

export function validateQrToken(token: string, kalengId: string, bulan: number, tahun: number): boolean {
  const expectedToken = generateQrToken(kalengId, bulan, tahun);
  return token === expectedToken;
}