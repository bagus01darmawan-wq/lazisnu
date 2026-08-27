// apps/mobile/__mocks__/react-native-keychain.ts
//
// Controllable mock untuk react-native-keychain — penyimpanan PER-SERVICE
// (meniru runtime asli: setiap service punya entry sendiri; service A
// biometrik dan service B silent tidak saling menimpa).
//
// Cara kontrol test:
//   const Keychain = require('react-native-keychain');
//   Keychain.__setMockValue({service: '...', username: 'u', password: 'p'});
//   Keychain.__setMockError(new Error('keychain corrupt'));
//   Keychain.__resetMock();

interface Entry {
  service: string;
  username: string;
  password: string;
}

interface MockState {
  values: Record<string, Entry>;
  shouldThrow: Error | null;
  calls: {method: string; args: unknown}[];
  biometryType: string | null;
}

let state: MockState = {
  values: {},
  shouldThrow: null,
  calls: [],
  biometryType: 'Fingerprint',
};

export const ACCESSIBLE = {
  WHEN_UNLOCKED: 'AccessibleWhenUnlocked',
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly',
  AFTER_FIRST_UNLOCK: 'AccessibleAfterFirstUnlock',
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AccessibleAfterFirstUnlockThisDeviceOnly',
};

export const ACCESS_CONTROL = {
  USER_PRESENCE: 'UserPresence',
  BIOMETRY_ANY: 'BiometryAny',
  BIOMETRY_CURRENT_SET: 'BiometryCurrentSet',
  DEVICE_PASSCODE: 'DevicePasscode',
  APPLICATION_PASSWORD: 'ApplicationPassword',
  BIOMETRY_ANY_OR_DEVICE_PASSCODE: 'BiometryAnyOrDevicePasscode',
  BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE: 'BiometryCurrentSetOrDevicePasscode',
};

export enum BIOMETRY_TYPE {
  TOUCH_ID = 'TouchID',
  FACE_ID = 'FaceID',
  OPTIC_ID = 'OpticID',
  FINGERPRINT = 'Fingerprint',
  FACE = 'Face',
  IRIS = 'Iris',
}

export const STORAGE_TYPE = {
  AES: 'KeystoreAESCBC',
  AES_GCM: 'KeystoreAESGCM',
  AES_GCM_NO_AUTH: 'KeystoreAESGCM_NoAuth',
  RSA: 'KeystoreRSA',
};

export async function getGenericPassword(options?: {
  service?: string;
  authenticationPrompt?: unknown;
}): Promise<{service: string; username: string; password: string} | null> {
  state.calls.push({method: 'getGenericPassword', args: options});
  if (state.shouldThrow) {
    throw state.shouldThrow;
  }
  const service = options?.service || 'default';
  return state.values[service] ?? null;
}

export async function setGenericPassword(
  username: string,
  password: string,
  options?: {
    service?: string;
    accessible?: string;
    storage?: string;
    accessControl?: string;
    authenticationPrompt?: unknown;
  },
): Promise<{service: string}> {
  state.calls.push({method: 'setGenericPassword', args: {username, options}});
  if (state.shouldThrow) {
    throw state.shouldThrow;
  }
  const service = options?.service || 'mock';
  state.values[service] = {service, username, password};
  return {service};
}

export async function resetGenericPassword(options?: {service?: string}): Promise<boolean> {
  state.calls.push({method: 'resetGenericPassword', args: options});
  if (state.shouldThrow) {
    throw state.shouldThrow;
  }
  if (!options?.service) {
    state.values = {};
    return true;
  }
  const existed = options.service in state.values;
  delete state.values[options.service];
  return existed;
}

export async function getSupportedBiometryType(): Promise<string | null> {
  state.calls.push({method: 'getSupportedBiometryType', args: undefined});
  return state.biometryType;
}

// Test helpers
export const __setMockValue = (value: Entry | null) => {
  if (value === null) {
    state.values = {};
    return;
  }
  state.values[value.service] = value;
};

export const __setMockError = (error: Error | null) => {
  state.shouldThrow = error;
};

export const __setBiometryType = (type: string | null) => {
  state.biometryType = type;
};

export const __resetMock = () => {
  state = {values: {}, shouldThrow: null, calls: [], biometryType: 'Fingerprint'};
};

export const __getCalls = () => [...state.calls];

/** Inspeksi per-service (meniru Keychain asli: satu entry per service). */
export const __getValues = () => ({...state.values});
