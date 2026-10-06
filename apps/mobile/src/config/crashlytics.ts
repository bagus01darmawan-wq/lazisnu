// Centralized Crashlytics helper. Builds without a default Firebase app
// (staging) must never load the Crashlytics module: its import can initialize
// Firebase before our error handlers run.
import {getApps} from '@react-native-firebase/app';

let initialized = false;

function getReporter() {
  if (!getApps().some(app => app.name === '[DEFAULT]')) {
    return null;
  }
  const sdk: typeof import('@react-native-firebase/crashlytics') = require('@react-native-firebase/crashlytics');
  return {sdk, reporter: sdk.getCrashlytics()};
}

function ignoreFailure(operation: Promise<unknown>): void {
  operation.catch(() => undefined);
}

export function initCrashlytics(): void {
  if (initialized) {
    return;
  }
  try {
    const context = getReporter();
    if (!context) {
      return;
    }
    const {sdk, reporter} = context;
    ignoreFailure(sdk.setCrashlyticsCollectionEnabled(reporter, !__DEV__));
    sdk.log(
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
    const context = getReporter();
    if (context) {
      ignoreFailure(context.sdk.setAttribute(context.reporter, `auth.${key}`, String(value)));
    }
  } catch {
    /* noop - native module may not be ready in tests or early startup */
  }
}

export function captureAuthEvent(code: string, context?: Record<string, unknown>): void {
  try {
    const target = getReporter();
    if (!target) {
      return;
    }
    const {sdk, reporter} = target;
    ignoreFailure(sdk.setAttribute(reporter, 'auth.event_code', code));
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          ignoreFailure(sdk.setAttribute(reporter, `auth.${key}`, String(value)));
        }
      });
    }
    sdk.log(reporter, `Auth: ${code}`);
  } catch {
    /* noop */
  }
}

export function setAuthenticatedUser(officerId: string): void {
  try {
    const context = getReporter();
    if (context) {
      ignoreFailure(context.sdk.setUserId(context.reporter, officerId));
    }
  } catch {
    /* noop */
  }
}

export function clearAuthenticatedUser(): void {
  setAuthenticatedUser('');
}

export function isCrashlyticsInitialized(): boolean {
  return initialized;
}
