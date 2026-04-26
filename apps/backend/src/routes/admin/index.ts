import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth';

import { dashboardRoutes } from './dashboard';
import { cansRoutes } from './cans';
import { officersRoutes } from './officers';
import { assignmentsRoutes } from './assignments';
import { collectionsRoutes } from './collections';
import { districtRoutes } from './district';
import { waRoutes } from './wa';

export default async function adminRoutes(fastify: FastifyInstance) {
  // Apply auth middleware to all routes in this plugin
  fastify.addHook('preHandler', authenticate);

  // Register all sub-routes
  await fastify.register(dashboardRoutes);
  await fastify.register(cansRoutes);
  await fastify.register(officersRoutes);
  await fastify.register(assignmentsRoutes);
  await fastify.register(collectionsRoutes);
  await fastify.register(districtRoutes);
  await fastify.register(waRoutes);
}
