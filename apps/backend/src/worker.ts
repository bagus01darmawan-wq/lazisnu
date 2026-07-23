import './config/env';
import './config/redis';
import { whatsappWorker } from './workers/whatsapp.worker';

const signals = ['SIGTERM', 'SIGINT'] as const;

async function shutdown(signal: string) {
  console.log(`[Worker] ${signal} received, shutting down...`);
  try {
    await whatsappWorker.close();
    const { disconnectRedis } = await import('./config/redis.js');
    await disconnectRedis();
  } catch (err) {
    console.error('[Worker] Error during shutdown:', err);
  } finally {
    process.exit(0);
  }
}

for (const signal of signals) {
  process.on(signal, () => shutdown(signal));
}

console.log('WhatsApp Worker started');
