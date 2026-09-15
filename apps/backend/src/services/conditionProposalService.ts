/**
 * Condition Proposal Service — usulan perubahan kondisi kaleng.
 *
 * Aturan yang dipatuhi modul ini:
 * - sistem mengusulkan, admin yang memutuskan (tidak ada perubahan kondisi otomatis
 *   dari ambang kosong);
 * - idempoten: usulan pending untuk (can, kondisi tujuan) yang sama tidak dibuat dua kali;
 * - persetujuan memeriksa kepemilikan kaleng dengan pemeriksaan yang sama seperti
 *   `canService` (bukan hanya menyembunyikan tombol di web);
 * - perubahan `cans.condition` + `isActive` + penutupan usulan lain terjadi dalam satu transaksi;
 * - usulan APPROVED sekaligus menjadi riwayat: siapa mengubah apa, kapan, atas dasar apa.
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { Errors } from '../utils/errorCatalog';
import { getLatestCollectionCondition } from './collectionSubmission';
import { assertCanAccess } from './canService';
import {
  ASSIGNABLE_CONDITIONS,
  EMPTY_STREAK_THRESHOLD,
  countTrailingEmptyCollections,
  isTrackedForCondition,
  isTransitionAllowed,
  proposalForSkipReason,
  shouldProposeInactive,
  shouldRestoreActive,
} from './conditionRules';
import type { CanConditionValue } from './conditionRules';
import { scopeCondition } from './overviewService';
import type { OverviewScopeInput } from './overviewService';
import { JWTPayload } from '../middleware/auth';

export type ProposalTriggerSource = 'EMPTY_THRESHOLD' | 'SKIP_REASON' | 'MANUAL';

export interface CreateProposalInput {
  canId: string;
  toCondition: CanConditionValue;
  triggerSource: ProposalTriggerSource;
  reasonCode: string;
  reasonNote?: string | null;
  evidenceCount?: number | null;
}

/** Usulan pending untuk kaleng + kondisi tujuan yang sama (untuk idempotensi). */
export async function findPendingProposal(canId: string, toCondition: CanConditionValue) {
  return db.query.canConditionProposals.findFirst({
    where: and(
      eq(schema.canConditionProposals.canId, canId),
      eq(schema.canConditionProposals.toCondition, toCondition),
      eq(schema.canConditionProposals.status, 'PENDING'),
    ),
  });
}

/**
 * Buat usulan bila belum ada usulan pending untuk transisi yang sama.
 * Mengembalikan usulan yang dibuat, usulan pending yang sudah ada, atau `null`
 * bila kondisi kaleng sudah sama dengan tujuan.
 */
export async function createConditionProposal(input: CreateProposalInput) {
  const can = await db.query.cans.findFirst({
    where: eq(schema.cans.id, input.canId),
    columns: { id: true, condition: true, isActive: true },
  });
  if (!can) throw new AppError('NOT_FOUND', 'Kaleng tidak ditemukan', 404);

  const from = can.condition as CanConditionValue;
  if (from === input.toCondition) return null;
  if (!isTransitionAllowed(from, input.toCondition)) {
    throw Errors.VALIDATION_ERROR(`Transisi kondisi ${from} → ${input.toCondition} tidak diizinkan`);
  }

  const existing = await findPendingProposal(input.canId, input.toCondition);
  if (existing) return existing;

  const [created] = await db.insert(schema.canConditionProposals).values({
    canId: input.canId,
    fromCondition: from,
    toCondition: input.toCondition,
    triggerSource: input.triggerSource,
    reasonCode: input.reasonCode,
    reasonNote: input.reasonNote ?? null,
    evidenceCount: input.evidenceCount ?? null,
    status: 'PENDING',
  }).returning();

  return created;
}

/**
 * Usulan dari kode alasan tidak terjemput (CAN_LOST → HILANG, CAN_DAMAGED → RUSAK).
 * Dipanggil setelah assignment berhasil ditutup sebagai UNCOLLECTED.
 */
export async function createProposalFromSkipReason(
  canId: string,
  reasonCode: string,
  reasonNote?: string | null,
) {
  const toCondition = proposalForSkipReason(reasonCode);
  if (!toCondition) return null;
  return createConditionProposal({
    canId,
    toCondition,
    triggerSource: 'SKIP_REASON',
    reasonCode,
    reasonNote,
  });
}

