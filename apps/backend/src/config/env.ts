// Environment Configuration

import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load .env.test saat test, .env saat development/production
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url().optional(),

  // JWT
  // JWT_SECRET is deprecated — gunakan JWT_ACCESS_SECRET + JWT_REFRESH_SECRET
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('365d'),
  JWT_REFRESH_TTL_PETUGAS: z.string().default('365d'),

  // CORS
  CORS_ORIGINS: z.string().default('*'),

  // API
  API_BASE_URL: z.string().default('http://localhost:3001'),

  // WhatsApp Business API
  WA_PROVIDER: z.enum(['meta', 'fonnte']).default('meta'),
  WA_BUSINESS_API_URL: z.string().optional(),
  WA_PHONE_NUMBER_ID: z.string().optional(),
  WA_ACCESS_TOKEN: z.string().optional(),

  // Firebase
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),

  // Internal API Key (for scheduler/internal routes)
  INTERNAL_API_KEY: z.string().optional(),

  // Worker WhatsApp (BullMQ). Kosong = nyala hanya di luar development.
  // Alasan: di dev, proses API tidak perlu meneruskan notifikasi WhatsApp,
  // tetapi worker yang hidup tetap memanggil Redis tanpa henti. Mesin dev bisa
  // menunjuk ke Redis berkuota (Upstash), dan polling worker itu sendiri cukup
  // menghabiskan kuota 500.000/bulan dalam beberapa jam.
  // Aktifkan di dev hanya bila memang ingin menguji aliran notifikasi:
  //   WHATSAPP_WORKER_ENABLED=true
  WHATSAPP_WORKER_ENABLED: z.string().optional(),

  // Rollbar
  ROLLBAR_ACCESS_TOKEN: z.string().optional(),

});

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parseResult.error.format());
  process.exit(1);
}

export const config = parseResult.data;

// Computed values
export const isProduction = config.NODE_ENV === 'production';
export const isDevelopment = config.NODE_ENV === 'development';
export const corsOrigins = config.CORS_ORIGINS.split(',').map(s => s.trim());

/**
 * Worker WhatsApp dipakai hanya bila di luar development, kecuali diminta
 * eksplisit lewat WHATSAPP_WORKER_ENABLED. Nilai yang dianggap "mati":
 * kosong tak sengaja, 'false', '0', 'no', 'off'.
 */
export const whatsappWorkerEnabled = (() => {
  const raw = config.WHATSAPP_WORKER_ENABLED?.trim().toLowerCase();
  if (!raw) {
    // Tidak diisi: nyala hanya di luar development.
    return !isDevelopment;
  }
  return !['false', '0', 'no', 'off'].includes(raw);
})();
