/**
 * Collection Correction Service — orchestration untuk koreksi koleksi (resubmit).
 *
 * Menyatukan duplikasi orchestration antara route admin/collections.ts
 * dan mobile/collections.ts:
 *   - db.transaction wrapper
 *   - insert activityLogs
 *   - error mapping (via AppError, dilakukan di route)
 *
 * Core logic `resubmitCollection()` tetap di collectionSubmission.ts.
 * Service ini hanya menangani orchestration (tx + audit log).
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { resubmitCollection } from './collectionSubmission';
import type { InferSelectModel } from 'drizzle-orm';

type Can = InferSelectModel<typeof schema.cans>;
type Collection = InferSelectModel<typeof schema.collections>;

export interface CorrectionInput {
  collectionId: string;
  nominal: number;
  alasanResubmit: string;
  paymentMethod?: 'CASH' | 'TRANSFER';
  requiredOfficerId?: string;
  requiredBranchId?: string;
}

export interface CorrectionContext {
  userId: string;
  officerId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CorrectionResult {
  oldCollection: Collection & { can: Can | null };
  newCollection: Collection;
}

/**
 * Jalankan koreksi koleksi dalam satu transaksi:
 * 1. resubmitCollection (core immutable insert + aggregate update)
 * 2. insert activityLogs
 */
export async function correctCollection(
  input: CorrectionInput,
  ctx: CorrectionContext,
): Promise<CorrectionResult> {
  return db.transaction(async (tx) => {
    const { oldCollection, newCollection } = await resubmitCollection(tx, {
      collectionId: input.collectionId,
      nominal: input.nominal,
      alasanResubmit: input.alasanResubmit,
      paymentMethod: input.paymentMethod,
      requiredOfficerId: input.requiredOfficerId,
      requiredBranchId: input.requiredBranchId,
    });

    await tx.insert(schema.activityLogs).values({
      userId: ctx.userId,
      officerId: ctx.officerId || null,
      actionType: 'RESUBMIT_COLLECTION',
      entityType: 'collections',
      entityId: newCollection.id,
      oldData: oldCollection as any,
      newData: newCollection as any,
      ipAddress: ctx.ipAddress || null,
      userAgent: ctx.userAgent || null,
    });

    return { oldCollection, newCollection };
  });
}
