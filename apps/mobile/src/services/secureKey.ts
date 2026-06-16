// apps/mobile/src/services/secureKey.ts
//
// Helper untuk generate & retrieve symmetric encryption key yang digunakan
// oleh MMKV. Key disimpan di Android Keystore via react-native-keychain.
//
// Penting: Import `react-native-get-random-values` HARUS pertama (sebelum
// ada kode yang pakai globalThis.crypto) — polyfill ini install
// `crypto.getRandomValues` ke global object RN.

import 'react-native-get-random-values';
import * as Keychain from 'react-native-keychain';

// ── Konstanta ────────────────────────────────────────────────────────────────

/**
 * Service name di Android Keystore. HARUS konstan dan unik agar:
 * 1. Key bisa di-reuse antar cold start.
 * 2. Tidak collide dengan library lain yang juga pakai Keychain.
 * 3. Bisa di-reset via `resetGenericPassword({ service })` saat logout.
 */
const KEYCHAIN_SERVICE = 'com.lazisnu.mmkv.encryption-key';

/** Username fiktif — Keychain butuh username field, kita tidak peduli isinya. */
const KEYCHAIN_USERNAME = 'mmkv';

/**
 * 12 byte = 96-bit entropy, di-encode base64 = 16 char.
 *
 * PENTING: MMKV constructor (`new MMKV({ encryptionKey })`) punya limit
 * 16 char string length di Android (lihat MmkvHostObject.cpp line 34).
 * String yang lebih panjang akan throw `Failed to create MMKV instance`.
 * 12 byte adalah sweet spot: cukup entropi (2^96), base64 pas 16 char.
 *
 * Untuk AES-128 kita idealnya butuh 16 byte raw, tapi MMKV menerima
 * string key langsung sebagai bytes — jadi kami treat base64-16-char
 * sebagai 16-byte key (cukup untuk kebutuhan lokal at-rest).
 */
const KEY_LENGTH_BYTES = 12;

// ── In-memory Cache ──────────────────────────────────────────────────────────

/**
 * Cache key di memory agar tidak query Keychain tiap kali `getToken()`.
 * Trade-off: jika app di-kill OS, cache hilang → re-query Keychain saat boot.
 */
let cachedKey: string | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert Uint8Array → base64 string.
 *
 * Catatan: `globalThis.btoa` TIDAK ada di RN Hermes engine. Kita pakai
 * workaround manual: convert setiap byte jadi char, lalu encode via btoa.
 */
function bufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  // @ts-ignore — btoa ada di RN via polyfill
  return globalThis.btoa(binary);
}

// ── Public API ───────────────────────────────────────────────────────────────

export type GetKeyResult =
  | { ok: true; key: string; source: 'cache' | 'keychain' }
  | { ok: false; reason: 'keychain_unavailable' | 'unknown' };

/**
 * Ambil encryption key. Urutan:
 * 1. Cek in-memory cache.
 * 2. Cek Keychain (persistent).
 * 3. Generate baru → simpan ke Keychain.
 *
 * Return { ok: false } jika Keychain corrupt / device lock bootloader.
 * Caller (api.ts / offline/mmkv.ts) yang memutuskan fallback apa yang dipakai.
 *
 * Lihat Design Decision 2026-06-12 di `.agents/rules/10-sprint-aktif.md`:
 * - Untuk token: caller boleh fallback ke ephemeral key (in-memory only).
 * - Untuk offline queue: caller HARUS wipe + force logout (no fallback).
 */
export async function getOrCreateEncryptionKey(): Promise<GetKeyResult> {
  // 1. Cache hit
  if (cachedKey) {
    return { ok: true, key: cachedKey, source: 'cache' };
  }

  try {
    // 2. Cek Keychain
    const existing = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
    if (existing && existing.password) {
      cachedKey = existing.password;
      return { ok: true, key: cachedKey, source: 'keychain' };
    }

    // 3. Generate baru (12 byte cryptographic random)
    //    @ts-ignore — `crypto` adalah global dari react-native-get-random-values polyfill
    const randomBytes = new Uint8Array(KEY_LENGTH_BYTES);
    // @ts-ignore
    crypto.getRandomValues(randomBytes);
    const keyBase64 = bufferToBase64(randomBytes);

    // 4. Simpan ke Keychain (Android Keystore AES-CBC).
    //    `AFTER_FIRST_UNLOCK`: tersedia setelah device pertama kali unlock
    //    di boot. Penting untuk background task (mis. sync otomatis).
    await Keychain.setGenericPassword(KEYCHAIN_USERNAME, keyBase64, {
      service: KEYCHAIN_SERVICE,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
      storage: Keychain.STORAGE_TYPE.AES,
    });

    cachedKey = keyBase64;
    return { ok: true, key: keyBase64, source: 'keychain' };
  } catch (error) {
    console.warn('[secureKey] Failed to get/create encryption key:', error);
    return { ok: false, reason: 'keychain_unavailable' };
  }
}

/**
 * Generate ephemeral key (in-memory only, dies on app restart).
 *
 * Sesuai Design Decision Opsi B: ini fallback HANYA untuk token storage.
 * Untuk offline queue yang berisi data finansial, JANGAN pakai ini —
 * panggil `forceLogout()` dari caller.
 */
export function generateEphemeralKey(): string {
  const randomBytes = new Uint8Array(KEY_LENGTH_BYTES);
  // @ts-ignore — `crypto` global dari polyfill
  crypto.getRandomValues(randomBytes);
  return bufferToBase64(randomBytes);
}

/**
 * Hapus key dari Keychain + clear cache.
 * Dipanggil saat forceLogout atau uninstall-prep.
 *
 * Best-effort: jika Keychain sudah corrupt, kita tetap clear cache.
 */
export async function clearEncryptionKey(): Promise<void> {
  cachedKey = null;
  try {
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
  } catch (error) {
    console.warn('[secureKey] Failed to clear encryption key:', error);
  }
}

/**
 * Untuk test & debugging — expose cache state.
 */
export function getCachedEncryptionKey(): string | null {
  return cachedKey;
}

/**
 * Untuk unit test — reset cache tanpa query Keychain.
 */
export function __resetCacheForTest(): void {
  cachedKey = null;
}

// Exported constants untuk testability
export const __TEST__ = {
  KEYCHAIN_SERVICE,
  KEYCHAIN_USERNAME,
  KEY_LENGTH_BYTES,
};
