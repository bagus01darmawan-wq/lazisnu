// apps/mobile/src/config/crashlytics.ts
//
// Centralized Firebase Crashlytics helper. Semua module lain wajib lewat file
// ini agar key attribute konsisten dan data sensitif tidak ikut terkirim.

import crashlytics from '@react-native-firebase/crashlytics';

let initialized = false;

function getReporter() {
  return crashlytics();
}

export function initCrashlytics(): void {
  if (initialized) {
    return;
  }

  try {
    const reporter = getReporter();
    reporter.setCrashlyticsCollectionEnabled(!__DEV__);
    reporter.log(
      __DEV__
        ? 'Crashlytics initialized with collection disabled in development.'
        : 'Crashlytics initialized.'
    );
    initialized = true;
  } catch (error) {
    console.warn('[Crashlytics] Init failed:', error);
  }
}

export function setAuthTag(key: string, value: string | number | boolean): void {
  try {
    getReporter().setAttribute(`auth.${key}`, String(value));
  } catch {
    /* noop - native module may not be ready in tests or early startup */
  }
}

export function captureAuthEvent(
  code: string,
  context?: Record<string, unknown>,
): void {
  try {
    const reporter = getReporter();
    reporter.setAttribute('auth.event_code', code);
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          reporter.setAttribute(`auth.${key}`, String(value));
        }
      });
    }
    reporter.log(`Auth: ${code}`);
  } catch {
    /* noop */
  }
}

export function setAuthenticatedUser(officerId: string): void {
  try {
    getReporter().setUserId(officerId);
  } catch {
    /* noop */
  }
}

export function clearAuthenticatedUser(): void {
  try {
    getReporter().setUserId('');
  } catch {
    /* noop */
  }
}

export function isCrashlyticsInitialized(): boolean {
  return initialized;
}
