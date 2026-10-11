// Main Server Entry Point - Lazisnu Backend
import { config, isDevelopment, whatsappWorkerEnabled } from './config/env';
import { disconnectRedis } from './config/redis';
import { buildApp } from './app';

// Worker WhatsApp hanya hidup di produksi/staging (lihat config/env.ts).
// Di dev proses API tidak memproses notifikasi WhatsApp — dan yang lebih
// penting, tidak ada pemanggilan Redis berulang dari worker. Mesin dev sering
// menunjuk ke Redis berkuota (Upstash); polling worker saja cukup menghabiskan
// kuota 500.000/bulan dalam beberapa jam.
// Untuk mengaktifkan saat dev: WHATSAPP_WORKER_ENABLED=true.
let whatsappWorker: { close: () => Promise<void> } | null = null;

// Start server
async function start() {
  const server = await buildApp();

  try {
    server.log.info('Connected to PostgreSQL database via Drizzle');

    // Start listening
    await server.listen({ port: parseInt(config.PORT), host: '0.0.0.0' });
    server.log.info(`Server running on port ${config.PORT}`);

    if (whatsappWorkerEnabled) {
      const { whatsappWorker: worker } = await import('./workers/whatsapp.worker.js');
      whatsappWorker = worker;
      server.log.info('WhatsApp worker aktif');
    } else if (isDevelopment) {
      server.log.info(
        'WhatsApp worker dimatikan (mode development). Notifikasi WhatsApp ' +
        'tidak diproses — set WHATSAPP_WORKER_ENABLED=true bila memang perlu diuji.'
      );
    }

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
      await whatsappWorker?.close();
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