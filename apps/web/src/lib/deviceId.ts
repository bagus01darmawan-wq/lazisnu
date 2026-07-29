/**
 * deviceId.ts — UUID perangkat untuk identifikasi sesi multi-device.
 *
 * Disimpan di sessionStorage + cookie non-HttpOnly.
 * - sessionStorage: dibaca oleh komponen klien saat login
 * - cookie: dibaca oleh route handler server-side saat refresh
 *
 * Backend menggunakan device_id untuk membedakan sesi per perangkat
 * (Sub-bab 04 — tokenService multi-device session).
 */

const DEVICE_ID_KEY = 'lazisnu_device_id';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback untuk browser lawas
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function setCookie(name: string, value: string, days: number): void {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
}

export function getOrCreateDeviceId(): string {
  // 1. Cek sessionStorage dulu (tercepat, scoped ke tab)
  if (typeof window !== 'undefined') {
    const fromSession = sessionStorage.getItem(DEVICE_ID_KEY);
    if (fromSession) return fromSession;
  }

  // 2. Cek cookie (jika sudah pernah dibuat sebelumnya)
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(new RegExp(`(^| )${DEVICE_ID_KEY}=([^;]+)`));
    if (match) {
      const id = decodeURIComponent(match[2]);
      sessionStorage.setItem(DEVICE_ID_KEY, id);
      return id;
    }
  }

  // 3. Generate baru
  const newId = generateUUID();
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(DEVICE_ID_KEY, newId);
  }
  if (typeof document !== 'undefined') {
    setCookie(DEVICE_ID_KEY, newId, 365); // 365 hari
  }
  return newId;
}
