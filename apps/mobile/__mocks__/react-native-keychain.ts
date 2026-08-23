// apps/mobile/__mocks__/react-native-keychain.ts
//
// Controllable mock untuk react-native-keychain. Test bisa program
// return value atau throw error untuk simulate Keychain unavailable.
//
// Cara kontrol test:
//   const Keychain = require('react-native-keychain');
//   Keychain.__setMockValue({ password: 'my-encryption-key' });
//   Keychain.__setMockError(new Error('keychain corrupt'));
//   Keychain.__resetMock();

interface MockState {
  value: {service: string; username: string; password: string} | null;
  shouldThrow: Error | null;
  // Track call history
  calls: {method: string; args: unknown}[];
  // Biometric support control
  biometryType: string | null;
}

let state: MockState = {
  value: null,
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
  return state.value;
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
  state.value = {service, username, password};
  return {service};
}

export async function resetGenericPassword(options?: {service?: string}): Promise<boolean> {
  state.calls.push({method: 'resetGenericPassword', args: options});
  if (state.shouldThrow) {
    throw state.shouldThrow;
  }
  if (!options?.service || state.value?.service === options.service) {
    state.value = null;
    return true;
  }
  return false;
}

export async function getSupportedBiometryType(): Promise<string | null> {
  state.calls.push({method: 'getSupportedBiometryType', args: undefined});
  return state.biometryType;
}

// Test helpers
export const __setMockValue = (value: MockState['value']) => {
  state.value = value;
};

export const __setMockError = (error: Error | null) => {
  state.shouldThrow = error;
};

export const __setBiometryType = (type: string | null) => {
  state.biometryType = type;
};

export const __resetMock = () => {
  state = {value: null, shouldThrow: null, calls: [], biometryType: 'Fingerprint'};
};

export const __getCalls = () => [...state.calls];
