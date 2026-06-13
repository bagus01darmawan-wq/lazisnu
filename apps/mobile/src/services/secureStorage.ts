// apps/mobile/src/services/secureStorage.ts
//
// Orchestrator untuk enkripsi 2 instance MMKV (default + offline-queue).
// Dipanggil SEKALI di App.tsx SEBELUM navigator mount (lihat P4.4).
//
// Strategi migrasi (existing user dari P0–P3 dengan MMKV plain):
//   Pakai `MMKV.recrypt(key)` yang atomic re-encrypt existing data.
//   Tidak perlu clear data; tidak ada downtime; transparan untuk caller.
//
// Strategi fallback (saat Keychain unavailable):
//   - Default MMKV (token): pakai ephemeral key (Opsi B dari Design Decision)
//   - Offline-queue MMKV (data finansial): TIDAK ada fallback — caller
//     HARUS panggil forceLogout() untuk wipe + relogin.

import { storage as defaultStorage } from './api';
import { storage as offlineStorage } from './offline/mmkv';
import {
  getOrCreateEncryptionKey,
  generateEphemeralKey,
  clearEncryptionKey,
  type GetKeyResult,
} from './secureKey';

// ── Init Result ──────────────────────────────────────────────────────────────

export type EncryptedStorageStatus = {
  /** Default MMKV (token) — apakah pakai persistent key dari Keychain? */
  defaultSecure: boolean;
  /** Offline-queue MMKV (data finansial) — apakah pakai persistent key? */
  offlineSecure: boolean;
  /**
   * Mode fallback apa yang aktif.
   * - 'none'           : Keychain OK, semua encrypted dengan persistent key
   * - 'ephemeral_default' : Keychain gagal; default pakai ephemeral key,
   *                       offline-queue di-wipe (caller harus forceLogout)
   * - 'wiped'          : Keychain gagal; keduanya di-wipe (forceLogout path)
   */
  fallback: 'none' | 'ephemeral_default' | 'wiped';
  /** Untuk Sentry tag. */
  reason?: string;
};

// ── Init ─────────────────────────────────────────────────────────────────────

/**
 * Idempotent: aman dipanggil berulang. Subsequent calls return status
 * yang sama tanpa re-init.
 */
let initialized = false;
let initStatus: EncryptedStorageStatus | null = null;

export async function initEncryptedStorage(): Promise<EncryptedStorageStatus> {
  if (initialized && initStatus) {
    return initStatus;
  }

  const result: GetKeyResult = await getOrCreateEncryptionKey();

  if (result.ok) {
    // Happy path: re-encrypt kedua instance dengan persistent key.
    // recrypt() aman dipanggil di existing data (atomic, no data loss).
    try {
      defaultStorage.recrypt(result.key);
      offlineStorage.recrypt(result.key);
      initStatus = {
        defaultSecure: true,
        offlineSecure: true,
        fallback: 'none',
      };
    } catch (error) {
      // recrypt() bisa throw jika existing data corrupt (jarang).
      // Fallback: wipe + relogin. Caller akan handle via forceLogout.
      console.warn('[secureStorage] recrypt failed, forcing wipe:', error);
      wipeBothInstances();
      initStatus = {
        defaultSecure: false,
        offlineSecure: false,
        fallback: 'wiped',
        reason: 'recrypt_failed',
      };
    }
  } else {
    // Keychain unavailable (Design Decision: beda perlakuan).
    // Default: ephemeral key (token aman walau short-lived).
    // Offline-queue: WIPE (data finansial tidak boleh pakai weak key).
    try {
      const ephemeral = generateEphemeralKey();
      defaultStorage.recrypt(ephemeral);
      wipeOfflineInstance();
      initStatus = {
        defaultSecure: false,
        offlineSecure: false,
        fallback: 'ephemeral_default',
        reason: result.reason,
      };
    } catch (error) {
      // Bahkan ephemeral generation gagal — wipe total.
      console.warn('[secureStorage] ephemeral fallback failed:', error);
      wipeBothInstances();
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

// ── Teardown (untuk logout) ──────────────────────────────────────────────────

/**
 * Hapus encryption key dari Keychain + wipe kedua instance MMKV.
 * Dipanggil saat forceLogout / uninstall-prep.
 *
 * Setelah teardown, `initEncryptedStorage()` bisa dipanggil ulang
 * (mis. user login lagi di device yang sama).
 */
export async function teardownEncryptedStorage(): Promise<void> {
  await clearEncryptionKey();
  wipeBothInstances();
  initialized = false;
  initStatus = null;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function wipeBothInstances(): void {
  try { defaultStorage.clearAll(); } catch (e) { /* ignore */ }
  try { offlineStorage.clearAll(); } catch (e) { /* ignore */ }
}

function wipeOfflineInstance(): void {
  try { offlineStorage.clearAll(); } catch (e) { /* ignore */ }
}

// ── Status getter ────────────────────────────────────────────────────────────

export function getEncryptionStatus(): EncryptedStorageStatus | null {
  return initStatus;
}

// Untuk test only
export function __resetForTest(): void {
  initialized = false;
  initStatus = null;
}
