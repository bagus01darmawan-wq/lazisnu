/**
 * Sentry configuration — error capture untuk backend.
 *
 * Jika SENTRY_DSN tidak diset atau @sentry/node tidak terinstall,
 * initSentry akan no-op.
 */
import { config } from './env';

export function initSentry(): void {
  if (!config.SENTRY_DSN) {
    return;
  }

  try {
    // Dynamic import agar tidak crash jika package belum terinstall
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/node');
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
  } catch {
    console.warn('⚠️ @sentry/node not installed, skipping Sentry init');
  }
}
