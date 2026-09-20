import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, sql, ExtractTablesWithRelations } from 'drizzle-orm';
import { alias, PgTransaction } from 'drizzle-orm/pg-core';
import { Errors } from '../utils/errorCatalog';
import {
  buildPeriodBoundaries,
  isPeriodLocked,
  periodKey,
  shiftPeriod,
} from './periodCalendar';
import { scanClosedMessage } from './scanClassification';

/**
 * C1-T2 (§14.3): toleransi selisih jam HP vs server. `collected_at` adalah
 * klaim petugas (diisi HP), `serverTimestamp` adalah bukti sah kapan data
 * sampai server.
 */
export const CLOCK_SKEW_MINUTES = 10;

type Transaction = PgTransaction<
  any,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

// ---------------------------------------------------------------------------
// C1-T4 (§7.5, baris T4) — kunci pasca-FINAL di choke point submit/resubmit.
// Baris submission yang belum ada = terbuka (belum FINAL).
// ---------------------------------------------------------------------------

export async function assertSubmissionOpen(
  dbOrTx: Transaction | typeof db,
  officerId: string,
  year: number,
  month: number,
): Promise<void> {
  const sub = await dbOrTx.query.ppkSubmissions.findFirst({
    where: and(
      eq(schema.ppkSubmissions.officerId, officerId),
      eq(schema.ppkSubmissions.periodYear, year),
      eq(schema.ppkSubmissions.periodMonth, month),
    ),
    columns: { status: true },
  });
  if (sub?.status === 'FINAL') {
    throw Errors.QR_ALREADY_SUBMITTED(
      `Setoran periode ${periodKey(year, month)} sudah FINAL — hubungi Admin Ranting bila perlu reopen.`,
    );
  }
}

/** Untuk rute skip: assignment ACTIVE milik petugas tak bisa di-skip bila FINAL. */
export async function assertAssignmentSkippable(
  dbOrTx: Transaction | typeof db,
  assignment: { officerId: string; periodYear: number; periodMonth: number },
): Promise<void> {
  await assertSubmissionOpen(dbOrTx, assignment.officerId, assignment.periodYear, assignment.periodMonth);
}

