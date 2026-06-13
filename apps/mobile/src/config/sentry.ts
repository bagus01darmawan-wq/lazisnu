// apps/mobile/src/config/sentry.ts
//
// Centralized Sentry configuration. Dipanggil sekali dari index.js sebelum
// app code lain. Semua Sentry API dari module lain WAJIB lewat helper
// di sini (bukan panggil Sentry.* langsung) — agar tag namespace konsisten
// dan ada 1 tempat untuk strip PII.

import * as Sentry from '@sentry/react-native';

// ── Configuration ────────────────────────────────────────────────────────────

/**
 * Sentry DSN.
 * - __DEV__ = true  → empty (Sentry.init jadi no-op, tidak kirim event)
 * - production      → diambil dari env (react-native-config) atau placeholder
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 📋 CARA ISI DSN UNTUK PRODUCTION:
 *
 * 1. Opsi A (manual): Ganti placeholder di bawah dengan DSN asli dari
 *    Sentry dashboard → Settings → Projects → Client Keys (DSN).
 *
 * 2. Opsi B (env var): Install react-native-config, lalu baca dari
 *    Config.SENTRY_DSN.
 *
 * Untuk saat ini (belum ada react-native-config), ganti langsung string
 * placeholder di bawah menjadi DSN asli Anda sebelum build production APK.
 * ═══════════════════════════════════════════════════════════════════════
 */
const SENTRY_DSN = __DEV__
  ? ''
  : 'https://PLACEHOLDER_KEY@o000000.ingest.sentry.io/0000000';

/** Sample rate untuk performance tracing. 0.2 = 20% transaksi di-trace. */
const TRACES_SAMPLE_RATE = 0.2;

// ── Init ─────────────────────────────────────────────────────────────────────

let initialized = false;

export function initSentry(): void {
  if (initialized) {
    return;
  }
  if (!SENTRY_DSN) {
    // Dev mode: skip Sentry entirely. console.warn agar developer tahu.
    if (__DEV__) {
      console.info('[Sentry] Skipped init (no DSN in __DEV__)');
    }
    initialized = true; // mark agar tidak retry tiap render
    return;
  }

  // Production build dengan placeholder DSN — warn developer via console.error
  // agar kelihatan di logcat/metro. Placeholder DSN tidak akan mengirim event.
  if (!__DEV__ && SENTRY_DSN.includes('PLACEHOLDER')) {
    console.error(
      '[Sentry] DSN masih placeholder! Ganti di ' +
      'src/config/sentry.ts dengan DSN asli dari Sentry dashboard. ' +
      'Crash reporting tidak akan mengirim data sampai DSN diganti.'
    );
  }

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: __DEV__ ? 'development' : 'production',
      tracesSampleRate: TRACES_SAMPLE_RATE,
      // Strip PII: officer phone, address, nominal — semua PII harus
      // disaring SEBELUM dikirim ke Sentry server.
      beforeSend(event) {
        if (event.user) {
          // Jangan kirim phone/email/address ke Sentry
          delete event.user.email;
          delete event.user.ip_address;
          delete event.user.username;
        }
        // Hapus breadcrumb yang mungkin mengandung PII
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map((b: any) => {
            if (b.data) {
              const { phone, address, nominal, ...safe } = b.data;
              return { ...b, data: safe };
            }
            return b;
          });
        }
        return event;
      },
    });
    initialized = true;
  } catch (error) {
    // Init gagal → app tetap jalan tanpa Sentry. Better than crash.
    console.warn('[Sentry] Init failed:', error);
  }
}

// ── Auth-specific helpers (namespace: auth.*) ────────────────────────────────

/**
 * Set tag dengan namespace `auth.*`. Dipakai untuk filter di Sentry UI.
 * Contoh: setAuthTag('session_expired', 'true') → tag "auth.session_expired"
 */
export function setAuthTag(key: string, value: string | number | boolean): void {
  try {
    Sentry.setTag(`auth.${key}`, String(value));
  } catch {
    /* noop — Sentry mungkin belum di-init */
  }
}

/**
 * Capture auth-specific event (warning level, non-fatal).
 * Dipakai untuk telemetri post-rollout P4.
 */
export function captureAuthEvent(
  code: string,
  context?: Record<string, unknown>,
): void {
  try {
    Sentry.withScope((scope) => {
      scope.setTag('auth.event_code', code);
      if (context) {
        scope.setContext('auth', context);
      }
      Sentry.captureMessage(`Auth: ${code}`, 'info');
    });
  } catch {
    /* noop */
  }
}

/**
 * Set user context untuk Sentry (officer ID saja, BUKAN phone/email).
 * Dipanggil setelah login berhasil.
 */
export function setAuthenticatedUser(officerId: string): void {
  try {
    Sentry.setUser({ id: officerId });
  } catch {
    /* noop */
  }
}

/**
 * Clear user context saat logout. Tanpa ini, event Sentry akan
 * carry-over user lama ke sesi berikutnya (shared device risk).
 */
export function clearAuthenticatedUser(): void {
  try {
    Sentry.setUser(null);
  } catch {
    /* noop */
  }
}

// ── Status (untuk test & debugging) ──────────────────────────────────────────

export function isSentryInitialized(): boolean {
  return initialized;
}
