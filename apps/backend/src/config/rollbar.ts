/**
 * Rollbar configuration — error capture untuk backend.
 *
 * `rollbar` adalah hard dependency. Jika ROLLBAR_ACCESS_TOKEN tidak diset,
 * initRollbar akan no-op, tapi import tetap jalan (build gagal jika
 * package tidak terinstall).
 *
 * Ref: https://github.com/rollbar/rollbar.js
 */
import Rollbar from 'rollbar';
import { config } from './env';

let rollbar: Rollbar | null = null;

export function initRollbar(): void {
  if (!config.ROLLBAR_ACCESS_TOKEN) {
    console.warn('⚠️ ROLLBAR_ACCESS_TOKEN not set, skipping Rollbar init');
    return;
  }

  rollbar = new Rollbar({
    accessToken: config.ROLLBAR_ACCESS_TOKEN,
    environment: config.NODE_ENV,
    captureUncaught: true,
    captureUnhandledRejections: true,
    payload: {
      code_version: process.env.GIT_SHA ?? '1.0.0',
    },
    // Sanitize: scrub field sensitif dari payload sebelum kirim ke Rollbar
    scrubFields: ['password', 'secret', 'creditCard', 'authorization', 'otp'],
  });
  console.log('✅ Rollbar initialized');
}

export function getRollbar(): Rollbar | null {
  return rollbar;
}

/**
 * Capture error ke Rollbar. No-op jika Rollbar belum di-init.
 */
export function captureError(
  error: Error,
  context?: Record<string, unknown>,
): void {
  if (!rollbar) return;
  rollbar.error(error, context as any);
}

/**
 * Capture message ke Rollbar. No-op jika Rollbar belum di-init.
 */
export function captureMessage(
  message: string,
  level: 'critical' | 'error' | 'warning' | 'info' | 'debug' = 'error',
): void {
  if (!rollbar) return;
  rollbar.log(level, message);
}