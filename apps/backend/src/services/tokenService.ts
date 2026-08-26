/**
 * Token Service — Sesi Permanen Sliding (RENCANA-SESI-PERMANEN-SLIDING-2026-08-26).
 *
 * Model baru: Redis BUKAN gerbang wajib, melainkan daftar blokir eksplisit.
 *
 * Struktur Redis:
 *   refresh:{userId}:{deviceId}   → jti TERAKHIR (informatif — UI perangkat aktif)
 *   revoked:{userId}:{deviceId}   → penanda blokir eksplisit (TTL = sisa umur token
 *                                   saat dicabut; self-cleaning)
 *   refresh:devices:{userId}      → Redis SET berisi deviceId yang pernah login
 *
 * Perilaku kunci:
 *   - Refresh TIDAK lagi mencabut jti lama (rotasi lunak / sliding).
 *     Respons hilang karena sinyal tidak lagi mematikan sesi.
 *   - Semua operasi Redis fail-open dengan log: kegagalan Redis TIDAK BOLEH
 *     membuat petugas ter-logout. Kegagalan hanya menunda pencabutan eksplisit.
 */

import { v4 as uuidv4 } from 'uuid';
import { getRedis } from '../config/redis';
import { isProduction } from '../config/env';

const REFRESH_PREFIX = 'refresh:';
const REVOKED_PREFIX = 'revoked:';
const DEVICES_PREFIX = 'refresh:devices:';

const DEFAULT_TTL = 365 * 24 * 60 * 60; // 365 hari dalam detik

function warnRedis(operation: string, error: unknown): void {
  // Fail-open: kegagalan Redis dicatat, tidak pernah dilempar ke caller auth.
  console.warn(`[tokenService] redis error pada ${operation}:`, error);
}

/**
 * Buat jti (JWT ID) baru untuk refresh token.
 */
export function generateJti(): string {
  return uuidv4();
}

/**
 * Catat jti terakhir per device (informatif — dipakai UI daftar perangkat).
 */
export async function storeDeviceSession(
  userId: string,
  deviceId: string,
  jti: string,
  ttlSeconds: number = DEFAULT_TTL
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    if (isProduction) warnRedis('storeDeviceSession', 'redis unavailable');
    return;
  }
  try {
    const key = `${REFRESH_PREFIX}${userId}:${deviceId}`;
    const registryKey = `${DEVICES_PREFIX}${userId}`;
    await redis.set(key, jti, 'EX', ttlSeconds);
    await redis.sadd(registryKey, deviceId);
    await redis.expire(registryKey, ttlSeconds);
  } catch (error) {
    warnRedis('storeDeviceSession', error);
  }
}

/**
 * Cek apakah device EXPLISIT dicabut (oleh user sendiri atau admin).
 * Fail-open: Redis down / key hilang → false (sesi tetap diizinkan).
 */
export async function isDeviceRevoked(
  userId: string,
  deviceId: string
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const flag = await redis.get(`${REVOKED_PREFIX}${userId}:${deviceId}`);
    return flag !== null;
  } catch (error) {
    warnRedis('isDeviceRevoked', error);
    return false;
  }
}

/**
 * Cabut sesi device secara eksplisit:
 * tulis denylist (TTL = sisa umur token saat dicabut) + bersihkan catatan aktif.
 */
export async function revokeDeviceSession(
  userId: string,
  deviceId: string,
  denylistTtlSeconds: number = DEFAULT_TTL
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    if (isProduction) warnRedis('revokeDeviceSession', 'redis unavailable');
    return;
  }
  try {
    const ttl = Math.max(1, Math.floor(denylistTtlSeconds));
    await redis.set(`${REVOKED_PREFIX}${userId}:${deviceId}`, '1', 'EX', ttl);
    await redis.del(`${REFRESH_PREFIX}${userId}:${deviceId}`);
    await redis.srem(`${DEVICES_PREFIX}${userId}`, deviceId);
  } catch (error) {
    warnRedis('revokeDeviceSession', error);
  }
}

/**
 * Hapus penanda blokir — dipanggil saat login ulang BERHASIL dengan kredensial
 * (OTP/password) pada device yang sama: bukti fisik pemegang akun hadir,
 * sehingga blokir lama tidak boleh menggantung selamanya.
 */
export async function clearDeviceRevocation(
  userId: string,
  deviceId: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(`${REVOKED_PREFIX}${userId}:${deviceId}`);
  } catch (error) {
    warnRedis('clearDeviceRevocation', error);
  }
}

/**
 * Cabut semua sesi user kecuali deviceId yang dikecualikan.
 * Setiap device yang dicabut mendapat denylist TTL = denylistTtlSeconds.
 * Returns daftar deviceId yang efektif dicabut (yang berhasil ditandai).
 */
export async function revokeAllUserSessions(
  userId: string,
  exceptDeviceId?: string,
  denylistTtlSeconds: number = DEFAULT_TTL
): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];

  const registryKey = `${DEVICES_PREFIX}${userId}`;
  let deviceIds: string[] = [];
  try {
    deviceIds = await redis.smembers(registryKey);
  } catch (error) {
    warnRedis('revokeAllUserSessions:smembers', error);
    return [];
  }

  const revoked: string[] = [];
  for (const did of deviceIds) {
    if (did === exceptDeviceId) continue;
    try {
      const ttl = Math.max(1, Math.floor(denylistTtlSeconds));
      await redis.set(`${REVOKED_PREFIX}${userId}:${did}`, '1', 'EX', ttl);
      await redis.del(`${REFRESH_PREFIX}${userId}:${did}`);
      await redis.srem(registryKey, did);
      revoked.push(did);
    } catch (error) {
      warnRedis('revokeAllUserSessions:device', error);
    }
  }

  return revoked;
}
