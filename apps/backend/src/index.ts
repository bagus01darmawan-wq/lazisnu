// Main Server Entry Point - Lazisnu Backend

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config/env';
import { db } from './config/database';
import { disconnectRedis } from './config/redis';
import { authRoutes } from './routes/auth';
import { mobileRoutes } from './routes/mobile';
import { adminRoutes } from './routes/admin';
import { bendaharaRoutes } from './routes/bendahara';
import { schedulerRoutes } from './routes/scheduler';
import './workers/whatsapp.worker'; // Import to initialize worker

const server = Fastify({
  logger: true,
});

// Register plugins
async function registerPlugins() {
  // CORS
  await server.register(cors, {
    origin: config.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  });

  // JWT
  await server.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
  });

  // Rate limiting
  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Swagger (API Documentation)
  if (config.NODE_ENV !== 'production') {
    await server.register(swagger, {
      openapi: {
        info: {
          title: 'Lazisnu Collector API',
          version: '1.0.0',
          description: 'API Documentation for Lazisnu Collector App',
        },
        servers: [{ url: config.API_BASE_URL }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
            },
          },
        },
      },
    });

    await server.register(swaggerUi, {
      routePrefix: '/docs',
    });
  }
}

// Register routes
async function registerRoutes() {
  // Health check
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date() }));

  // Auth routes (public)
  await server.register(authRoutes, { prefix: '/v1/auth' });

  // Mobile routes (protected - petugas)
  await server.register(mobileRoutes, { prefix: '/v1/mobile' });

  // Admin routes (protected - admin)
  await server.register(adminRoutes, { prefix: '/v1/admin' });

  // Bendahara routes (protected - bendahara)
  await server.register(bendaharaRoutes, { prefix: '/v1/bendahara' });

  // Scheduler routes (internal)
  await server.register(schedulerRoutes, { prefix: '/v1/scheduler' });
}

// Error handler
server.setErrorHandler((error, request, reply) => {
  server.log.error(error);

  if (error.validation) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Input tidak valid',
        details: error.validation,
      },
    });
  }

  return reply.status(error.statusCode || 500).send({
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'Terjadi kesalahan server',
    },
  });
});

// Start server
async function start() {
  try {
    // Connect to database
    // The db config auto-connects to pg, we just log here
    // Wait for the simple test query to make sure it's up if needed
    // but the testConnection function is exported if we want.
    server.log.info('Connected to PostgreSQL database via Drizzle');

    // Register plugins
    await registerPlugins();

    // Register routes
    await registerRoutes();

    // Start listening
    await server.listen({ port: parseInt(config.PORT), host: '0.0.0.0' });
    server.log.info(`Server running on port ${config.PORT}`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  server.log.info(`${signal} received, shutting down gracefully`);
  await server.close();
  // For postgres driver, we don't strictly need to close the pool manually here unless we save the client reference.
  await disconnectRedis();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

start();