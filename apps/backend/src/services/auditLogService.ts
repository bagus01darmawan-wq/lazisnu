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

/**
 * Lebar kolom `activity_logs.ip_address` = varchar(45).
 *
 * Nilai yang lebih panjang DITOLAK PostgreSQL (SQLSTATE 22001) dan **seluruh
 * baris audit hilang** — terbukti di staging 30 Okt 2026: satu header
 * `X-Forwarded-For` sepanjang 56 karakter membuat `FAILED_LOGIN` dan
 * `AUTH_FAILED` sama-sama gagal disimpan, tanpa error ke pengguna.
 * Rincian: docs/rencana-penyelidikan-trustproxy-2026-10-30.md (temuan E7).
 *
 * Sengaja HANYA memotong, tidak memilih entri mana pun dari daftar ber-koma:
 * memilih entri pertama berarti mengabadikan nilai yang bisa dikarang klien.
 * Setelah `trustProxy` aktif, nilai yang masuk selalu satu alamat, sehingga
 * pemotongan ini murni jaring pengaman.
 */
const IP_ADDRESS_MAX_LENGTH = 45;

function clampIpAddress(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, IP_ADDRESS_MAX_LENGTH);
}

export async function insertActivityLog(input: AuditLogInput, client: any = db): Promise<void> {
  await client.insert(schema.activityLogs).values({
    userId: input.userId,
    officerId: input.officerId,
    actionType: input.actionType,
    entityType: input.entityType,
    entityId: input.entityId,
    requestId: input.requestId || null,
    oldData: sanitizeAuditData(input.oldData) || null,
    newData: sanitizeAuditData(input.newData) || null,
    ipAddress: clampIpAddress(input.ipAddress),
    userAgent: input.userAgent,
  });
}
