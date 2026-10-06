import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, or, sql, ExtractTablesWithRelations } from 'drizzle-orm';
import { alias, PgTransaction } from 'drizzle-orm/pg-core';
import { Errors } from '../utils/errorCatalog';
import {
  buildPeriodBoundaries,
  isPeriodLocked,
  periodKey,
  shiftPeriod,
} from './periodCalendar';
import { scanClosedMessage } from './scanClassification';
import { isOrdinaryBatchCondition, isTrackedForCondition, isTransitionAllowed, type CanConditionValue } from './conditionRules';
import { insertActivityLog } from './auditLogService';

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
// C1-T12 (§2.2) — agregat uang per PERIODE ASSIGNMENT (bukan collected_at).
// collected_at 20 Sep–9 Okt milik assignment Sept = pemasukan Sept. Satu
// helper bersama untuk dashboard monthStats + stats-range (dulu 2 SQL duplikat
// berbasis bulan collected_at — sumber angka meleset lintas toleransi).
// ---------------------------------------------------------------------------

export interface PeriodSumFilter {
  officerId?: string;
  periods: Array<{ year: number; month: number }>;
}

export async function sumCollectionsByPeriod(
  dbOrTx: Transaction | typeof db,
  filter: PeriodSumFilter,
): Promise<{ collected: number; total_nominal: number }> {
  const conds = filter.periods.map((p) =>
    and(eq(schema.assignments.periodYear, p.year), eq(schema.assignments.periodMonth, p.month)),
  );
  if (conds.length === 0) return { collected: 0, total_nominal: 0 };
  const whereParts = [
    ...(filter.officerId ? [eq(schema.collections.officerId, filter.officerId)] : []),
    or(...conds),
    eq(schema.collections.syncStatus, 'COMPLETED'),
    getLatestCollectionCondition(),
  ];
  const [row] = await dbOrTx
    .select({
      collected: sql<number>`count(*)::int`,
      total_nominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
    })
    .from(schema.collections)
    .innerJoin(schema.assignments, eq(schema.collections.assignmentId, schema.assignments.id))
    .where(and(...whereParts));
  return { collected: row?.collected ?? 0, total_nominal: Number(row?.total_nominal ?? 0) };
}

// ---------------------------------------------------------------------------
// C1-T4 (§7.5, baris T4) — kunci pasca-FINAL di choke point submit/resubmit.
// Baris submission yang belum ada = terbuka (belum FINAL).
// C1-T7 (§14.8): + jendela reopen — DRAFT-dibuka-kembali yang lewat
// `reopened_until` terkunci lagi (minta reopen ulang = perpanjangan).
// ---------------------------------------------------------------------------

/**
 * C1-T7: tolak tulis bila jendela koreksi reopen sudah berakhir.
 * DRAFT normal (`reopenedUntil` NULL) selalu lolos — hanya baris reopened
 * yang dibatasi waktu. Batas inklusif: `now == until` masih boleh.
 */
export function assertReopenWindowOpen(sub: { reopenedUntil: Date | null }, now: Date = new Date()): void {
  if (sub.reopenedUntil !== null && now.getTime() > sub.reopenedUntil.getTime()) {
    throw Errors.VALIDATION_ERROR('Jendela koreksi reopen berakhir — minta reopen ulang ke Admin.', {
      reason: 'REOPEN_WINDOW_CLOSED',
      reopened_until: sub.reopenedUntil.toISOString(),
    });
  }
}

export async function assertSubmissionOpen(
  dbOrTx: Transaction | typeof db,
  officerId: string,
  year: number,
  month: number,
  now: Date = new Date(),
): Promise<void> {
  // Syarat review-T4 #2: kunci baris submission (SELECT … FOR UPDATE) agar
  // submit yang commit tepat setelah FINAL commit tidak lolos di READ
  // COMMITTED. Di luar transaksi (rute skip, autocommit) klausa ini tidak
  // berpengaruh — perilaku "baris belum ada = terbuka" tetap.
  await dbOrTx.execute(sql`SELECT id FROM ppk_submissions WHERE officer_id = ${officerId} AND period_year = ${year} AND period_month = ${month} FOR UPDATE`);
  const sub = await dbOrTx.query.ppkSubmissions.findFirst({
    where: and(
      eq(schema.ppkSubmissions.officerId, officerId),
      eq(schema.ppkSubmissions.periodYear, year),
      eq(schema.ppkSubmissions.periodMonth, month),
    ),
    columns: { status: true, reopenedUntil: true },
  });
  if (sub?.status === 'FINAL') {
    throw Errors.QR_ALREADY_SUBMITTED(
      `Setoran periode ${periodKey(year, month)} sudah FINAL — hubungi Admin Ranting bila perlu reopen.`,
    );
  }
  if (sub) assertReopenWindowOpen(sub, now);
}

