import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, sql, ExtractTablesWithRelations } from 'drizzle-orm';
import { alias, PgTransaction } from 'drizzle-orm/pg-core';

type Transaction = PgTransaction<
  any,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

type PaymentMethod = 'CASH' | 'TRANSFER';

type ResubmitCollectionInput = {
  collectionId: string;
  nominal: number;
  alasanResubmit: string;
  paymentMethod?: PaymentMethod;
  requiredOfficerId?: string;
  requiredBranchId?: string;
};

/**
 * Latest collection policy:
 * - collections are immutable financial records;
 * - correction/resubmit MUST INSERT a new row;
 * - the current/latest row is the row with MAX(submit_sequence)
 *   for the same assignment_id + can_id pair.
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
 * Validasi apakah assignment aktif, valid, dan dimiliki oleh officer.
 */
export async function validateAssignmentForSubmit(
  tx: Transaction,
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

async function assertNoExistingFirstSubmit(
  tx: Transaction,
  assignmentId: string,
  canId: string
) {
  const existing = await tx.query.collections.findFirst({
    where: and(
      eq(schema.collections.assignmentId, assignmentId),
      eq(schema.collections.canId, canId),
      eq(schema.collections.submitSequence, 1)
    ),
    columns: { id: true },
  });

  if (existing) {
    throw new Error('QR_ALREADY_SUBMITTED');
  }
}

/**
 * Melakukan submit koleksi pertama (insert collection + update assignment + update can).
 *
 * Catatan: submit pertama selalu submit_sequence = 1. Koreksi/resubmit tidak boleh
 * memakai fungsi ini; gunakan resubmitCollection() agar sequence dan audit nominal
 * tetap konsisten.
 */
export async function submitCollection(
  tx: Transaction,
  data: {
    assignmentId: string;
    canId: string;
    officerId: string;
    nominal: number;
    paymentMethod: PaymentMethod;
    transferReceiptUrl?: string | null;
    collectedAt: Date;
    latitude?: string | null;
    longitude?: string | null;
    offlineId?: string | null;
    deviceInfo?: any;
  }
) {
  await assertNoExistingFirstSubmit(tx, data.assignmentId, data.canId);

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
    submitSequence: 1,
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

/**
 * Melakukan koreksi koleksi secara immutable: insert versi baru dengan
 * submit_sequence + 1 lalu update agregat kaleng berdasarkan selisih nominal.
 */
export async function resubmitCollection(
  tx: Transaction,
  input: ResubmitCollectionInput
) {
  const oldCollection = await tx.query.collections.findFirst({
    where: eq(schema.collections.id, input.collectionId),
    with: { can: true },
  });

  if (!oldCollection) {
    throw new Error('COLLECTION_NOT_FOUND');
  }

  if (input.requiredOfficerId && oldCollection.officerId !== input.requiredOfficerId) {
    throw new Error('COLLECTION_NOT_FOUND');
  }

  if (input.requiredBranchId && oldCollection.can?.branchId !== input.requiredBranchId) {
    throw new Error('FORBIDDEN');
  }

  const [latestRecord] = await tx.select({ maxSeq: sql<number>`max(${schema.collections.submitSequence})` })
    .from(schema.collections)
    .where(and(
      eq(schema.collections.assignmentId, oldCollection.assignmentId),
      eq(schema.collections.canId, oldCollection.canId)
    ));

  const latestSequence = Number(latestRecord?.maxSeq || 0);
  if (oldCollection.submitSequence !== latestSequence) {
    throw new Error('NOT_LATEST');
  }

  const nextSequence = latestSequence + 1;
  const newNominal = BigInt(input.nominal);
  const [newCollection] = await tx.insert(schema.collections).values({
    assignmentId: oldCollection.assignmentId,
    canId: oldCollection.canId,
    officerId: oldCollection.officerId,
    nominal: newNominal,
    paymentMethod: input.paymentMethod ?? oldCollection.paymentMethod,
    collectedAt: oldCollection.collectedAt,
    submittedAt: new Date(),
    syncedAt: new Date(),
    syncStatus: 'COMPLETED',
    serverTimestamp: new Date(),
    submitSequence: nextSequence,
    alasanResubmit: input.alasanResubmit,
    deviceInfo: oldCollection.deviceInfo,
    latitude: oldCollection.latitude,
    longitude: oldCollection.longitude,
    offlineId: oldCollection.offlineId ? `${oldCollection.offlineId}-rev-${nextSequence}` : null,
  }).returning();

  const diff = newNominal - oldCollection.nominal;
  await tx.update(schema.cans).set({
    totalCollected: sql`${schema.cans.totalCollected} + ${diff}`,
    updatedAt: new Date()
  }).where(eq(schema.cans.id, oldCollection.canId));

  return { oldCollection, newCollection };
}
