import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth';

import { dashboardRoutes } from './dashboard';
import { cansRoutes } from './cans';
import { officersRoutes } from './officers';
import { assignmentsRoutes } from './assignments';
import { dukuhsRoutes } from './dukuhs';
import { districtRoutes } from './district';
import { waRoutes } from './wa';
import { auditRoutes } from './audit';
import { backupRoutes } from './backup';

import { canProposalsRoutes } from './canProposals';
import { periodDraftsRoutes } from './periodDrafts';
import { branchSubmissionsRoutes } from './branchSubmissions';
import { signaturesRoutes } from './signatures';

export default async function adminRoutes(fastify: FastifyInstance) {
  // Apply auth middleware to all routes in this plugin
  fastify.addHook('preHandler', authenticate);

  // Register all sub-routes
  await fastify.register(dukuhsRoutes);
  await fastify.register(dashboardRoutes);
  await fastify.register(cansRoutes);
  await fastify.register(canProposalsRoutes);
  await fastify.register(officersRoutes);
  await fastify.register(assignmentsRoutes);
  await fastify.register(districtRoutes);
  await fastify.register(waRoutes);
  await fastify.register(auditRoutes);
  await fastify.register(backupRoutes);
  await fastify.register(periodDraftsRoutes);
  await fastify.register(branchSubmissionsRoutes);
  await fastify.register(signaturesRoutes);
}