/**
 * Konteks persetujuan = payload JWT pengguna (sudah memuat `userId`, role, dan scope).
 * Alias ini dipakai agar maksudnya eksplisit di signature service.
 */
export type ApprovalContext = JWTPayload;

/**
 * Setujui usulan: ubah kondisi kaleng + tutup usulan lain dalam satu transaksi.
 * Kepemilikan kaleng diperiksa dengan `canService.assertCanAccess`.
 */
export async function approveConditionProposal(
  proposalId: string,
  ctx: ApprovalContext,
  reasonNote?: string | null,
) {
  const proposal = await db.query.canConditionProposals.findFirst({
    where: eq(schema.canConditionProposals.id, proposalId),
    with: { can: { columns: { id: true, branchId: true, condition: true, isActive: true } } },
  });
  if (!proposal) throw new AppError('NOT_FOUND', 'Usulan tidak ditemukan', 404);
  if (proposal.status !== 'PENDING') {
    throw Errors.VALIDATION_ERROR(`Usulan sudah berstatus ${proposal.status}`);
  }

  await assertCanAccess(ctx, proposal.can, 'Usulan ini bukan milik ranting/kecamatan Anda');

  const from = proposal.can.condition as CanConditionValue;
  const to = proposal.toCondition as CanConditionValue;

  // Kondisi kaleng bisa sudah berubah (mis. diubah manual) — jangan menimpa tanpa validasi.
  if (from !== proposal.fromCondition) {
    throw new AppError(
      'CONDITION_CHANGED',
      `Kondisi kaleng sudah berubah menjadi ${from}; usulan ini tidak lagi relevan`,
      409,
    );
  }
  if (!isTransitionAllowed(from, to)) {
    throw Errors.VALIDATION_ERROR(`Transisi kondisi ${from} → ${to} tidak diizinkan`);
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.update(schema.cans)
      .set({ condition: to, isActive: isTrackedForCondition(to), updatedAt: now })
      .where(eq(schema.cans.id, proposal.canId));

    await tx.update(schema.canConditionProposals)
      .set({
        status: 'APPROVED',
        approvedBy: ctx.userId ?? null,
        approvedAt: now,
        reasonNote: reasonNote ?? proposal.reasonNote,
      })
      .where(eq(schema.canConditionProposals.id, proposalId));

    // Usulan pending lain untuk kaleng yang sama tidak lagi relevan.
    await tx.update(schema.canConditionProposals)
      .set({
        status: 'REJECTED',
        approvedBy: ctx.userId ?? null,
        approvedAt: now,
        reasonNote: 'Ditutup otomatis: kondisi kaleng sudah berubah',
      })
      .where(and(
        eq(schema.canConditionProposals.canId, proposal.canId),
        eq(schema.canConditionProposals.status, 'PENDING'),
      ));
  });

  return {
    proposal_id: proposalId,
    can_id: proposal.canId,
    from_condition: from,
    to_condition: to,
    approved_at: now,
  };
}

/** Tolak usulan. Tidak menyentuh kondisi kaleng. */
export async function rejectConditionProposal(
  proposalId: string,
  ctx: ApprovalContext,
  reasonNote?: string | null,
) {
  const proposal = await db.query.canConditionProposals.findFirst({
    where: eq(schema.canConditionProposals.id, proposalId),
    with: { can: { columns: { id: true, branchId: true } } },
  });
  if (!proposal) throw new AppError('NOT_FOUND', 'Usulan tidak ditemukan', 404);
  if (proposal.status !== 'PENDING') {
    throw Errors.VALIDATION_ERROR(`Usulan sudah berstatus ${proposal.status}`);
  }

  await assertCanAccess(ctx, proposal.can, 'Usulan ini bukan milik ranting/kecamatan Anda');

  const now = new Date();
  const [updated] = await db.update(schema.canConditionProposals)
    .set({
      status: 'REJECTED',
      approvedBy: ctx.userId ?? null,
      approvedAt: now,
      reasonNote: reasonNote ?? proposal.reasonNote,
    })
    .where(eq(schema.canConditionProposals.id, proposalId))
    .returning();

  return updated;
}

