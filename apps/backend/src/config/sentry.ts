/**
 * Sentry configuration — error capture untuk backend.
 *
 * @sentry/node adalah hard dependency. Jika SENTRY_DSN tidak diset,
 * initSentry akan no-op, tapi import tetap jalan (build gagal jika
 * package tidak terinstall).
 */
import * as Sentry from '@sentry/node';
import { config } from './env';

export function initSentry(): void {
  if (!config.SENTRY_DSN) {
    console.warn('⚠️ SENTRY_DSN not set, skipping Sentry init');
    return;
  }

  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    tracesSampleRate: 0.1,
    integrations: [],
    beforeSend(event: any) {
      // Sanitize: hapus data sensitif
      if (event.request?.headers) {
        delete event.request.headers.authorization;
      }
      if (event.request?.data) {
        delete event.request.data.password;
        delete event.request.data.otp;
      }
      return event;
    },
  });
  console.log('✅ Sentry initialized');
}
