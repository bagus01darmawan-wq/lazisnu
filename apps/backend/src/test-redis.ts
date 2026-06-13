import 'dotenv/config';
import { redisConnection } from './config/redis';

async function test() {
  try {
    const isLocked = await redisConnection.get('test_key');
    console.log("Redis is working. Value:", isLocked);
  } catch (e) {
    console.error("Redis Error:", e);
  }
  process.exit();
}

test();
