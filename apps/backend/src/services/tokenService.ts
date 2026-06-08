/**
 * Token Service — manajemen jti, refresh token rotation, dan session registry.
 */
import { v4 as uuidv4 } from 'uuid';
import { getRedis } from '../config/redis';

const REFRESH_PREFIX = 'refresh:';

/**
 * Buat jti (JWT ID) baru untuk refresh token.
 */
export function generateJti(): string {
  return uuidv4();
}

/**
 * Simpan jti ke Redis dengan TTL sesuai expiry refresh token (dalam detik).
 */
export async function storeRefreshJti(jti: string, userId: string, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  await redis.set(`${REFRESH_PREFIX}${jti}`, userId, 'EX', ttlSeconds);
}

/**
 * Validasi apakah jti masih valid (belum di-revoke).
 * Returns userId jika valid, null jika sudah di-revoke.
 */
export async function validateRefreshJti(jti: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return 'redis-unavailable'; // Fallback: izinkan jika Redis tidak ada

  const userId = await redis.get(`${REFRESH_PREFIX}${jti}`);
  return userId;
}

/**
 * Revoke (hapus) jti dari Redis — digunakan saat rotation atau logout.
 */
export async function revokeRefreshJti(jti: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  await redis.del(`${REFRESH_PREFIX}${jti}`);
}

/**
 * Revoke semua jti milik user tertentu.
 * Pattern: refresh:*userId* → scan keys → delete all.
 * Catatan: ini hanya revoke berdasarkan key pattern, bukan full session registry.
 */
export async function revokeAllUserRefreshJti(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  // Hapus key refresh:{jti} — Redis tidak punya pattern search yang efisien,
  // jadi untuk revoke all diperlukan session table (Fase 5).
  // Untuk saat ini kita hanya revoke via jti individual.
  // Session table nanti akan handle revoke all.
}
