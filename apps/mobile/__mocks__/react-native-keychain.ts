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
  value: { service: string; username: string; password: string } | null;
  shouldThrow: Error | null;
  // Track call history
  calls: { method: string; args: unknown }[];
}

let state: MockState = {
  value: null,
  shouldThrow: null,
  calls: [],
};

export const ACCESSIBLE = {
  WHEN_UNLOCKED: 'AccessibleWhenUnlocked',
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly',
  AFTER_FIRST_UNLOCK: 'AccessibleAfterFirstUnlock',
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AccessibleAfterFirstUnlockThisDeviceOnly',
};

export const STORAGE_TYPE = {
  AES: 'KeystoreAESCBC',
  AES_GCM: 'KeystoreAESGCM',
  AES_GCM_NO_AUTH: 'KeystoreAESGCM_NoAuth',
  RSA: 'KeystoreRSA',
};

export async function getGenericPassword(options?: { service?: string }): Promise<{ service: string; username: string; password: string } | null> {
  state.calls.push({ method: 'getGenericPassword', args: options });
  if (state.shouldThrow) {throw state.shouldThrow;}
  return state.value;
}

export async function setGenericPassword(
  username: string,
  password: string,
  options?: { service?: string; accessible?: string; storage?: string },
): Promise<{ service: string }> {
  state.calls.push({ method: 'setGenericPassword', args: { username, options } });
  if (state.shouldThrow) {throw state.shouldThrow;}
  const service = options?.service || 'mock';
  state.value = { service, username, password };
  return { service };
}

export async function resetGenericPassword(options?: { service?: string }): Promise<boolean> {
  state.calls.push({ method: 'resetGenericPassword', args: options });
  if (state.shouldThrow) {throw state.shouldThrow;}
  if (!options?.service || state.value?.service === options.service) {
    state.value = null;
    return true;
  }
  return false;
}

// Test helpers
export const __setMockValue = (value: MockState['value']) => {
  state.value = value;
};

export const __setMockError = (error: Error | null) => {
  state.shouldThrow = error;
};

export const __resetMock = () => {
  state = { value: null, shouldThrow: null, calls: [] };
};

export const __getCalls = () => [...state.calls];
