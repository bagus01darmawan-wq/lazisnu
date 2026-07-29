import { FastifyRequest, FastifyReply } from 'fastify';
import { insertActivityLog } from '../services/auditLogService';

/**
 * Global Audit Logger Middleware
 * Logs all mutation requests (POST, PUT, PATCH, DELETE) that return success,
 * plus security events (401, 403 FORBIDDEN_SCOPE).
 *
 * Security events logged:
 * - 401 → AUTH_FAILED
 * - 403 with FORBIDDEN_SCOPE code → OWNERSHIP_DENIED
 */
export async function auditLogger(request: FastifyRequest, reply: FastifyReply) {
  const user = request.currentUser;
  const isAuthenticated = !!user;

  // === Jalur 1: Audit security events (unauthenticated or auth failed) ===
  if (reply.statusCode === 401) {
    await insertAuditLog({
      request,
      userId: user?.userId || null,
      officerId: user?.officerId || null,
      actionType: 'AUTH_FAILED',
      entityType: 'auth',
      entityId: null,
      ipAddress: (request.headers['x-forwarded-for'] as string) || request.ip,
      userAgent: request.headers['user-agent'] || null,
    });
    return;
  }

  // 403 — security/permission denied (ownership or access forbidden)
  if (reply.statusCode === 403) {
    const auditCode = (reply as any)._auditCode;
    const actionType = auditCode === 'FORBIDDEN_SCOPE' ? 'OWNERSHIP_DENIED' : 'AUTH_FAILED';
    await insertAuditLog({
      request,
      userId: user?.userId || null,
      officerId: user?.officerId || null,
      actionType,
      entityType: inferEntity(request.url),
      entityId: (request.params as any)?.id || null,
      ipAddress: (request.headers['x-forwarded-for'] as string) || request.ip,
      userAgent: request.headers['user-agent'] || null,
    });
    return;
  }

  // === Jalur 2: Mutation success audit (existing behavior) ===
  const mutationMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutationMethods.includes(request.method) || reply.statusCode >= 400) {
    return;
  }

  if (!isAuthenticated) {
    return;
  }

  // Skip auth routes (except sessions; logout is manually logged inside the route)
  if (request.url.startsWith('/v1/auth') && !request.url.includes('sessions')) {
    return;
  }

  try {
    const actionType = `${request.method} ${request.routeOptions.url || request.url}`;
    const entityType = inferEntity(request.url);
    const entityId = (request.params as any)?.id || null;

    await insertAuditLog({
      request,
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
    request.log.error({ err: error }, 'Audit Logger Error');
  }
}

interface AuditLogInput {
  request: FastifyRequest;
  userId: string | null;
  officerId: string | null;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  oldData?: unknown;
  newData?: unknown;
  ipAddress: string;
  userAgent: string | null;
}

async function insertAuditLog(input: AuditLogInput) {
  try {
    await insertActivityLog({
      userId: input.userId,
      officerId: input.officerId,
      actionType: input.actionType,
      entityType: input.entityType,
      entityId: input.entityId,
      requestId: input.request.id?.toString() || null,
      oldData: input.oldData,
      newData: input.newData,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  } catch (error) {
    input.request.log.error({ err: error }, 'Audit Logger Insert Failed');
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
