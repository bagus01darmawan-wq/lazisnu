/**
 * C1-T4 — Submission PPK & ranting: hitung otomatis, FINAL, kunci, version
 * (§14.5/10, §7–§9, syarat review-T0 →T4).
 *
 * Prinsip: angka murni dari sistem (SUM per kaleng, rumus `c1Math` terkunci) —
 * tidak ada ketik nominal. PPK/bendahara/admin hanya menyatakan "pas" lewat
 * TTD; T5 mengatur upacara co-sign + PDF, T6 orkestrasi kunci berlapis
 * (FINAL_NOL massal), T7 reopen (+version), T8 agregat/insiden.
 *
 * Batas wilayah T4:
 * - Termasuk: ensure (upsert hitung ulang selama DRAFT), FINAL PPK
 *   (gerbang lengkap + optimistic version + audit), FINAL ranting (agregat,
 *   gerbang semua-PPK-FINAL, selisih share, snapshot kaleng), kunci
 *   submit/resubmit/skip pasca-FINAL (choke point di sini).
 * - Tidak termasuk: penangkapan TTD per sesi + PDF (T5), FINAL_NOL massal MWC
 *   (T6 — memakai finalizeBranchSubmission), reopen (T7), entri agregat
 *   HP_HILANG/KOREKSI_ADMIN (T8, baris tiketnya menyebut "agregat" eksplisit).
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { and, eq, inArray, sql, type ExtractTablesWithRelations } from 'drizzle-orm';
import { type PgTransaction } from 'drizzle-orm/pg-core';
import { Errors } from '../utils/errorCatalog';
import { insertActivityLog } from './auditLogService';
import { getLatestCollectionCondition, assertReopenWindowOpen } from './collectionSubmission';
import {
  calcBisyaroh,
  calcExpectedShare,
  calcShareVariance,
  needsVarianceReason,
  BISYAROH_PCT,
  SHARE_PCT,
} from '../utils/c1Math';
import { periodKey, REOPEN_WINDOW_HOURS } from './periodCalendar';
import { nextBaNumber } from './baNumbering';
import { notifyBaSiapBranch, notifyPpkFinal } from './notifications';

export interface SubmissionActor {
  userId: string;
  role: string;
  branchId?: string | null;
  districtId?: string | null;
  officerId?: string | null;
}

/** Snapshot rumus yang dibekukan saat FINAL (laporan lama tak ikut berubah). */
export const PPK_FORMULA_SNAPSHOT = { bisyaroh_pct: BISYAROH_PCT, rounding: 'ceil_1000' } as const;
export const BRANCH_FORMULA_SNAPSHOT = {
  bisyaroh_pct: BISYAROH_PCT,
  share_pct: SHARE_PCT,
  share_base: 'sisa_setelah_bisyaroh',
  rounding: 'ceil_1000_bisyaroh',
} as const;

export interface PpkTotals {
  total: number;
  collectionCount: number;
  bisyaroh: number;
  net: number;
  /** C1-T8: bagian total yang berasal dari agregat darurat (tak masuk rincian kaleng). */
  aggregateTotal: number;
  /** C1-T8: 0/1 — satu baris aktif per officer+periode. */
  aggregateCount: number;
}

// Tipe transaksi bersama (pola collectionSubmission.ts) untuk helper baca.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbOrTx = PgTransaction<any, typeof schema, ExtractTablesWithRelations<typeof schema>> | typeof db;

// ---------------------------------------------------------------------------
// Hitung otomatis dari collections (terbaru per kaleng, COMPLETED).
// ---------------------------------------------------------------------------

