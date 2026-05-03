// Environment Configuration

import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.string().default('3001'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url().optional(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // CORS
  CORS_ORIGINS: z.string().default('*'),

  // API
  API_BASE_URL: z.string().default('http://localhost:3001'),

  // WhatsApp Business API
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

  // Google Play Integrity
  PLAY_INTEGRITY_KEY: z.string().optional(),

  // Internal API Key (for scheduler/internal routes)
  INTERNAL_API_KEY: z.string().optional(),

  // APP Secret for QR Signing
  APP_SECRET: z.string()
    .min(32, 'APP_SECRET minimal 32 karakter')
    .refine(
      (val) => {
        if (process.env.NODE_ENV === 'development') return true;
        return val !== 'development-secret-for-qr-signing';
      },
      { message: 'APP_SECRET wajib diganti dari nilai default di production/staging' }
    ),
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