import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth';
import { tasksRoutes } from './tasks';
import { collectionsRoutes } from './collections';
import { syncRoutes } from './sync';
import { profileRoutes } from './profile';

export async function mobileRoutes(fastify: FastifyInstance) {
  // Apply auth middleware to all routes
  fastify.addHook('preHandler', authenticate);

  // Register sub-routes
  await fastify.register(tasksRoutes);
  await fastify.register(collectionsRoutes);
  await fastify.register(syncRoutes);
  await fastify.register(profileRoutes);
}