export async function computePpkTotals(
  dbOrTx: DbOrTx,
  officerId: string,
  year: number,
  month: number,
): Promise<PpkTotals> {
  const latest = getLatestCollectionCondition();
  const rows = await dbOrTx
    .select({ nominal: schema.collections.nominal })
    .from(schema.collections)
    .innerJoin(schema.assignments, eq(schema.collections.assignmentId, schema.assignments.id))
    .where(
      and(
        eq(schema.collections.officerId, officerId),
        eq(schema.assignments.periodYear, year),
        eq(schema.assignments.periodMonth, month),
        eq(schema.collections.syncStatus, 'COMPLETED'),
        latest,
      ),
    );
  // C1-T8 (§14 #5c): agregat darurat (HP_HILANG) masuk total, tak masuk
  // rincian kaleng. Satu baris aktif per officer+periode (upsert-ganti).
  const aggs = await dbOrTx
    .select({ amount: schema.ppkEmergencyAggregates.amount })
    .from(schema.ppkEmergencyAggregates)
    .where(
      and(
        eq(schema.ppkEmergencyAggregates.officerId, officerId),
        eq(schema.ppkEmergencyAggregates.periodYear, year),
        eq(schema.ppkEmergencyAggregates.periodMonth, month),
      ),
    );
  const aggregateTotal = aggs.reduce((acc, r) => acc + Number(r.amount), 0);
  const total = rows.reduce((acc, r) => acc + Number(r.nominal), 0) + aggregateTotal;
  const bisyaroh = calcBisyaroh(total);
  return { total, collectionCount: rows.length, bisyaroh, net: total - bisyaroh, aggregateTotal, aggregateCount: aggs.length };
}

// ---------------------------------------------------------------------------
// Ensure — upsert hitung ulang selama DRAFT; baris FINAL beku (tak tersentuh).
// ---------------------------------------------------------------------------

