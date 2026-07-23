/**
 * Token Service — per-device session keys (Bab 20 Fase 1).
 *
 * Struktur Redis:
 *   refresh:{userId}:{deviceId}  → jti aktif (1 key per user per perangkat)
 *   refresh:devices:{userId}     → Redis SET berisi deviceId aktif
 *
 * Perilaku:
 *   - Login ulang device sama → overwrite key (jti lama tidak berlaku lagi)
 *   - Revoke 1 device → DEL key + SREM dari registry
 *   - Revoke all → SMEMBERS registry → DEL semua key
 */

import { v4 as uuidv4 } from 'uuid';
import { getRedis, redisConnection } from '../config/redis';
import { config, isProduction } from '../config/env';
import { AppError } from '../utils/AppError';

const REFRESH_PREFIX = 'refresh:';
const DEVICES_PREFIX = 'refresh:devices:';

const DEFAULT_TTL = 365 * 24 * 60 * 60; // 365 hari dalam detik

/**
 * Buat jti (JWT ID) baru untuk refresh token.
 */
export function generateJti(): string {
  return uuidv4();
}

/**
 * Simpan sesi per device ke Redis.
 * Overwrite natural jika login ulang device sama.
 */
export async function storeDeviceSession(
  userId: string,
  deviceId: string,
  jti: string,
  ttlSeconds: number = DEFAULT_TTL
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const key = `${REFRESH_PREFIX}${userId}:${deviceId}`;
  const registryKey = `${DEVICES_PREFIX}${userId}`;

  await redis.set(key, jti, 'EX', ttlSeconds);
  await redis.sadd(registryKey, deviceId);
  await redis.expire(registryKey, ttlSeconds);
}

/**
 * Validasi sesi per device.
 * Returns true jika jti cocok.
 * Fail-closed di production jika Redis tidak tersedia (D-08).
 */
export async function validateDeviceSession(
  userId: string,
  deviceId: string,
  jti: string
): Promise<boolean> {
  const redis = getRedis();

  if (!redis) {
    if (isProduction) {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'Layanan autentikasi tidak tersedia',
        503,
        false
      );
    }
    return true; // development: fallback izinkan
  }

  const storedJti = await redis.get(`${REFRESH_PREFIX}${userId}:${deviceId}`);
  return storedJti === jti;
}

/**
 * Revoke 1 sesi device.
 */
export async function revokeDeviceSession(
  userId: string,
  deviceId: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const key = `${REFRESH_PREFIX}${userId}:${deviceId}`;
  const registryKey = `${DEVICES_PREFIX}${userId}`;

  await redis.del(key);
  await redis.srem(registryKey, deviceId);
}

/**
 * Revoke semua sesi user.
 * Jika exceptDeviceId diberikan, sesi device itu dipertahankan.
 */
export async function revokeAllUserSessions(
  userId: string,
  exceptDeviceId?: string
): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];

  const registryKey = `${DEVICES_PREFIX}${userId}`;
  const deviceIds = await redis.smembers(registryKey);
  const revoked: string[] = [];

  for (const did of deviceIds) {
    if (did === exceptDeviceId) continue;

    const key = `${REFRESH_PREFIX}${userId}:${did}`;
    await redis.del(key);
    await redis.srem(registryKey, did);
    revoked.push(did);
  }

  return revoked;
}

// ─── Fungsi lama (deprecated — dipertahankan untuk backward compat) ───

/**
 * @deprecated Gunakan storeDeviceSession()
 */
export async function storeRefreshJti(jti: string, userId: string, ttlSeconds: number): Promise<void> {
  const deviceId = jti; // fallback: jti sebagai deviceId
  await storeDeviceSession(userId, deviceId, jti, ttlSeconds);
}

/**
 * @deprecated Gunakan validateDeviceSession()
 */
export async function validateRefreshJti(jti: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return isProduction ? null : 'redis-unavailable';

  // Pencarian linear — only for backward compat
  const keys = await redis.keys(`${REFRESH_PREFIX}*:${jti}`);
  if (keys.length === 0) return null;
  return jti;
}

/**
 * @deprecated Gunakan revokeDeviceSession()
 */
export async function revokeRefreshJti(jti: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const keys = await redis.keys(`${REFRESH_PREFIX}*:${jti}`);
  for (const key of keys) {
    await redis.del(key);
  }
}

/**
 * @deprecated Gunakan revokeAllUserSessions()
 */
export async function revokeAllUserRefreshJti(userId: string): Promise<void> {
  await revokeAllUserSessions(userId);
}