/**
 * Riwayat penjemputan VALID satu kaleng, terbaru → terlama.
 * Hanya baris `sync_status = COMPLETED` versi submit terbaru (`getLatestCollectionCondition`),
 * sehingga resubmit tidak dihitung dua kali dan kunjungan verifikasi tidak ikut terhitung.
 */
export async function getValidCollectionNominals(canId: string, limit = 24) {
  const rows = await db
    .select({ nominal: schema.collections.nominal, collectedAt: schema.collections.collectedAt })
    .from(schema.collections)
    .where(and(
      eq(schema.collections.canId, canId),
      eq(schema.collections.syncStatus, 'COMPLETED'),
      getLatestCollectionCondition(),
    ))
    .orderBy(desc(schema.collections.collectedAt))
    .limit(limit);

  return rows.map((r) => Number(r.nominal));
}

export type EmptyStreakAction = 'NONE' | 'PROPOSED_INACTIVE' | 'RESTORED_ACTIVE';

/**
 * Evaluasi satu kaleng:
 * 1. kaleng NON_AKTIF yang kembali berisi nominal positif → otomatis kembali AKTIF;
 * 2. penjemputan kosong berturut-turut mencapai ambang → **mengusulkan** NON_AKTIF
 *    (kondisi TIDAK berubah sebelum admin menyetujui).
 *
 * Hitungan tidak disimpan; selalu dihitung ulang dari riwayat agar tidak bisa melenceng.
 */
export async function evaluateEmptyStreakForCan(canId: string) {
  const can = await db.query.cans.findFirst({
    where: eq(schema.cans.id, canId),
    columns: { id: true, condition: true, isActive: true },
  });
  if (!can) throw new AppError('NOT_FOUND', 'Kaleng tidak ditemukan', 404);

  const condition = can.condition as CanConditionValue;
  const nominals = await getValidCollectionNominals(canId);
  const emptyStreak = countTrailingEmptyCollections(nominals);
  const latestNominal = nominals[0] ?? 0;

  if (shouldRestoreActive(condition, latestNominal)) {
    await db.update(schema.cans)
      .set({ condition: 'AKTIF', isActive: true, updatedAt: new Date() })
      .where(eq(schema.cans.id, canId));
    return { can_id: canId, empty_streak: emptyStreak, action: 'RESTORED_ACTIVE' as EmptyStreakAction };
  }

  if (shouldProposeInactive(condition, emptyStreak)) {
    const proposal = await createConditionProposal({
      canId,
      toCondition: 'NON_AKTIF',
      triggerSource: 'EMPTY_THRESHOLD',
      reasonCode: 'EMPTY_STREAK',
      reasonNote: `${emptyStreak} penjemputan kosong berturut-turut (ambang ${EMPTY_STREAK_THRESHOLD})`,
      evidenceCount: emptyStreak,
    });
    return {
      can_id: canId,
      empty_streak: emptyStreak,
      action: 'PROPOSED_INACTIVE' as EmptyStreakAction,
      proposal_id: proposal?.id,
    };
  }

  return { can_id: canId, empty_streak: emptyStreak, action: 'NONE' as EmptyStreakAction };
}

/**
 * Evaluasi ambang untuk seluruh kaleng yang masih menerima tugas pada satu scope.
 * Dipakai oleh endpoint admin yang dipicu manual — penjadwalan otomatis belum
 * dinyalakan (sesuai larangan fase 0/1), jadi pemanggilnya harus eksplisit.
 */
export async function evaluateEmptyStreakForScope(
  scope: OverviewScopeInput,
  limit = 200,
) {
  const cans = await db
    .select({ id: schema.cans.id })
    .from(schema.cans)
    .where(and(
      scopeCondition(scope),
      eq(schema.cans.isActive, true),
      inArray(schema.cans.condition, ASSIGNABLE_CONDITIONS),
    ))
    .limit(limit);

  const results: Awaited<ReturnType<typeof evaluateEmptyStreakForCan>>[] = [];
  for (const can of cans) {
    results.push(await evaluateEmptyStreakForCan(can.id));
  }

  return {
    evaluated: results.length,
    proposed_inactive: results.filter((r) => r.action === 'PROPOSED_INACTIVE').length,
    restored_active: results.filter((r) => r.action === 'RESTORED_ACTIVE').length,
    results,
  };
}