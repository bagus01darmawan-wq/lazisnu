import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

/**
 * Mendapatkan subquery condition untuk mencari koleksi dengan submit_sequence tertinggi (is_latest=true)
 */
export function getLatestCollectionCondition() {
  const c2 = alias(schema.collections, 'c2');
  return eq(
    schema.collections.submitSequence,
    db.select({ maxSeq: sql<number>`max(${c2.submitSequence})` })
      .from(c2)
      .where(and(
        eq(c2.assignmentId, schema.collections.assignmentId),
        eq(c2.canId, schema.collections.canId)
      ))
  );
}

/**
 * Validasi apakah assignment aktif, valid, dan dimiliki oleh officer
 */
export async function validateAssignmentForSubmit(
  tx: any,
  assignmentId: string,
  canId: string,
  officerId: string
) {
  const assignment = await tx.query.assignments.findFirst({
    where: and(
      eq(schema.assignments.id, assignmentId),
      eq(schema.assignments.officerId, officerId),
      eq(schema.assignments.status, 'ACTIVE')
    ),
  });

  if (!assignment) {
    throw new Error('Assignment tidak valid, bukan milik Anda, atau sudah selesai');
  }
  if (assignment.canId !== canId) {
    throw new Error('can_id tidak sesuai dengan assignment');
  }
  
  return assignment;
}

/**
 * Melakukan submit koleksi infaq (insert collection + update assignment + update can)
 */
export async function submitCollection(
  tx: any,
  data: {
    assignmentId: string;
    canId: string;
    officerId: string;
    nominal: number;
    paymentMethod: 'CASH' | 'TRANSFER';
    transferReceiptUrl?: string | null;
    collectedAt: Date;
    latitude?: string | null;
    longitude?: string | null;
    offlineId?: string | null;
    deviceInfo?: any;
  }
) {
  const [collection] = await tx.insert(schema.collections).values({
    assignmentId: data.assignmentId,
    canId: data.canId,
    officerId: data.officerId,
    nominal: BigInt(data.nominal),
    paymentMethod: data.paymentMethod,
    transferReceiptUrl: data.transferReceiptUrl,
    collectedAt: data.collectedAt,
    submittedAt: new Date(),
    syncedAt: new Date(),
    syncStatus: 'COMPLETED',
    serverTimestamp: new Date(),
    deviceInfo: data.deviceInfo,
    latitude: data.latitude,
    longitude: data.longitude,
    offlineId: data.offlineId,
  }).returning();

  await tx.update(schema.assignments)
    .set({ status: 'COMPLETED', completedAt: new Date() })
    .where(eq(schema.assignments.id, data.assignmentId));

  await tx.update(schema.cans).set({
    lastCollectedAt: data.collectedAt,
    totalCollected: sql`${schema.cans.totalCollected} + ${BigInt(data.nominal)}`,
    collectionCount: sql`${schema.cans.collectionCount} + 1`
  }).where(eq(schema.cans.id, data.canId));

  return collection;
}
