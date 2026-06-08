/**
 * Metrics route — menyediakan endpoint Prometheus /metrics.
 *
 * Menggunakan prom-client jika terinstall, fallback ke metrics minimal
 * jika package tidak tersedia.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

let metricsEnabled = false;
let register: any = null;

try {
  const promClient = require('prom-client');
  promClient.collectDefaultMetrics();
  register = promClient.register;
  metricsEnabled = true;
  console.log('✅ Prometheus metrics enabled');
} catch {
  console.warn('⚠️ prom-client not installed, metrics disabled');
}

export async function metricsRoutes(fastify: FastifyInstance) {
  fastify.get('/metrics', {
    schema: {
      tags: ['System'],
      summary: 'Prometheus metrics endpoint',
      hide: true,
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!metricsEnabled || !register) {
      return reply.status(501).send({
        success: false,
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Metrics belum diaktifkan (install prom-client)',
        },
      });
    }

    const metrics = await register.metrics();
    return reply
      .header('Content-Type', register.contentType)
      .send(metrics);
  });
}
