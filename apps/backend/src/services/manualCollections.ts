/**
 * C1-T8 — Salin manual per kaleng oleh admin (§14 C-1/C-2 #5b).
 *
 * Lembar catatan kertas cadangan → admin salin entri per kaleng + alasan
 * KOREKSI_ADMIN. Inti validasi SAMA dengan submit PPK (assignment ACTIVE
 * milik officer itu, jendela collected_at, kunci FINAL/jendela reopen) —
 * yang beda hanya sesi pencatat (admin, bukan PPK) + audit provenance.
 *
 * - Pencatat: ADMIN_RANTING (kaleng + petugas seranting) / ADMIN_KECAMATAN
 *   (satu distrik). Alasan wajib min 10 (jejak kertas apa yang disalin).
 * - Provenance hidup di audit `MANUAL_COLLECTION` (siapa admin, alasan apa);
 *   baris collection-nya COMPLETED biasa (tak ada kolom khusus — T8).
 * - Tanpa notifikasi WA donatur (salinan administratif, bukan jemputan live).
 * - Evaluasi empty-streak kaleng tetap jalan best-effort (paritas B2 online).
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq } from 'drizzle-orm';
import { Errors } from '../utils/errorCatalog';
import { insertActivityLog } from './auditLogService';
import {
  validateAssignmentForSubmit,
  assertCollectedAtInWindow,
  submitCollection,
} from './collectionSubmission';
import { evaluateEmptyStreakForCan } from './conditionProposalService';
import type { SubmissionActor } from './ppkSubmissions';

export interface ManualCollectionInput {
  assignmentId: string;
  canId: string;
  officerId: string;
  nominal: number;
  collectedAt: Date;
  reason: string;
}

export interface ManualCollectionResult {
  id: string;
  sync_status: 'COMPLETED';
}

export async function recordManualCollection(
  actor: SubmissionActor,
  input: ManualCollectionInput,
  now: Date = new Date(),
): Promise<ManualCollectionResult> {
  const reason = (input.reason ?? '').trim();
  if (reason.length < 10) {
    throw Errors.VALIDATION_ERROR('Alasan salin manual wajib min 10 karakter.');
  }
  if (!Number.isInteger(input.nominal) || input.nominal < 0) {
    throw Errors.VALIDATION_ERROR('Nominal harus bilangan bulat >= 0.');
  }

  const can = await db.query.cans.findFirst({
    where: eq(schema.cans.id, input.canId),
    columns: { id: true, branchId: true },
  });
  if (!can) throw Errors.VALIDATION_ERROR('Kaleng tidak ditemukan');
  const officer = await db.query.officers.findFirst({
    where: eq(schema.officers.id, input.officerId),
    columns: { id: true, branchId: true, districtId: true },
  });
  if (!officer) throw Errors.VALIDATION_ERROR('Petugas tidak ditemukan');
  if (officer.branchId !== can.branchId) {
    throw Errors.VALIDATION_ERROR('Petugas dan kaleng beda ranting.');
  }
  const branch = await db.query.branches.findFirst({
    where: eq(schema.branches.id, can.branchId),
    columns: { id: true, districtId: true },
  });
  if (!branch) throw Errors.VALIDATION_ERROR('Ranting tidak ditemukan');

  if (actor.role === 'ADMIN_RANTING') {
    if (!actor.branchId || actor.branchId !== can.branchId) {
      throw Errors.FORBIDDEN_SCOPE('Bukan kaleng ranting Anda');
    }
  } else if (actor.role === 'ADMIN_KECAMATAN') {
    if (!actor.districtId || actor.districtId !== branch.districtId) {
      throw Errors.FORBIDDEN_SCOPE('Bukan kaleng distrik Anda');
    }
  } else {
    throw Errors.FORBIDDEN('Hanya Admin Ranting / MWC yang menyalin manual');
  }

  const result = await db.transaction(async (tx) => {
    const assignment = await validateAssignmentForSubmit(tx, input.assignmentId, input.canId, input.officerId, now);
    assertCollectedAtInWindow(input.collectedAt, assignment.periodYear, assignment.periodMonth);
    return submitCollection(
      tx,
      {
        assignmentId: input.assignmentId,
        canId: input.canId,
        officerId: input.officerId,
        nominal: input.nominal,
        collectedAt: input.collectedAt,
      },
      now,
    );
  });

  try {
    await evaluateEmptyStreakForCan(input.canId);
  } catch {
    // Paritas B2: kegagalan evaluasi tak menggagalkan catat yang sah.
  }

  try {
    await insertActivityLog({
      userId: actor.userId,
      officerId: input.officerId,
      actionType: 'MANUAL_COLLECTION',
      entityType: 'collection',
      entityId: result.id,
      oldData: null,
      newData: {
        assignment_id: input.assignmentId,
        can_id: input.canId,
        nominal: input.nominal,
        collected_at: input.collectedAt.toISOString(),
        reason,
      },
      ipAddress: 'manual-collection',
      userAgent: null,
    });
  } catch {
    // Audit tidak boleh menggagalkan catat yang sah.
  }

  return { id: result.id, sync_status: 'COMPLETED' };
}