/** Untuk rute skip: assignment ACTIVE milik petugas tak bisa di-skip bila FINAL. */
export async function assertAssignmentSkippable(
  dbOrTx: Transaction | typeof db,
  assignment: { officerId: string; periodYear: number; periodMonth: number },
  now: Date = new Date(),
): Promise<void> {
  await assertSubmissionOpen(dbOrTx, assignment.officerId, assignment.periodYear, assignment.periodMonth, now);
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
    /** User login yang melakukan aksi; diutamakan dari officer.userId. */
    actorUserId?: string | null;
    /** Khusus kunjungan NON_AKTIF dengan nominal; ordinary submit tetap menolak lifecycle boundary. */
    allowNonActiveRestore?: boolean;
    visitOutcome?: 'ISI';
    nominal: number;
    collectedAt: Date;
    latitude?: string | null;
    longitude?: string | null;
    offlineId?: string | null;
    deviceInfo?: any;
    /**
     * Kondisi kaleng menurut PPK saat menjemput (halaman submit:
     * baik/rusak/hilang). FINAL langsung: ditulis ke kaleng + audit.
     * Sama dengan kini = no-op. Transisi tak valid ditolak DI DEPAN
     * (sebelum uang tersimpan) — setelah lolos, uang dan kondisi
     * tersimpan satu paket (tanpa konsep "laporan gagal").
     */
    condition?: CanConditionValue | null;
  },
  now: Date = new Date(),
) {
  // Validasi kondisi di depan: ngawur ditolak sebelum uang tersentuh.
  let conditionChange: { from: CanConditionValue; to: CanConditionValue } | null = null;
  if (data.condition) {
    if (!isOrdinaryBatchCondition(data.condition)) {
      throw Errors.VALIDATION_ERROR('Batch biasa hanya menerima kondisi AKTIF, RUSAK, atau HILANG');
    }
    const can = await tx.query.cans.findFirst({
      where: eq(schema.cans.id, data.canId),
      columns: { id: true, condition: true },
    });
    if (!can) throw Errors.VALIDATION_ERROR('Kaleng tidak ditemukan');
    const from = can.condition as CanConditionValue;
    if (data.visitOutcome && from !== 'NON_AKTIF') {
      throw Errors.VALIDATION_ERROR('Kunjungan ISI hanya dapat dilakukan pada kaleng NON_AKTIF');
    }
    if ((from === 'NON_AKTIF' || from === 'DIKEMBALIKAN') && !data.allowNonActiveRestore) {
      throw Errors.VALIDATION_ERROR('Kaleng NON_AKTIF/DIKEMBALIKAN harus memakai tindakan kunjungan khusus');
    }
    if (from !== data.condition && !isTransitionAllowed(from, data.condition)) {
      throw Errors.VALIDATION_ERROR(`Transisi kondisi ${from} → ${data.condition} tidak diizinkan`);
    }
    conditionChange = { from, to: data.condition };
  }

  await assertNoExistingFirstSubmit(tx, data.assignmentId, data.canId);

  // C1-T4 (§7.5): setoran periode yang sudah FINAL terkunci penuh.
  // C1-T7: + jendela reopen (now diinjeksi agar uji deterministik).
  const target = await tx.query.assignments.findFirst({
    where: eq(schema.assignments.id, data.assignmentId),
    columns: { periodYear: true, periodMonth: true },
  });
  if (target) {
    await assertSubmissionOpen(tx, data.officerId, target.periodYear, target.periodMonth, now);
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

  if (conditionChange) {
    await tx.update(schema.cans).set({
      condition: conditionChange.to,
      isActive: data.visitOutcome === 'ISI' || isTrackedForCondition(conditionChange.to),
      updatedAt: new Date(),
    }).where(eq(schema.cans.id, data.canId));

    const officer = await tx.query.officers.findFirst({
      where: eq(schema.officers.id, data.officerId),
      columns: { userId: true },
    });
    const auditUserId = data.actorUserId ?? officer?.userId ?? null;
    if (!auditUserId) {
      throw Errors.VALIDATION_ERROR('Identitas login petugas tidak tersedia untuk audit');
    }
    // Audit memakai client transaksi yang sama. Jika insert audit gagal,
    // seluruh submit rollback; tidak ada kondisi bisnis tanpa jejak audit.
    await insertActivityLog({
      userId: auditUserId,
      officerId: data.officerId,
      actionType: 'CAN_CONDITION_RECORDED',
      entityType: 'can',
      entityId: data.canId,
      oldData: { from: conditionChange.from },
      newData: {
        to: conditionChange.to,
        collection_nominal: data.nominal,
        collected_at: data.collectedAt.toISOString(),
        changed: conditionChange.from !== conditionChange.to,
      },
      ipAddress: 'collection-submit',
      userAgent: null,
    }, tx);
  }

  return collection;
}

/**
 * Melakukan koreksi koleksi secara immutable: insert versi baru dengan
 * submit_sequence + 1 lalu update agregat kaleng berdasarkan selisih nominal.
 */
export async function resubmitCollection(
  tx: Transaction,
  input: ResubmitCollectionInput,
  now: Date = new Date(),
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
  // C1-T7: + jendela reopen.
  const resubmitTarget = await tx.query.assignments.findFirst({
    where: eq(schema.assignments.id, oldCollection.assignmentId),
    columns: { periodYear: true, periodMonth: true },
  });
  if (resubmitTarget) {
    await assertSubmissionOpen(tx, oldCollection.officerId, resubmitTarget.periodYear, resubmitTarget.periodMonth, now);
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
