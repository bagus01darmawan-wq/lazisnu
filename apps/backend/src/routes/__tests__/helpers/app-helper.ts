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

export async function closeApp(): Promise<void> {
  if (appInstance) {
    await appInstance.close();
    appInstance = null;
  }
  await disconnectRedis();
  await closeDbConnection();
}
