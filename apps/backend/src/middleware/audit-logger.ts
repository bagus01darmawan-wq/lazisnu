import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../config/database';
import * as schema from '../database/schema';

/**
 * Global Audit Logger Middleware
 * Logs all mutation requests (POST, PUT, PATCH, DELETE) that return success.
 */
export async function auditLogger(request: FastifyRequest, reply: FastifyReply) {
  // Only log mutations and successful responses
  const mutationMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutationMethods.includes(request.method) || reply.statusCode >= 400) {
    return;
  }

  // Only log if user is authenticated
  const user = request.currentUser;
  if (!user) {
    return;
  }

  // Skip auth routes (except logout)
  if (request.url.startsWith('/v1/auth') && !request.url.includes('logout')) {
    return;
  }

  try {
    const actionType = `${request.method} ${request.routeOptions.url || request.url}`;
    const entityType = inferEntity(request.url);
    const entityId = (request.params as any)?.id || null;

    // Async log to DB (don't await to finish before sending response, but we are in onResponse hook anyway)
    await db.insert(schema.activityLogs).values({
      userId: user.userId,
      officerId: user.officerId || null,
      actionType,
      entityType,
      entityId,
      oldData: request.auditContext?.oldData || null,
      newData: request.auditContext?.newData || null,
      ipAddress: (request.headers['x-forwarded-for'] as string) || request.ip,
      userAgent: request.headers['user-agent'] || null,
    });
  } catch (error) {
    // Log error but don't crash the server since the response is already sent or being sent
    console.error('Audit Logger Error:', error);
  }
}

/**
 * Infer entity type from URL path
 */
function inferEntity(url: string): string {
  const parts = url.split('/').filter(p => p && p !== 'v1' && p !== 'mobile' && p !== 'admin');
  if (parts.length === 0) return 'system';
  
  // Example: /v1/mobile/collections/uuid -> parts: [collections, uuid] -> returns collections
  // Handle pluralization/normalization if needed
  const entity = parts[0].split('?')[0]; // strip query params
  return entity;
}

export default auditLogger;
