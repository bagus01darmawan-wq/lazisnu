/**
 * Shared integration test helper
 * Digunakan oleh semua integration test file.
 * Membuat instance Fastify sekali, lalu menutup semua koneksi di afterAll.
 */
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app';
import { closeDbConnection } from '../../../config/database';
import { disconnectRedis } from '../../../config/redis';

let appInstance: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!appInstance) {
    appInstance = await buildApp();
    await appInstance.ready();
  }
  return appInstance;
}

/**
 * Tutup instance Fastify yang ada dan buat ulang.
 * Berguna untuk reset state internal plugin (e.g. @fastify/rate-limit
 * LocalStore yang menyimpan counter request in-memory).
 *
 * TD-05: Session Management + Rate Limit test saling menumpuk
 * counter rate limit. resetApp() di beforeEach/ beforeAll describe
 * memastikan counter kembali ke 0 sehingga tiap test dapat jatah
 * penuh sesuai konfigurasi rate limit route.
 *
 * Redis/DB mock di module level (jest.mock) tetap persisten —
 * hanya instance Fastify yang di-rebuild.
 */
export async function resetApp(): Promise<FastifyInstance> {
  if (appInstance) {
    try {
      await appInstance.close();
    } catch {
      // Abaikan error close — rebuild tetap dilakukan
    }
    appInstance = null;
  }
  return getApp();
}

export async function closeApp(): Promise<void> {
  if (appInstance) {
    await appInstance.close();
    appInstance = null;
  }
  await disconnectRedis();
  await closeDbConnection();
}
