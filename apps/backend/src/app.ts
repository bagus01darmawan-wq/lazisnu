import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config/env';
import { authRoutes } from './routes/auth';
import { mobileRoutes } from './routes/mobile';
import adminRoutes from './routes/admin';
import auditRoutes from './routes/admin/audit';
import { bendaharaRoutes } from './routes/bendahara';
import { schedulerRoutes } from './routes/scheduler';
import { auditLogger } from './middleware/audit-logger';

export async function buildApp() {
  const server = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  // Plugins
  await server.register(cors, {
    origin: config.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  });

  await server.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
  });

  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => {
      const error = new Error(`Terlalu banyak request. Coba lagi dalam ${context.after}.`);
      (error as Error & { statusCode?: number; code?: string }).statusCode = context.ban ? 403 : 429;
      (error as Error & { statusCode?: number; code?: string }).code = 'RATE_LIMITED';
      return error;
    },
  });

  if (config.NODE_ENV !== 'production' && config.NODE_ENV !== 'test') {
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

  server.addHook('onResponse', auditLogger);

  // Error handler
  server.setErrorHandler((error, request, reply) => {
    if (process.env.NODE_ENV === 'test') {
      console.error('Test Error Handler Captured:', error);
    } else {
      server.log.error(error);
    }

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

  // Routes
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date() }));
  await server.register(authRoutes, { prefix: '/v1/auth' });
  await server.register(mobileRoutes, { prefix: '/v1/mobile' });
  await server.register(adminRoutes, { prefix: '/v1/admin' });
  await server.register(auditRoutes, { prefix: '/v1/admin' });
  await server.register(bendaharaRoutes, { prefix: '/v1/bendahara' });
  await server.register(schedulerRoutes, { prefix: '/v1/scheduler' });

  return server;
}
