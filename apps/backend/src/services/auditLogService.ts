import { db } from '../config/database';
import * as schema from '../database/schema';

export interface AuditLogInput {
  userId: string | null;
  officerId: string | null;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  requestId?: string | null;
  oldData?: unknown;
  newData?: unknown;
  ipAddress: string;
  userAgent: string | null;
}

export function sanitizeAuditData(data: unknown): unknown {
  if (data === null || data === undefined) return data;

  // Kolom drizzle ber-mode 'bigint' (mis. cans.total_collected, collections.nominal)
  // menghasilkan JS BigInt yang membuat JSON.stringify meledak saat insert ke jsonb.
  if (typeof data === 'bigint') return Number(data);

  if (Array.isArray(data)) {
    return data.map(sanitizeAuditData);
  }
  
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = new Set([
      'password',
      'password_hash',
      'passwordhash',
      'access_token',
      'accesstoken',
      'refresh_token',
      'refreshtoken',
      'token',
      'jwt',
      'secret',
      'authorization',
      'otp',
      'private_key',
      'privatekey'
    ]);
    
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.has(lowerKey)) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = sanitizeAuditData(obj[key]);
        }
      }
    }
    return sanitized;
  }
  
  return data;
}

export async function insertActivityLog(input: AuditLogInput): Promise<void> {
  await db.insert(schema.activityLogs).values({
    userId: input.userId,
    officerId: input.officerId,
    actionType: input.actionType,
    entityType: input.entityType,
    entityId: input.entityId,
    requestId: input.requestId || null,
    oldData: sanitizeAuditData(input.oldData) || null,
    newData: sanitizeAuditData(input.newData) || null,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
}
