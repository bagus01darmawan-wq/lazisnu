/**
 * Metrics route — menyediakan endpoint Prometheus /metrics.
 *
 * prom-client sudah di-declare sebagai dependency (lihat 07-A3-1),
 * sehingga di-import sebagai ES module (bukan require dengan try/catch).
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import promClient from 'prom-client';

promClient.collectDefaultMetrics();
export const register = promClient.register;

// Custom HTTP metrics — di-observe di onResponse hook (lihat app.ts).
// Naming mengikuti konvensi Prometheus: _seconds / _ms suffix untuk unit.
// Alert rule HighHttpErrorRate (prometheus/alert.rules.yml) sudah query
// metric ini dengan label `statusCode` (sesuai keputusan Sesi 30).
export const httpRequestDurationMs = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'statusCode'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
});

export const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'statusCode'],
});

export async function metricsRoutes(fastify: FastifyInstance) {
  fastify.get('/metrics', {
    schema: {
      tags: ['System'],
      summary: 'Prometheus metrics endpoint',
      hide: true,
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const metrics = await register.metrics();
    return reply
      .header('Content-Type', register.contentType)
      .send(metrics);
  });
}