export async function ensurePpkSubmission(officerId: string, branchId: string, year: number, month: number) {
  const totals = await computePpkTotals(db, officerId, year, month);
  const existing = await db.query.ppkSubmissions.findFirst({
    where: and(
      eq(schema.ppkSubmissions.officerId, officerId),
      eq(schema.ppkSubmissions.periodYear, year),
      eq(schema.ppkSubmissions.periodMonth, month),
    ),
  });
  if (existing) {
    if (existing.status === 'FINAL') return existing;
    const [updated] = await db
      .update(schema.ppkSubmissions)
      .set({
        branchId,
        totalAmount: BigInt(totals.total),
        collectionCount: totals.collectionCount,
        bisyarohAmount: BigInt(totals.bisyaroh),
        netAmount: BigInt(totals.net),
        formulaSnapshot: { ...PPK_FORMULA_SNAPSHOT },
        updatedAt: new Date(),
      })
      .where(eq(schema.ppkSubmissions.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(schema.ppkSubmissions)
    .values({
      officerId,
      branchId,
      periodYear: year,
      periodMonth: month,
      totalAmount: BigInt(totals.total),
      collectionCount: totals.collectionCount,
      bisyarohAmount: BigInt(totals.bisyaroh),
      netAmount: BigInt(totals.net),
      formulaSnapshot: { ...PPK_FORMULA_SNAPSHOT },
      status: 'DRAFT',
    })
    .onConflictDoNothing({
      target: [schema.ppkSubmissions.officerId, schema.ppkSubmissions.periodYear, schema.ppkSubmissions.periodMonth],
    })
    .returning();
  if (created) return created;
  // Balapan ensure ganda: baca pemenangnya.
  return (await db.query.ppkSubmissions.findFirst({
    where: and(
      eq(schema.ppkSubmissions.officerId, officerId),
      eq(schema.ppkSubmissions.periodYear, year),
      eq(schema.ppkSubmissions.periodMonth, month),
    ),
  }))!;
}

export interface BranchAggregates {
  total: number;
  bisyarohTotal: number;
  collectionCount: number;
  expectedShare: number;
  ppkCount: number;
  openPpkNames: string[];
}

export async function computeBranchAggregates(branchId: string, year: number, month: number): Promise<BranchAggregates> {
  const rows = await db.query.ppkSubmissions.findMany({
    where: and(
      eq(schema.ppkSubmissions.branchId, branchId),
      eq(schema.ppkSubmissions.periodYear, year),
      eq(schema.ppkSubmissions.periodMonth, month),
    ),
    with: { officer: { columns: { fullName: true } } },
  });
  let total = 0;
  let bisyarohTotal = 0;
  let collectionCount = 0;
  const openPpkNames: string[] = [];
  for (const r of rows) {
    total += Number(r.totalAmount);
    bisyarohTotal += Number(r.bisyarohAmount);
    collectionCount += r.collectionCount;
    if (r.status !== 'FINAL') openPpkNames.push(r.officer?.fullName ?? r.officerId);
  }
  return {
    total,
    bisyarohTotal,
    collectionCount,
    expectedShare: calcExpectedShare(total, bisyarohTotal),
    ppkCount: rows.length,
    openPpkNames,
  };
}

export async function ensureBranchSubmission(branchId: string, year: number, month: number) {
  const branch = await db.query.branches.findFirst({
    where: eq(schema.branches.id, branchId),
    columns: { id: true, districtId: true },
  });
  if (!branch) throw Errors.VALIDATION_ERROR('Ranting/program tidak ditemukan');
  const agg = await computeBranchAggregates(branchId, year, month);
  const existing = await db.query.branchSubmissions.findFirst({
    where: and(
      eq(schema.branchSubmissions.branchId, branchId),
      eq(schema.branchSubmissions.periodYear, year),
      eq(schema.branchSubmissions.periodMonth, month),
    ),
  });
  if (existing) {
    if (existing.status !== 'DRAFT') return existing;
    // shareMwc / varianceReason / linkedPeriods milik FINAL — jangan ditimpa.
    const variance = calcShareVariance(Number(existing.shareMwc), agg.expectedShare);
    const [updated] = await db
      .update(schema.branchSubmissions)
      .set({
        districtId: branch.districtId,
        totalAmount: BigInt(agg.total),
        bisyarohTotal: BigInt(agg.bisyarohTotal),
        netAmount: BigInt(agg.total - agg.bisyarohTotal - Number(existing.shareMwc)),
        expectedShare: BigInt(agg.expectedShare),
        shareVariance: BigInt(variance),
        collectionCount: agg.collectionCount,
        formulaSnapshot: { ...BRANCH_FORMULA_SNAPSHOT },
        updatedAt: new Date(),
      })
      .where(eq(schema.branchSubmissions.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(schema.branchSubmissions)
    .values({
      branchId,
      districtId: branch.districtId,
      periodYear: year,
      periodMonth: month,
      totalAmount: BigInt(agg.total),
      bisyarohTotal: BigInt(agg.bisyarohTotal),
      netAmount: BigInt(agg.total - agg.bisyarohTotal),
      expectedShare: BigInt(agg.expectedShare),
      shareVariance: BigInt(0 - agg.expectedShare),
      collectionCount: agg.collectionCount,
      formulaSnapshot: { ...BRANCH_FORMULA_SNAPSHOT },
      status: 'DRAFT',
    })
    .onConflictDoNothing({
      target: [schema.branchSubmissions.branchId, schema.branchSubmissions.periodYear, schema.branchSubmissions.periodMonth],
    })
    .returning();
  if (created) return created;
  return (await db.query.branchSubmissions.findFirst({
    where: and(
      eq(schema.branchSubmissions.branchId, branchId),
      eq(schema.branchSubmissions.periodYear, year),
      eq(schema.branchSubmissions.periodMonth, month),
    ),
  }))!;
}

// ---------------------------------------------------------------------------
// FINAL PPK.
// ---------------------------------------------------------------------------

export interface PpkFinalizeInput {
  submissionId: string;
  ppkSignerId: string;
  bendaharaSignerId: string;
  expectedVersion?: number;
  /** Override Admin Ranting atas sisa ACTIVE + alasan wajib (audit). */
  forceReason?: string;
}



export async function finalizePpkSubmission(actor: SubmissionActor, input: PpkFinalizeInput, now: Date = new Date()) {
  const result = await db.transaction(async (tx) => {
    const sub = await tx.query.ppkSubmissions.findFirst({
      where: eq(schema.ppkSubmissions.id, input.submissionId),
    });
    if (!sub) throw Errors.VALIDATION_ERROR('Setoran PPK tidak ditemukan');
    assertReopenWindowOpen(sub, now);

    const officer = await tx.query.officers.findFirst({
      where: eq(schema.officers.id, sub.officerId),
      columns: { id: true, userId: true, branchId: true },
    });
    if (!officer) throw Errors.VALIDATION_ERROR('Petugas setoran tidak ditemukan');

    // Gerbang peran: PPK (miliknya), Keuangan (scope rantingnya), Admin Ranting
    // (scope rantingnya, HANYA jalur force + alasan).
    if (actor.role === 'PETUGAS') {
      if (officer.userId !== actor.userId) throw Errors.FORBIDDEN('Bukan setoran Anda');
    } else if (actor.role === 'STAF_KEUANGAN') {
      if (!actor.branchId || actor.branchId !== sub.branchId) {
        throw Errors.FORBIDDEN_SCOPE('Bukan setoran ranting Anda');
      }
      if (input.forceReason) throw Errors.VALIDATION_ERROR('Force FINAL hanya untuk Admin Ranting');
    } else if (actor.role === 'ADMIN_RANTING') {
      if (!actor.branchId || actor.branchId !== sub.branchId) {
        throw Errors.FORBIDDEN_SCOPE('Bukan setoran ranting Anda');
      }
      if (!input.forceReason) {
        throw Errors.FORBIDDEN('Admin Ranting hanya mengunci via force + alasan (atau reopen T7)');
      }
    } else {
      throw Errors.FORBIDDEN('Peran Anda tidak bisa mem-FINAL-kan setoran PPK');
    }

    if (sub.status === 'FINAL') {
      throw Errors.CONFLICT('Setoran ini sudah FINAL — tidak bisa di-FINAL-kan dua kali.');
    }

    if (input.expectedVersion !== undefined && input.expectedVersion !== sub.version) {
      throw Errors.CONFLICT('Setoran berubah — muat ulang lalu coba lagi.', {
        expected_version: input.expectedVersion,
        current_version: sub.version,
      });
    }

    // Hitung ulang segar di dalam transaksi yang sama (snapshot = angka FINAL).
    const totals = await computePpkTotals(tx, sub.officerId, sub.periodYear, sub.periodMonth);

    // Kelengkapan: tanpa ACTIVE tersisa, atau force Admin + alasan (audit).
    const [{ n: activeLeft }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.assignments)
      .where(
        and(
          eq(schema.assignments.officerId, sub.officerId),
          eq(schema.assignments.periodYear, sub.periodYear),
          eq(schema.assignments.periodMonth, sub.periodMonth),
          eq(schema.assignments.status, 'ACTIVE'),
        ),
      );
    const forced = actor.role === 'ADMIN_RANTING' && !!input.forceReason;
    if (activeLeft > 0 && !forced) {
      throw Errors.VALIDATION_ERROR(
        `Masih ada ${activeLeft} tugas ACTIVE periode ${periodKey(sub.periodYear, sub.periodMonth)} — selesaikan/skip dulu, atau force + alasan via Admin Ranting.`,
      );
    }

    // Syarat review-T0 →T4 butir 1: kedua signer WAJIB terisi di server
    // (CHECK DB hanya menolak TTD sama orang). Jangkar identitas: penandatangan
    // PPK = user login milik officer; bendahara = STAF_KEUANGAN (tercatat siapa).
    if (!input.ppkSignerId || !input.bendaharaSignerId) {
      throw Errors.VALIDATION_ERROR('FINAL wajib dua tanda tangan: PPK dan Bendahara.');
    }
    if (input.ppkSignerId === input.bendaharaSignerId) {
      throw Errors.VALIDATION_ERROR('PPK dan Bendahara harus dua orang berbeda.');
    }
    if (input.ppkSignerId !== officer.userId) {
      throw Errors.VALIDATION_ERROR('Penandatangan PPK harus pemilik setoran.');
    }
    // Syarat review-T4 #1 (T5): bendahara = STAF_KEUANGAN *seranting* dengan
    // setoran (keuangan ranting/distrik lain ditolak — bukan sekadar peran).
    await assertPpkBendaharaScope(tx, input.bendaharaSignerId, sub.branchId);

    // F7/D-14: nomor BA org — sekali per submission (stabil lintas
    // versi/reopen); sekuens per ranting jalan terus.
    const baNumber = sub.baNumber ?? (await nextBaNumber(tx, { scopeType: 'RANTING', scopeId: sub.branchId }, now));

    const updated = await tx
      .update(schema.ppkSubmissions)
      .set({
        totalAmount: BigInt(totals.total),
        collectionCount: totals.collectionCount,
        bisyarohAmount: BigInt(totals.bisyaroh),
        netAmount: BigInt(totals.net),
        formulaSnapshot: { ...PPK_FORMULA_SNAPSHOT },
        status: 'FINAL',
        finalizedAt: now,
        finalizedBy: actor.userId,
        ppkSignerId: input.ppkSignerId,
        ppkSignedAt: sub.ppkSignedAt ?? now,
        bendaharaSignerId: input.bendaharaSignerId,
        bendaharaSignedAt: sub.bendaharaSignedAt ?? now,
        reopenedUntil: null,
        baNumber,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.ppkSubmissions.id, sub.id),
          // C1-T5: FINAL sah dari DRAFT (jalur lama) maupun PPK_SIGNED
          // (upacara co-sign: countersign/force mendelegasikan ke sini).
          inArray(schema.ppkSubmissions.status, ['DRAFT', 'PPK_SIGNED']),
          eq(schema.ppkSubmissions.version, sub.version),
        ),
      )
      .returning();
    if (updated.length === 0) {
      // Balapan FINAL ganda: pemenang lain mengunci duluan (tombol mati sekali).
      throw Errors.CONFLICT('Setoran baru saja di-FINAL-kan pihak lain.');
    }
    // C1-T7: PPK selesai betulkan → segarkan jendela branch DRAFT-reopened
    // pasangan (episode koreksi lanjut ke tingkat ranting).
    await tx
      .update(schema.branchSubmissions)
      .set({ reopenedUntil: new Date(now.getTime() + REOPEN_WINDOW_HOURS * 3_600_000), updatedAt: now })
      .where(
        and(
          eq(schema.branchSubmissions.branchId, sub.branchId),
          eq(schema.branchSubmissions.periodYear, sub.periodYear),
          eq(schema.branchSubmissions.periodMonth, sub.periodMonth),
          eq(schema.branchSubmissions.status, 'DRAFT'),
          sql`reopened_until IS NOT NULL`,
        ),
      );
    return { row: updated[0], totals, activeLeft, forced };
  });

  try {
    await insertActivityLog({
      userId: actor.userId,
      officerId: result.row.officerId,
      actionType: 'PPK_FINALIZED',
      entityType: 'ppk_submission',
      entityId: result.row.id,
      oldData: null,
      newData: {
        period: periodKey(result.row.periodYear, result.row.periodMonth),
        total: result.totals.total,
        forced: result.forced,
        force_reason: result.forced ? input.forceReason : null,
      },
      ipAddress: 'submission-final',
      userAgent: null,
    });
  } catch {
    // Audit tidak boleh menggagalkan FINAL yang sah.
  }

  // C1-T11 (4+7 PPK): FINAL → Admin Ranting; BA siap → PPK.
  await notifyPpkFinal(
    result.row.officerId,
    result.row.branchId,
    periodKey(result.row.periodYear, result.row.periodMonth),
    result.totals.total,
    actor.userId,
  );

  return toPpkResponse(result.row);
}

/**
 * Syarat review-T4 #1 (dipakai finalize + countersign T5): bendahara FINAL PPK
 * wajib STAF_KEUANGAN *seranting* dengan setoran (`branchId` sama).
 */
export async function assertPpkBendaharaScope(
  tx: DbOrTx,
  bendaharaUserId: string,
  submissionBranchId: string,
): Promise<void> {
  const row = await tx.query.users.findFirst({
    where: eq(schema.users.id, bendaharaUserId),
    columns: { role: true, branchId: true },
  });
  // Kontrak T4 dipertahankan: peran salah → 400; scope salah → 403 (baru T5).
  if (!row || row.role !== 'STAF_KEUANGAN') {
    throw Errors.VALIDATION_ERROR('Penandatangan kedua harus Staf Keuangan (Bendahara/Sekretaris).');
  }
  if (row.branchId !== submissionBranchId) {
    throw Errors.FORBIDDEN_SCOPE('Penandatangan kedua harus Bendahara/Sekretaris ranting setoran ini.');
  }
}

/**
 * Syarat review-T4 #1 tingkat ranting: bendahara MWC = STAF_KEUANGAN level
 * distrik (`branchId` kosong) satu distrik dengan ranting itu.
 */
export async function assertMwcBendaharaScope(
  tx: DbOrTx,
  bendaharaUserId: string,
  submissionDistrictId: string,
): Promise<void> {
  const row = await tx.query.users.findFirst({
    where: eq(schema.users.id, bendaharaUserId),
    columns: { role: true, branchId: true, districtId: true },
  });
  if (!row || row.role !== 'STAF_KEUANGAN') {
    throw Errors.VALIDATION_ERROR('Penandatangan kedua harus Staf Keuangan MWC.');
  }
  if (row.branchId !== null || row.districtId !== submissionDistrictId) {
    throw Errors.FORBIDDEN_SCOPE('Penandatangan kedua harus Bendahara/Sekretaris MWC distrik ini.');
  }
}

// ---------------------------------------------------------------------------
// FINAL ranting (mekanik; orkestrasi berlapis + FINAL_NOL massal = T6).
// ---------------------------------------------------------------------------

export type BranchVarianceReason = 'KURANG_BAYAR' | 'LEBIH_BAYAR' | 'GABUNG_PERIODE' | 'KOREKSI_ADMIN' | 'HP_HILANG';

export interface BranchFinalizeInput {
  submissionId: string;
  shareMwc: number;
  varianceReason?: BranchVarianceReason;
  linkedPeriods?: string[];
  rantingSignerId: string;
  mwcBendaharaSignerId: string;
  expectedVersion?: number;
  /** Kunci 0 pemasukan (ranting diam): totals harus 0 + alasan wajib. */
  asNol?: boolean;
}

export interface BranchFinalNumbers {
  total: number;
  bisyarohTotal: number;
  collectionCount: number;
  expectedShare: number;
  shareMwc: number;
  variance: number;
  cans: Record<string, number>;
}

type BranchNumbersInput = Pick<BranchFinalizeInput, 'shareMwc' | 'varianceReason' | 'linkedPeriods' | 'asNol'>;
type BranchSubmissionRow = typeof schema.branchSubmissions.$inferSelect;

/**
 * Gerbang §7.2 + hitung §8 + snapshot kaleng — dipakai finalize (T4) dan
 * sign tingkat ranting (T5). Murni baca + validasi; tidak menulis apa pun.
 */
export async function computeBranchFinalValues(
  tx: DbOrTx,
  sub: BranchSubmissionRow,
  input: BranchNumbersInput,
): Promise<BranchFinalNumbers> {
  const ppkRows = await tx.query.ppkSubmissions.findMany({
    where: and(
      eq(schema.ppkSubmissions.branchId, sub.branchId),
      eq(schema.ppkSubmissions.periodYear, sub.periodYear),
      eq(schema.ppkSubmissions.periodMonth, sub.periodMonth),
    ),
    with: { officer: { columns: { fullName: true } } },
  });
  const openNames = ppkRows.filter((r) => r.status !== 'FINAL').map((r) => r.officer?.fullName ?? r.officerId);
  if (openNames.length > 0) {
    const sebut = openNames.slice(0, 3).join(', ');
    const lebih = openNames.length > 3 ? ` (+${openNames.length - 3} lainnya)` : '';
    throw Errors.VALIDATION_ERROR(`Masih ada PPK belum FINAL: ${sebut}${lebih}.`);
  }

  let total = 0;
  let bisyarohTotal = 0;
  let collectionCount = 0;
  for (const r of ppkRows) {
    total += Number(r.totalAmount);
    bisyarohTotal += Number(r.bisyarohAmount);
    collectionCount += r.collectionCount;
  }
  const expectedShare = calcExpectedShare(total, bisyarohTotal);
  const shareMwc = Math.round(input.shareMwc);
  if (!Number.isInteger(shareMwc) || shareMwc < 0) {
    throw Errors.VALIDATION_ERROR('share_mwc harus bilangan bulat >= 0.');
  }
  const variance = calcShareVariance(shareMwc, expectedShare);

  // C1-T8 (§8b): program MWC tak wajib setor share (100% milik MWC) — gerbang
  // selisih/wajib-alasan hanya untuk RANTING. Variance tetap dihitung untuk
  // display; asNol tetap butuh alasan (disengaja vs kebetulan).
  const branchKindRow = await tx.query.branches.findFirst({
    where: eq(schema.branches.id, sub.branchId),
    columns: { kind: true },
  });
  const isProgram = (branchKindRow?.kind ?? 'RANTING') !== 'RANTING';

  if (input.asNol) {
    if (total !== 0 || shareMwc !== 0) {
      throw Errors.VALIDATION_ERROR('FINAL_NOL hanya untuk 0 pemasukan.');
    }
    if (!input.varianceReason) {
      throw Errors.VALIDATION_ERROR('FINAL_NOL wajib alasan (mis. tidak ada laporan).');
    }
  } else if (!isProgram && needsVarianceReason(variance) && !input.varianceReason) {
    throw Errors.VALIDATION_ERROR(
      `Selisih share Rp ${variance} di luar toleransi Rp 10.000 — wajib alasan (KURANG_BAYAR/LEBIH_BAYAR/GABUNG_PERIODE/KOREKSI_ADMIN).`,
    );
  }
  if (input.varianceReason === 'GABUNG_PERIODE' && (!input.linkedPeriods || input.linkedPeriods.length === 0)) {
    throw Errors.VALIDATION_ERROR('GABUNG_PERIODE wajib cantumkan periode terkait (mis. 2026-07, 2026-08).');
  }

  const canRows = await tx
    .select({ condition: schema.cans.condition, n: sql<number>`count(*)::int` })
    .from(schema.cans)
    .where(eq(schema.cans.branchId, sub.branchId))
    .groupBy(schema.cans.condition);
  const cans: Record<string, number> = { AKTIF: 0, NON_AKTIF: 0, RUSAK: 0, HILANG: 0, DIKEMBALIKAN: 0 };
  for (const r of canRows) cans[r.condition] = r.n;

  return { total, bisyarohTotal, collectionCount, expectedShare, shareMwc, variance, cans };
}

export async function finalizeBranchSubmission(actor: SubmissionActor, input: BranchFinalizeInput, now: Date = new Date()) {
  const result = await db.transaction(async (tx) => {
    const sub = await tx.query.branchSubmissions.findFirst({
      where: eq(schema.branchSubmissions.id, input.submissionId),
    });
    if (!sub) throw Errors.VALIDATION_ERROR('Setoran ranting tidak ditemukan');
    assertReopenWindowOpen(sub, now);

    // Kunci Ranting = Manager Subarea (ketua ranting). MWC massal = T6.
    if (actor.role !== 'ADMIN_RANTING' || !actor.branchId || actor.branchId !== sub.branchId) {
      throw Errors.FORBIDDEN('Hanya Admin Ranting pemilik yang mengunci setoran rantingnya');
    }

    if (sub.status !== 'DRAFT') {
      throw Errors.CONFLICT('Setoran ranting ini sudah dikunci — tidak bisa dikunci dua kali.');
    }

    if (input.expectedVersion !== undefined && input.expectedVersion !== sub.version) {
      throw Errors.CONFLICT('Setoran berubah — muat ulang lalu coba lagi.', {
        expected_version: input.expectedVersion,
        current_version: sub.version,
      });
    }

    // Gerbang §7.2 + angka (§8) — dipakai finalize (T4) dan sign (T5).
    const computed = await computeBranchFinalValues(tx, sub, {
      shareMwc: input.shareMwc,
      varianceReason: input.varianceReason,
      linkedPeriods: input.linkedPeriods,
      asNol: input.asNol,
    });
    const { total, bisyarohTotal, collectionCount, expectedShare, shareMwc, variance, cans } = computed;

    // Syarat review-T0 →T4 butir 1 (tingkat ranting): kedua signer terisi.
    // Jangkar: penandatangan ranting = Admin Ranting pemanggil; kedua = Keuangan MWC.
    if (!input.rantingSignerId || !input.mwcBendaharaSignerId) {
      throw Errors.VALIDATION_ERROR('Kunci ranting wajib dua tanda tangan: Admin Ranting dan Bendahara MWC.');
    }
    if (input.rantingSignerId === input.mwcBendaharaSignerId) {
      throw Errors.VALIDATION_ERROR('Admin Ranting dan Bendahara MWC harus dua orang berbeda.');
    }
    if (input.rantingSignerId !== actor.userId) {
      throw Errors.VALIDATION_ERROR('Penandatangan ranting harus Admin Ranting yang mengunci.');
    }
    // Syarat review-T4 #1 (T5): bendahara MWC = STAF_KEUANGAN level distrik
    // (tanpa branchId) satu distrik dengan ranting itu.
    await assertMwcBendaharaScope(tx, input.mwcBendaharaSignerId, sub.districtId);

    // F7/D-14: nomor BA org — sekali per submission; sekuens per MWC
    // (distrik) jalan terus lintas bulan.
    const baNumber = sub.baNumber ?? (await nextBaNumber(tx, { scopeType: 'MWC', scopeId: sub.districtId }, now));

    const updated = await tx
      .update(schema.branchSubmissions)
      .set({
        totalAmount: BigInt(total),
        bisyarohTotal: BigInt(bisyarohTotal),
        shareMwc: BigInt(shareMwc),
        netAmount: BigInt(total - bisyarohTotal - shareMwc),
        expectedShare: BigInt(expectedShare),
        shareVariance: BigInt(variance),
        varianceReason: input.varianceReason ?? null,
        linkedPeriods: input.linkedPeriods ?? null,
        collectionCount,
        canTotal: cans.AKTIF + cans.NON_AKTIF + cans.RUSAK + cans.HILANG + cans.DIKEMBALIKAN,
        canAktif: cans.AKTIF,
        canNonaktif: cans.NON_AKTIF,
        canRusak: cans.RUSAK,
        canHilang: cans.HILANG,
        canDikembalikan: cans.DIKEMBALIKAN,
        formulaSnapshot: { ...BRANCH_FORMULA_SNAPSHOT },
        status: input.asNol ? 'FINAL_NOL' : 'FINAL',
        finalizedAt: now,
        finalizedBy: actor.userId,
        rantingSignerId: input.rantingSignerId,
        rantingSignedAt: sub.rantingSignedAt ?? now,
        mwcBendaharaSignerId: input.mwcBendaharaSignerId,
        mwcBendaharaSignedAt: sub.mwcBendaharaSignedAt ?? now,
        reopenedUntil: null,
        baNumber,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.branchSubmissions.id, sub.id),
          eq(schema.branchSubmissions.status, 'DRAFT'),
          eq(schema.branchSubmissions.version, sub.version),
        ),
      )
      .returning();
    if (updated.length === 0) {
      throw Errors.CONFLICT('Setoran ranting baru saja dikunci pihak lain.');
    }
    return { row: updated[0], variance };
  });

  try {
    await insertActivityLog({
      userId: actor.userId,
      officerId: null,
      actionType: 'BRANCH_FINALIZED',
      entityType: 'branch_submission',
      entityId: result.row.id,
      oldData: null,
      newData: {
        period: periodKey(result.row.periodYear, result.row.periodMonth),
        status: result.row.status,
        share_mwc: Number(result.row.shareMwc),
        variance: result.variance,
      },
      ipAddress: 'submission-final',
      userAgent: null,
    });
  } catch {
    // Audit tidak boleh menggagalkan kunci yang sah.
  }

  // C1-T11 (7): branch FINAL → Admin Ranting (BA siap unduh). Jalur legacy
  // T4 ini jarang dipakai (upacara T5 via countersign) tapi tetap di-hook.
  await notifyBaSiapBranch(
    result.row.branchId,
    periodKey(result.row.periodYear, result.row.periodMonth),
    actor.userId,
  );

  return toBranchResponse(result.row);
}

// ---------------------------------------------------------------------------
// Presentasi (bigint → number; pola toMobileHistoryItem).
// ---------------------------------------------------------------------------

type PpkRow = typeof schema.ppkSubmissions.$inferSelect;
type BranchRow = typeof schema.branchSubmissions.$inferSelect;

export function toPpkResponse(r: PpkRow) {
  return {
    id: r.id,
    officer_id: r.officerId,
    branch_id: r.branchId,
    period: periodKey(r.periodYear, r.periodMonth),
    period_year: r.periodYear,
    period_month: r.periodMonth,
    total_amount: Number(r.totalAmount),
    collection_count: r.collectionCount,
    bisyaroh_amount: Number(r.bisyarohAmount),
    net_amount: Number(r.netAmount),
    formula_snapshot: r.formulaSnapshot,
    status: r.status,
    finalized_at: r.finalizedAt,
    ppk_signer_id: r.ppkSignerId,
    bendahara_signer_id: r.bendaharaSignerId,
    version: r.version,
    pdf_url: r.pdfUrl,
    ba_number: r.baNumber,
  };
}

export function toBranchResponse(r: BranchRow) {
  return {
    id: r.id,
    branch_id: r.branchId,
    period: periodKey(r.periodYear, r.periodMonth),
    period_year: r.periodYear,
    period_month: r.periodMonth,
    total_amount: Number(r.totalAmount),
    bisyaroh_total: Number(r.bisyarohTotal),
    share_mwc: Number(r.shareMwc),
    net_amount: Number(r.netAmount),
    expected_share: Number(r.expectedShare),
    share_variance: Number(r.shareVariance),
    variance_reason: r.varianceReason,
    linked_periods: r.linkedPeriods,
    collection_count: r.collectionCount,
    can_total: r.canTotal,
    can_aktif: r.canAktif,
    can_nonaktif: r.canNonaktif,
    can_rusak: r.canRusak,
    can_hilang: r.canHilang,
    can_dikembalikan: r.canDikembalikan,
    formula_snapshot: r.formulaSnapshot,
    status: r.status,
    finalized_at: r.finalizedAt,
    ranting_signer_id: r.rantingSignerId,
    mwc_bendahara_signer_id: r.mwcBendaharaSignerId,
    version: r.version,
    pdf_url: r.pdfUrl,
    ba_number: r.baNumber,
  };
}
