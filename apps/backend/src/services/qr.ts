import crypto from 'crypto';
import { config } from '../config/env';

// Gunakan APP_SECRET dari .env untuk QR signing
const QR_SECRET = (config as any).APP_SECRET || config.JWT_ACCESS_SECRET;

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