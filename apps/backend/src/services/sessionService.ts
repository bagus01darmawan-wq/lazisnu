/**
 * Session Service — manajemen sesi login user.
 *
 * Fungsi:
 * - createSession: simpan sesi baru saat login/refresh
 * - getUserSessions: daftar sesi aktif user
 * - revokeSession: cabut 1 sesi
 * - revokeAllUserSessions: cabut semua sesi user kecuali yang dikecualikan
 * - updateSessionActivity: update last_used_at saat refresh
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, isNull } from 'drizzle-orm';

export interface CreateSessionInput {
  userId: string;
  jti: string;
  deviceLabel?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface SessionData {
  id: string;
  userId: string;
  jti: string;
  deviceLabel: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}

/**
 * Buat sesi baru.
 */
export async function createSession(input: CreateSessionInput): Promise<void> {
  await db.insert(schema.userSessions).values({
    userId: input.userId,
    jti: input.jti,
    deviceLabel: input.deviceLabel || null,
    userAgent: input.userAgent || null,
    ipAddress: input.ipAddress || null,
  });
}

/**
 * Dapatkan daftar sesi aktif milik user (belum di-revoke).
 */
export async function getUserSessions(userId: string): Promise<SessionData[]> {
  return db.select()
    .from(schema.userSessions)
    .where(and(
      eq(schema.userSessions.userId, userId),
      isNull(schema.userSessions.revokedAt),
    ))
    .orderBy(schema.userSessions.lastUsedAt)
    .then(rows => rows.map(r => ({
      id: r.id,
      userId: r.userId,
      jti: r.jti,
      deviceLabel: r.deviceLabel,
      userAgent: r.userAgent,
      ipAddress: r.ipAddress,
      lastUsedAt: r.lastUsedAt,
      createdAt: r.createdAt,
      revokedAt: r.revokedAt,
    })));
}

/**
 * Cabut 1 sesi (soft delete via revokedAt).
 * Returns false jika sesi tidak ditemukan atau sudah di-revoke.
 */
export async function revokeSession(sessionId: string, userId: string): Promise<boolean> {
  const [result] = await db.update(schema.userSessions)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(schema.userSessions.id, sessionId),
      eq(schema.userSessions.userId, userId),
      isNull(schema.userSessions.revokedAt),
    ))
    .returning();

  return !!result;
}

/**
 * Cabut semua sesi user, kecuali dengan jti tertentu (opsional).
 * Dipakai saat ganti password, atau "logout other devices".
 */
export async function revokeAllUserSessions(userId: string, exceptJti?: string): Promise<number> {
  const conditions = [
    eq(schema.userSessions.userId, userId),
    isNull(schema.userSessions.revokedAt),
  ];

  if (exceptJti) {
    throw new Error('revokeAllUserSessions with exceptJti not yet implemented');
  }

  const result = await db.update(schema.userSessions)
    .set({ revokedAt: new Date() })
    .where(and(...conditions))
    .returning();

  return result.length;
}

/**
 * Update last_used_at sesi (dipanggil saat refresh).
 */
export async function updateSessionActivity(jti: string): Promise<void> {
  await db.update(schema.userSessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.userSessions.jti, jti));
}
