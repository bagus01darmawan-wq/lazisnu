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
import { bendaharaRoutes } from './routes/bendahara';
import { schedulerRoutes } from './routes/scheduler';
import { healthRoutes } from './routes/health';
import { metricsRoutes } from './routes/metrics';
import { correlationIdHook } from './middleware/correlationId';
import { auditLogger } from './middleware/audit-logger';
import { initSentry } from './config/sentry';
import { AppError, isAppError } from './utils/AppError';
import { isJwtErrorLike } from './utils/error-guards';
import { z } from 'zod';

export async function buildApp() {
  // Inisialisasi Sentry (no-op jika SENTRY_DSN tidak diset)
  initSentry();

  const server = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  // Paling awal: correlation ID untuk semua request
  server.addHook('onRequest', correlationIdHook);

  // Plugins
  await server.register(cors, {
    origin: config.NODE_ENV === 'development' ? true : config.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  });

  await server.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
  });

  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: (request, context) => {
      return {
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Terlalu banyak permintaan, silakan coba lagi nanti',
        }
      };
    }
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

  // Error handler — satu pintu final untuk semua error
  server.setErrorHandler((error, request, reply) => {
    // Log internal detail
    if (process.env.NODE_ENV === 'test') {
      process.stderr.write(`[TEST] Error: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    } else {
      server.log.error({ err: error, requestId: request.id }, 'Unhandled error');
    }

    // 1. AppError domain error — kirim code + message
    if (isAppError(error)) {
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined && { details: error.details }),
        },
      });
    }

    // 2. Zod validation error
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Input tidak valid',
          details: error.errors,
        },
      });
    }

    // 3. Fastify schema validation
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

    // 4. JWT error
    if (isJwtErrorLike(error)) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Token tidak valid atau expired',
        },
      });
    }

    // 5. Unknown error — sanitize: log detail di server, response generik
    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Terjadi kesalahan server',
      },
    });
  });

  // Routes
  await server.register(healthRoutes);
  await server.register(metricsRoutes);
  await server.register(authRoutes, { prefix: '/v1/auth' });
  await server.register(mobileRoutes, { prefix: '/v1/mobile' });
  await server.register(adminRoutes, { prefix: '/v1/admin' });
  await server.register(bendaharaRoutes, { prefix: '/v1/bendahara' });
  await server.register(schedulerRoutes, { prefix: '/v1/scheduler' });

  return server;
}
