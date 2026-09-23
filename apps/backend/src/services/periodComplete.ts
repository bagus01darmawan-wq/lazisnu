/**
 * Penutup periode PPK: tugas ACTIVE periode berjalan + ACTIVE kedaluwarsa
 * (< periode berjalan) menjadi UNCOLLECTED + satu baris audit.
 * Tanpa ini assignment lama abadi (tampil di daftar tapi semua aksi ditolak
 * kunci periode). Dipakai rute POST /mobile/periods/complete.
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { and, eq, lt, or } from 'drizzle-orm';
import { insertActivityLog } from './auditLogService';

export interface PeriodCompleteResult {
  period: string;
  skipped_count: number;
  expired_closed_count: number;
  message: string;
}

export async function completeOfficerPeriod(
  input: { officerId: string; userId: string | null; ipAddress: string | null; userAgent: string | null },
  now: Date = new Date(),
): Promise<PeriodCompleteResult> {
  const periodYear = now.getFullYear();
  const periodMonth = now.getMonth() + 1;
  const period = `${periodYear}-${String(periodMonth).padStart(2, '0')}`;

  const currentWhere = and(
    eq(schema.assignments.officerId, input.officerId),
    eq(schema.assignments.periodYear, periodYear),
    eq(schema.assignments.periodMonth, periodMonth),
    eq(schema.assignments.status, 'ACTIVE'),
  );
  const expiredWhere = and(
    eq(schema.assignments.officerId, input.officerId),
    eq(schema.assignments.status, 'ACTIVE'),
    or(
      lt(schema.assignments.periodYear, periodYear),
      and(eq(schema.assignments.periodYear, periodYear), lt(schema.assignments.periodMonth, periodMonth)),
    ),
  );

  const [activeCount, expiredCount] = await Promise.all([
    db.$count(schema.assignments, currentWhere),
    db.$count(schema.assignments, expiredWhere),
  ]);

  if (activeCount === 0 && expiredCount === 0) {
    return { period, skipped_count: 0, expired_closed_count: 0, message: 'Tidak ada kaleng yang perlu ditandai' };
  }

  const stamp = new Date();
  if (activeCount > 0) {
    await db.update(schema.assignments)
      .set({ status: 'UNCOLLECTED', updatedAt: stamp, completedAt: stamp })
      .where(currentWhere);
  }
  if (expiredCount > 0) {
    await db.update(schema.assignments)
      .set({ status: 'UNCOLLECTED', updatedAt: stamp, completedAt: stamp })
      .where(expiredWhere);
  }

  try {
    await insertActivityLog({
      userId: input.userId,
      officerId: input.officerId,
      actionType: 'PERIOD_COMPLETED',
      entityType: 'assignment',
      entityId: null,
      oldData: null,
      newData: { period, skipped_count: activeCount, expired_closed_count: expiredCount },
      ipAddress: input.ipAddress ?? 'period-complete',
      userAgent: input.userAgent,
    });
  } catch {
    // Audit tidak boleh menggagalkan tutup periode yang sah.
  }

  return {
    period,
    skipped_count: activeCount,
    expired_closed_count: expiredCount,
    message: expiredCount > 0
      ? `${activeCount} kaleng periode berjalan + ${expiredCount} kaleng kedaluwarsa ditandai tidak dijemput`
      : `${activeCount} kaleng ditandai tidak dijemput untuk periode berjalan`,
  };
}
