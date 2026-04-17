import Redis from 'ioredis';
import { config } from './env';

// Determine if we should use Mock Redis (for development without a live server)
const useMock = !config.REDIS_URL;

let redisConnection: any;

if (useMock) {
  console.log('⚠️ REDIS_URL not found. Using ioredis-mock for development.');
  // Dynamic import to avoid bundling ioredis-mock in production if not needed
  const RedisMock = require('ioredis-mock');
  redisConnection = new RedisMock();
} else {
  redisConnection = new Redis({
    host: new URL(config.REDIS_URL).hostname,
    port: parseInt(new URL(config.REDIS_URL).port || '6379'),
    password: new URL(config.REDIS_URL).password || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
  });
}

export async function disconnectRedis() {
  if (redisConnection && typeof redisConnection.quit === 'function') {
    await redisConnection.quit();
  }
}

export { redisConnection };
export default redisConnection;
