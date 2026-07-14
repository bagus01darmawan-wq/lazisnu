// Orchestrator untuk membuka dua MMKV hanya setelah encryption key tersedia.
// Urutan ini mencegah file terenkripsi dibuka tanpa key pada cold start.

import {getAuthStorage, initializeAuthStorage} from './api';
import {
  getOfflineStorage,
  initializeOfflineStorage,
} from './offline/mmkv';
import {
  clearEncryptionKey,
  generateEphemeralKey,
  getOrCreateEncryptionKey,
  type GetKeyResult,
} from './secureKey';

export type EncryptedStorageStatus = {
  defaultSecure: boolean;
  offlineSecure: boolean;
  fallback: 'none' | 'ephemeral_default' | 'wiped';
  reason?: string;
};

let initialized = false;
let initStatus: EncryptedStorageStatus | null = null;

export async function initEncryptedStorage(): Promise<EncryptedStorageStatus> {
  if (initialized && initStatus) {
    return initStatus;
  }

  const result: GetKeyResult = await getOrCreateEncryptionKey();

  if (result.ok) {
    try {
      // Key baru berarti file berasal dari versi lama yang belum terenkripsi.
      // Key yang sudah ada harus diberikan langsung saat constructor membuka file.
      const migrateUnencrypted = result.source === 'generated';
      initializeAuthStorage(result.key, migrateUnencrypted);
      initializeOfflineStorage(result.key, migrateUnencrypted);
      initStatus = {
        defaultSecure: true,
        offlineSecure: true,
        fallback: 'none',
      };
    } catch (error) {
      console.warn('[secureStorage] initialization failed, forcing wipe:', error);
      initializeFallbackAndWipe();
      initStatus = {
        defaultSecure: false,
        offlineSecure: false,
        fallback: 'wiped',
        reason: 'storage_initialization_failed',
      };
    }
  } else {
    try {
      const ephemeral = generateEphemeralKey();
      initializeAuthStorage(ephemeral);
      initializeOfflineStorage(ephemeral);
      wipeOfflineInstance();
      initStatus = {
        defaultSecure: false,
        offlineSecure: false,
        fallback: 'ephemeral_default',
        reason: result.reason,
      };
    } catch (error) {
      console.warn('[secureStorage] ephemeral fallback failed:', error);
      initializeFallbackAndWipe();
      initStatus = {
        defaultSecure: false,
        offlineSecure: false,
        fallback: 'wiped',
        reason: 'ephemeral_fallback_failed',
      };
    }
  }

  initialized = true;
  return initStatus;
}

export async function teardownEncryptedStorage(): Promise<void> {
  wipeBothInstances();
  await clearEncryptionKey();
  initialized = false;
  initStatus = null;
}

function initializeFallbackAndWipe(): void {
  try {
    const fallbackKey = generateEphemeralKey();
    initializeAuthStorage(fallbackKey);
    initializeOfflineStorage(fallbackKey);
  } catch {
    // Getter-based wipe below remains best-effort if native init also fails.
  }
  wipeBothInstances();
}

function wipeBothInstances(): void {
  try {
    getAuthStorage().clearAll();
  } catch {
    /* storage belum tersedia */
  }
  try {
    getOfflineStorage().clearAll();
  } catch {
    /* storage belum tersedia */
  }
}

function wipeOfflineInstance(): void {
  try {
    getOfflineStorage().clearAll();
  } catch {
    /* storage belum tersedia */
  }
}

export function getEncryptionStatus(): EncryptedStorageStatus | null {
  return initStatus;
}

export function __resetForTest(): void {
  initialized = false;
  initStatus = null;
}
