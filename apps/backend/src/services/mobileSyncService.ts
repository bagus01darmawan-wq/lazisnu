/**
 * Mobile Sync Service — batch sync logic untuk offline collections.
 *
 * Dipanggil dari route POST /v1/mobile/collections/batch.
 * Menangani loop per item, duplicate check offline_id, transaction submit,
 * dan error classification berbasis AppError.code (bukan string matching).
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { and, eq } from 'drizzle-orm';
import { type ExtractTablesWithRelations } from 'drizzle-orm';
import { type PgTransaction } from 'drizzle-orm/pg-core';
import { validateAssignmentForSubmit, submitCollection, assertCollectedAtInWindow } from './collectionSubmission';
import { isOrdinaryBatchCondition, type CanConditionValue } from './conditionRules';
import { evaluateEmptyStreakForCan } from './conditionProposalService';
import { getErrorMessage } from '../utils/error-guards';
import { Errors } from '../utils/errorCatalog';
import { isAppError, AppError } from '../utils/AppError';
import { insertActivityLog } from './auditLogService';
import { sendWhatsAppNotification } from './whatsapp';

/** Satu item batch dari request mobile */
export interface BatchCollectionItem {
  offline_id: string;
  assignment_id: string;
  can_id: string;
  nominal: number;
  collected_at: string;
  latitude?: number;
  longitude?: number;
  condition: Extract<CanConditionValue, 'AKTIF' | 'RUSAK' | 'HILANG'>;
  visit_outcome?: 'ISI';
  device_info?: {
    model: string;
    os_version: string;
    app_version: string;
  };
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

type Transaction = PgTransaction<
  any,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

async function getOrCreateVisitAssignment(
  tx: Transaction,
  canId: string,
  officerId: string,
) {
  const can = await tx.query.cans.findFirst({
    where: eq(schema.cans.id, canId),
    columns: { id: true, branchId: true, condition: true },
  });
  if (!can) {
    throw Errors.VALIDATION_ERROR('Kaleng tidak ditemukan', { can_id: canId });
  }
  if (can.condition !== 'NON_AKTIF') {
    throw Errors.VALIDATION_ERROR('visit_outcome hanya dapat digunakan untuk kaleng NON_AKTIF');
  }

  const officer = await tx.query.officers.findFirst({
    where: eq(schema.officers.id, officerId),
    columns: { branchId: true },
  });
  if (!officer?.branchId || officer.branchId !== can.branchId) {
    throw Errors.FORBIDDEN('Kaleng ini bukan wilayah Anda');
  }

  const now = new Date();
  const periodYear = now.getFullYear();
  const periodMonth = now.getMonth() + 1;
  const where = and(
    eq(schema.assignments.canId, canId),
    eq(schema.assignments.officerId, officerId),
    eq(schema.assignments.periodYear, periodYear),
    eq(schema.assignments.periodMonth, periodMonth),
  );
  const existing = await tx.query.assignments.findFirst({ where });
  if (existing) {
    return existing;
  }

  const [created] = await tx.insert(schema.assignments).values({
    canId,
    officerId,
    periodYear,
    periodMonth,
    status: 'ACTIVE',
    assignedAt: now,
    notes: 'Dibuat otomatis oleh sinkronisasi kunjungan NON_AKTIF',
  }).onConflictDoNothing().returning();

  if (created) {
    return created;
  }

  const raced = await tx.query.assignments.findFirst({ where });
  if (!raced) {
    throw Errors.VALIDATION_ERROR('Gagal membuat assignment kunjungan NON_AKTIF');
  }
  return raced;
}

/**
 * Proses satu item batch: duplicate check → transaction submit.
 */
async function processSyncItem(
  item: BatchCollectionItem,
  officerId: string,
  actorUserId: string,
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

  if (!isOrdinaryBatchCondition(item.condition)) {
    throw AppError.fromUnknown('Kondisi batch harus AKTIF, RUSAK, atau HILANG', 'Kondisi batch tidak valid');
  }

  // Transaction: validate assignment (+ kunci periode §14.2) + jendela
  // collected_at (§14.3) + submit collection. Kunci/jendela melempar AppError
  // non-retryable → item batch jadi FAILED can_retry=false → antrean HP
  // memindah ke gagal permanen yang terlihat (tidak spam, tidak hilang).
  const collection = await db.transaction(async (tx) => {
    const visitAssignment = item.visit_outcome
      ? await getOrCreateVisitAssignment(tx, item.can_id, officerId)
      : undefined;
    const assignment = await validateAssignmentForSubmit(
      tx,
      visitAssignment?.id ?? item.assignment_id,
      item.can_id,
      officerId,
    );

    try {
      assertCollectedAtInWindow(new Date(item.collected_at), assignment.periodYear, assignment.periodMonth);
    } catch (err: unknown) {
      const appErr = AppError.fromUnknown(err, 'collected_at di luar jendela periode');
      await insertActivityLog({
        userId: actorUserId,
        officerId,
        actionType: 'COLLECTED_AT_REJECTED',
        entityType: 'assignment',
        entityId: visitAssignment?.id ?? item.assignment_id,
        oldData: null,
        newData: {
          offline_id: item.offline_id,
          collected_at: item.collected_at,
          periodYear: assignment.periodYear,
          periodMonth: assignment.periodMonth,
        },
        ipAddress: 'mobile-sync',
        userAgent: null,
      }, tx);
      throw appErr;
    }

    const result = await submitCollection(tx, {
      assignmentId: visitAssignment?.id ?? item.assignment_id,
      canId: item.can_id,
      officerId,
      actorUserId,
      nominal: item.nominal,
      collectedAt: new Date(item.collected_at),
      latitude: item.latitude?.toString(),
      longitude: item.longitude?.toString(),
      offlineId: item.offline_id,
      deviceInfo: item.device_info,
      condition: item.condition,
      allowNonActiveRestore: item.visit_outcome === 'ISI',
      visitOutcome: item.visit_outcome,
    });
    if (item.visit_outcome) {
      await tx.insert(schema.canVisits).values({
        canId: item.can_id,
        officerId,
        purpose: 'VERIFIKASI',
        outcome: item.visit_outcome,
        condition: item.condition,
        visitedAt: new Date(item.collected_at),
        notes: 'Kaleng ditemukan berisi saat kunjungan NON_AKTIF',
      });
      await insertActivityLog({
        userId: actorUserId,
        officerId,
        actionType: 'CAN_VISIT_RECORDED',
        entityType: 'can',
        entityId: item.can_id,
        oldData: { from: 'NON_AKTIF' },
        newData: { outcome: item.visit_outcome, to: item.condition },
        ipAddress: 'mobile-sync-visit',
        userAgent: null,
      }, tx);
    }
    // Evaluasi ambang ikut transaksi yang sama. Kegagalan proposal/evaluasi
    // membatalkan collection, bukan menghasilkan commit yang tidak lengkap.
    await evaluateEmptyStreakForCan(item.can_id, tx);
    return result;
  });

  const [can, officer] = await Promise.all([
    db.query.cans.findFirst({ 
      where: eq(schema.cans.id, item.can_id),
      with: { branch: true }
    }),
    db.query.officers.findFirst({ where: eq(schema.officers.id, officerId) }),
  ]);

  if (can?.ownerWhatsapp) {
    try {
      await sendWhatsAppNotification(can.ownerWhatsapp, can.ownerName, item.nominal, officer?.fullName || 'Petugas Lazisnu', {
        collectionId: collection.id, 
        collectedAt: item.collected_at,
        branchName: can.branch?.name
      });
    } catch {
      // Kegagalan antrean tidak membatalkan transaksi koleksi yang sudah valid.
    }
  }

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
  actorUserId: string,
): Promise<BatchSyncResult> {
  const results: BatchItemResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const result = await processSyncItem(item, officerId, actorUserId);
      results.push(result);
      succeeded++;
    } catch (err) {
      const classification = classifySyncError(err);

      results.push({
        offline_id: item.offline_id,
        status: 'FAILED',
        ...classification,
      });

      // Validation error tetap gagal: client memasukkannya ke quarantine untuk ditinjau.
      failed++;
    }
  }

  return { total: items.length, succeeded, failed, results };
}
