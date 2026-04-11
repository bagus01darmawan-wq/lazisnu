// Redis Client Singleton

import Redis from 'ioredis';
import { config } from './env';

let redisClient: Redis | null = null;

/**
 * Get Redis client instance.
 * Returns null if REDIS_URL is not configured (falls back to in-memory).
 */
export function getRedis(): Redis | null {
  if (!config.REDIS_URL) {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected');
    });

    redisClient.on('error', (err) => {
      console.error('❌ Redis error:', err.message);
    });

    redisClient.on('close', () => {
      console.warn('⚠️ Redis connection closed');
    });
  }

  return redisClient;
}

/**
 * Disconnect Redis gracefully (for shutdown)
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('Redis disconnected');
  }
}

export const redis = getRedis();
export default redis;
