// Main Server Entry Point - Lazisnu Backend
import { config } from './config/env';
import { disconnectRedis } from './config/redis';
import { buildApp } from './app';
import { whatsappWorker } from './workers/whatsapp.worker';

// Start server
async function start() {
  const server = await buildApp();
  
  try {
    server.log.info('Connected to PostgreSQL database via Drizzle');

    // Start listening
    await server.listen({ port: parseInt(config.PORT), host: '0.0.0.0' });
    server.log.info(`Server running on port ${config.PORT}`);

    // Job scheduler dihapus per D-06 (penugasan 100% via Admin Web).
    // HTTP /v1/scheduler/* tetap dipertahankan sebagai fallback manual (D-05).
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }

  // Graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    server.log.info(`${signal} received, shutting down gracefully`);
    try {
      await server.close();
      await whatsappWorker.close();
      await disconnectRedis();
    } catch (err) {
      server.log.error({ err }, 'Error during shutdown');
    } finally {
      process.exit(0);
    }
  };

  // SIGUSR2: sinyal yang dipakai tsx watch saat hot-reload
  // Tanpa ini, module lama bisa "menggantung" dan menyebabkan cache stale
  process.once('SIGUSR2', () => gracefulShutdown('SIGUSR2'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

start();