type ResubmitCollectionInput = {
  collectionId: string;
  nominal: number;
  alasanResubmit: string;
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
 * Validasi apakah assignment aktif, valid, dimiliki officer, dan periodenya
 * belum dikunci sistem (§14.1–14.2: patokan = assignment.period, bukan waktu
 * kirim; submit Sept yang tiba setelah 10 Okt 00:00 DITOLAK untuk Sept dan
 * diarahkan ke assignment Okt).
 */
export async function validateAssignmentForSubmit(
  tx: Transaction,
  assignmentId: string,
  canId: string,
  officerId: string,
  now: Date = new Date()
) {
  const assignment = await tx.query.assignments.findFirst({
    where: and(
      eq(schema.assignments.id, assignmentId),
      eq(schema.assignments.officerId, officerId),
      eq(schema.assignments.status, 'ACTIVE')
    ),
  });

  if (!assignment) {
    throw Errors.ASSIGNMENT_INVALID();
  }
  if (assignment.canId !== canId) {
    throw Errors.CAN_ID_MISMATCH();
  }

  const b = buildPeriodBoundaries(assignment.periodYear, assignment.periodMonth);
  if (isPeriodLocked(now, b.toleranceEnd)) {
    const period = periodKey(assignment.periodYear, assignment.periodMonth);
    const next = shiftPeriod(assignment.periodYear, assignment.periodMonth, 1);
    const nextPeriod = periodKey(next.year, next.month);
    throw Errors.QR_PERIOD_CLOSED(scanClosedMessage(period, nextPeriod), {
      period,
      next_period: nextPeriod,
    });
  }

  return assignment;
}

/**
 * C1-T2 (§14.3): `collected_at` (klaim HP) wajib berada dalam jendela periode
 * milik assignment — `[assign_date 00:00, tolerance_end 23:59]` + skew ±10 mnt.
 * Di luar → VALIDATION_ERROR (non-retry: antrean HP memindah ke gagal permanen
 * yang terlihat + audit di pemanggil, bukan hilang diam-diam).
 */
export function assertCollectedAtInWindow(
  collectedAt: Date,
  periodYear: number,
  periodMonth: number
): void {
  const b = buildPeriodBoundaries(periodYear, periodMonth);
  const skewMs = CLOCK_SKEW_MINUTES * 60 * 1000;
  const t = collectedAt.getTime();
  const period = periodKey(periodYear, periodMonth);
  if (Number.isNaN(t)) {
    throw Errors.VALIDATION_ERROR(`collected_at tidak valid untuk periode ${period}.`, {
      reason: 'COLLECTED_AT_OUT_OF_WINDOW',
      period,
    });
  }
  if (t < b.assignDate.getTime() - skewMs || t > b.toleranceEnd.getTime() + skewMs) {
    throw Errors.VALIDATION_ERROR(
      `collected_at di luar jendela periode ${period} (20 00:00 s/d 9 bln berikut 23:59).`,
      {
        reason: 'COLLECTED_AT_OUT_OF_WINDOW',
        period,
        collected_at: collectedAt.toISOString(),
        window_start: new Date(b.assignDate.getTime() - skewMs).toISOString(),
        window_end: new Date(b.toleranceEnd.getTime() + skewMs).toISOString(),
      }
    );
  }
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
    throw Errors.QR_ALREADY_SUBMITTED();
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
    collectedAt: Date;
    latitude?: string | null;
    longitude?: string | null;
    offlineId?: string | null;
    deviceInfo?: any;
  }
) {
  await assertNoExistingFirstSubmit(tx, data.assignmentId, data.canId);

  // C1-T4 (§7.5): setoran periode yang sudah FINAL terkunci penuh.
  const target = await tx.query.assignments.findFirst({
    where: eq(schema.assignments.id, data.assignmentId),
    columns: { periodYear: true, periodMonth: true },
  });
  if (target) {
    await assertSubmissionOpen(tx, data.officerId, target.periodYear, target.periodMonth);
  }

  const [collection] = await tx.insert(schema.collections).values({
    assignmentId: data.assignmentId,
    canId: data.canId,
    officerId: data.officerId,
    nominal: BigInt(data.nominal),
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
    with: {
      can: {
        with: { branch: true }
      }
    },
  });

  if (!oldCollection) {
    throw Errors.COLLECTION_NOT_FOUND();
  }

  if (input.requiredOfficerId && oldCollection.officerId !== input.requiredOfficerId) {
    throw Errors.COLLECTION_NOT_FOUND();
  }

  if (input.requiredBranchId && oldCollection.can?.branchId !== input.requiredBranchId) {
    throw Errors.FORBIDDEN();
  }

  const [latestRecord] = await tx.select({ maxSeq: sql<number>`max(${schema.collections.submitSequence})` })
    .from(schema.collections)
    .where(and(
      eq(schema.collections.assignmentId, oldCollection.assignmentId),
      eq(schema.collections.canId, oldCollection.canId)
    ));

  const latestSequence = Number(latestRecord?.maxSeq || 0);
  if (oldCollection.submitSequence !== latestSequence) {
    throw Errors.NOT_LATEST();
  }

  // C1-T4 (§7.5): koreksi pasca-FINAL ditolak (ubah = reopen T7 dulu).
  const resubmitTarget = await tx.query.assignments.findFirst({
    where: eq(schema.assignments.id, oldCollection.assignmentId),
    columns: { periodYear: true, periodMonth: true },
  });
  if (resubmitTarget) {
    await assertSubmissionOpen(tx, oldCollection.officerId, resubmitTarget.periodYear, resubmitTarget.periodMonth);
  }

  const nextSequence = latestSequence + 1;
  const newNominal = BigInt(input.nominal);
  const [newCollection] = await tx.insert(schema.collections).values({
    assignmentId: oldCollection.assignmentId,
    canId: oldCollection.canId,
    officerId: oldCollection.officerId,
    nominal: newNominal,
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
