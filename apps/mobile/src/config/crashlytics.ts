// apps/mobile/src/config/crashlytics.ts
//
// Centralized Firebase Crashlytics helper. Semua module lain wajib lewat file
// ini agar key attribute konsisten dan data sensitif tidak ikut terkirim.

import {
  getCrashlytics,
  log,
  setAttribute,
  setCrashlyticsCollectionEnabled,
  setUserId,
} from '@react-native-firebase/crashlytics';

let initialized = false;

function getReporter() {
  return getCrashlytics();
}

function ignoreFailure(operation: Promise<unknown>): void {
  operation.catch(() => undefined);
}

export function initCrashlytics(): void {
  if (initialized) {
    return;
  }

  try {
    const reporter = getReporter();
    ignoreFailure(setCrashlyticsCollectionEnabled(reporter, !__DEV__));
    log(
      reporter,
      __DEV__
        ? 'Crashlytics initialized with collection disabled in development.'
        : 'Crashlytics initialized.',
    );
    initialized = true;
  } catch (error) {
    console.warn('[Crashlytics] Init failed:', error);
  }
}

export function setAuthTag(key: string, value: string | number | boolean): void {
  try {
    ignoreFailure(setAttribute(getReporter(), `auth.${key}`, String(value)));
  } catch {
    /* noop - native module may not be ready in tests or early startup */
  }
}

export function captureAuthEvent(code: string, context?: Record<string, unknown>): void {
  try {
    const reporter = getReporter();
    ignoreFailure(setAttribute(reporter, 'auth.event_code', code));
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          ignoreFailure(setAttribute(reporter, `auth.${key}`, String(value)));
        }
      });
    }
    log(reporter, `Auth: ${code}`);
  } catch {
    /* noop */
  }
}

export function setAuthenticatedUser(officerId: string): void {
  try {
    ignoreFailure(setUserId(getReporter(), officerId));
  } catch {
    /* noop */
  }
}

export function clearAuthenticatedUser(): void {
  try {
    ignoreFailure(setUserId(getReporter(), ''));
  } catch {
    /* noop */
  }
}

export function isCrashlyticsInitialized(): boolean {
  return initialized;
}
