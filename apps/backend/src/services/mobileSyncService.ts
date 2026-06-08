/**
 * Mobile Sync Service — batch sync logic untuk offline collections.
 *
 * Dipanggil dari route POST /v1/mobile/collections/batch.
 * Menangani loop per item, duplicate check offline_id, transaction submit,
 * dan error classification berbasis AppError.code (bukan string matching).
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq } from 'drizzle-orm';
import { validateAssignmentForSubmit, submitCollection } from './collectionSubmission';
import { getErrorMessage } from '../utils/error-guards';
import { isAppError } from '../utils/AppError';

/** Satu item batch dari request mobile */
export interface BatchCollectionItem {
  offline_id: string;
  assignment_id: string;
  can_id: string;
  nominal: number;
  payment_method: 'CASH' | 'TRANSFER';
  collected_at: string;
  latitude?: number;
  longitude?: number;
}

/** Hasil per item dalam batch */
export interface BatchItemResult {
  offline_id: string;
  server_id?: string;
  status: 'COMPLETED' | 'ALREADY_SYNCED' | 'FAILED';
  error?: string;
  error_code?: string;
  error_type?: 'VALIDATION' | 'SERVER';
  can_retry?: boolean;
}

/** Hasil akhir batch sync */
export interface BatchSyncResult {
  total: number;
  succeeded: number;
  failed: number;
  results: BatchItemResult[];
}

/**
 * Klasifikasikan error hasil catch menjadi status FAILED item.
 * Pakai AppError.code (structured) — bukan string matching ke message.
 */
function classifySyncError(err: unknown): Pick<BatchItemResult, 'error' | 'error_code' | 'error_type' | 'can_retry'> {
  const message = getErrorMessage(err, 'Gagal sinkronisasi koleksi');
  const isValidation = isAppError(err) && !err.isRetryable
    && err.code !== 'WA_SEND_FAILED'
    && err.code !== 'INTERNAL_ERROR';

  return {
    error: message,
    error_code: isAppError(err) ? err.code : 'UNKNOWN',
    error_type: isValidation ? 'VALIDATION' : 'SERVER',
    can_retry: !isValidation,
  };
}

/**
 * Proses satu item batch: duplicate check → transaction submit.
 */
async function processSyncItem(
  item: BatchCollectionItem,
  officerId: string,
): Promise<BatchItemResult> {
  // Duplicate check: offline_id sudah ada di DB
  const existing = await db.query.collections.findFirst({
    where: eq(schema.collections.offlineId, item.offline_id),
  });

  if (existing) {
    return {
      offline_id: item.offline_id,
      server_id: existing.id,
      status: 'ALREADY_SYNCED',
    };
  }

  // Transaction: validate assignment + submit collection
  const collection = await db.transaction(async (tx) => {
    await validateAssignmentForSubmit(tx, item.assignment_id, item.can_id, officerId);

    return await submitCollection(tx, {
      assignmentId: item.assignment_id,
      canId: item.can_id,
      officerId,
      nominal: item.nominal,
      paymentMethod: item.payment_method,
      collectedAt: new Date(item.collected_at),
      latitude: item.latitude?.toString(),
      longitude: item.longitude?.toString(),
      offlineId: item.offline_id,
    });
  });

  return {
    offline_id: item.offline_id,
    server_id: collection.id,
    status: 'COMPLETED',
  };
}

/**
 * Batch sync — iterasi semua item, tangkap error per item,
 * kembalikan summary + detail per item.
 */
export async function syncCollectionsBatch(
  items: BatchCollectionItem[],
  officerId: string,
): Promise<BatchSyncResult> {
  const results: BatchItemResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const result = await processSyncItem(item, officerId);
      results.push(result);
      succeeded++;
    } catch (err) {
      const classification = classifySyncError(err);
      const isValidation = classification.error_type === 'VALIDATION';

      results.push({
        offline_id: item.offline_id,
        status: 'FAILED',
        ...classification,
      });

      if (isValidation) {
        succeeded++; // validation error dihitung selesai (tidak perlu retry)
      } else {
        failed++;
      }
    }
  }

  return { total: items.length, succeeded, failed, results };
}
