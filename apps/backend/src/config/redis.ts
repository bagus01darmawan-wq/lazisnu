import Redis from 'ioredis';
import { config } from './env';

// Determine if we should use Mock Redis (for development without a live server)
const useMock = !config.REDIS_URL;

let redisConnection: any;

if (useMock) {
  if (config.NODE_ENV === 'production') {
    console.error('❌ REDIS_URL wajib diset di environment production.');
    console.error('   Server dihentikan untuk mencegah data loss (blacklist token, OTP, BullMQ).');
    process.exit(1);
  }
  console.log('⚠️ REDIS_URL not found. Using ioredis-mock for development/staging.');
  // Dynamic import to avoid bundling ioredis-mock in production if not needed
  const RedisMock = require('ioredis-mock');
  redisConnection = new RedisMock();
} else {
  const redisUrl = config.REDIS_URL as string;
  redisConnection = new Redis({
    host: new URL(redisUrl).hostname,
    port: parseInt(new URL(redisUrl).port || '6379'),
    password: new URL(redisUrl).password || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
  });
}

export async function disconnectRedis() {
  if (redisConnection && typeof redisConnection.quit === 'function') {
    await redisConnection.quit();
  }
}

export function getRedis() {
  return redisConnection;
}

export { redisConnection };
export default redisConnection;
