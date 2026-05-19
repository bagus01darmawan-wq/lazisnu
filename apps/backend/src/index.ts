// Main Server Entry Point - Lazisnu Backend
import { config } from './config/env';
import { disconnectRedis } from './config/redis';
import { buildApp } from './app';
import './workers/whatsapp.worker'; // Initialize WhatsApp worker
import { schedulerWorker, registerMonthlyAssignmentCron } from './workers/scheduler.worker'; // Initialize Scheduler worker

// Start server
async function start() {
  const server = await buildApp();
  
  try {
    server.log.info('Connected to PostgreSQL database via Drizzle');

    // Start listening
    await server.listen({ port: parseInt(config.PORT), host: '0.0.0.0' });
    server.log.info(`Server running on port ${config.PORT}`);

    // Register BullMQ cron jobs (after server starts)
    if (config.NODE_ENV !== 'test') {
      await registerMonthlyAssignmentCron();
    }
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }

  // Graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    server.log.info(`${signal} received, shutting down gracefully`);
    await server.close();
    await schedulerWorker.close();
    await disconnectRedis();
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

start();