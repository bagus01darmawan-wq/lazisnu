/**
 * Health / Readiness routes — memisahkan liveness dan readiness.
 *
 * - GET /health/live : proses hidup (selalu 200)
 * - GET /health/ready : service siap layani (cek DB + Redis ping)
 * - GET /health       : backward-compat alias ke /health/live
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../config/database';
import { sql } from 'drizzle-orm';
import { redisConnection } from '../config/redis';

interface HealthCheckResult {
  db: string;
  redis: string;
}

export async function healthRoutes(fastify: FastifyInstance) {
  // GET /health/live — liveness: proses hidup
  fastify.get('/health/live', {
    schema: {
      tags: ['System'],
      summary: 'Liveness check — selalu return 200 jika proses hidup',
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      success: true,
      status: 'alive',
      timestamp: new Date().toISOString(),
    });
  });

  // GET /health — backward-compat alias ke /health/live
  fastify.get('/health', {
    schema: {
      tags: ['System'],
      summary: 'Health check (backward compat)',
      hide: true,
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date(),
    });
  });

  // GET /health/ready — readiness: dependency check
  fastify.get('/health/ready', {
    schema: {
      tags: ['System'],
      summary: 'Readiness check — cek DB dan Redis ping',
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const checks: HealthCheckResult = { db: 'pending', redis: 'pending' };
    const errors: string[] = [];

    // Cek DB
    try {
      await db.execute<{ 1: number }>(sql`SELECT 1`);
      checks.db = 'ok';
    } catch (err: unknown) {
      checks.db = 'down';
      errors.push(`db: ${err instanceof Error ? err.message : 'unknown error'}`);
    }

    // Cek Redis
    try {
      await redisConnection.ping();
      checks.redis = 'ok';
    } catch (err: unknown) {
      checks.redis = 'down';
      errors.push(`redis: ${err instanceof Error ? err.message : 'unknown error'}`);
    }

    const allOk = checks.db === 'ok' && checks.redis === 'ok';

    if (!allOk) {
      return reply.status(503).send({
        success: false,
        status: 'not_ready',
        checks,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date().toISOString(),
      });
    }

    return reply.status(200).send({
      success: true,
      status: 'ready',
      checks,
      timestamp: new Date().toISOString(),
    });
  });
}
