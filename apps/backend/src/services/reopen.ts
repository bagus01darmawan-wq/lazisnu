/**
 * C1-T7 — Reopen menular (§14.8 REOPEN MENULAR C-5).
 *
 * - Reopen 1 PPK (FINAL) otomatis menurunkan `branch_submissions` pasangannya
 *   yang sudah FINAL/FINAL_NOL ke DRAFT + menghanguskan TTD tingkat 2.
 * - Reopen langsung 1 ranting (FINAL/FINAL_NOL, mis. massal T6) juga didukung.
 * - Yang berhak: Admin Ranting pemilik + ADMIN_KECAMATAN (apa saja, sedistrik).
 *   Wajib alasan + audit. Scope di server, bukan UI.
 * - Efek per baris yang diturunkan: arsip PDF versi lama ke `ba_pdf_archives`
 *   (SEBELUM di-null-kan — F1b), TTD + coretan dihanguskan (kolom NULL, file
 *   R2 dihapus best-effort — bukan key hantu), `pdf_url/pdf_hash` NULL,
 *   `version + 1`, `reopened_until = now + 48 jam`, `finalized_*` NULL.
 * - Bytes PDF lama TIDAK dihapus dari R2 (arsip imut; unduhan lama tetap
 *   terverifikasi via tabel arsip). Yang dihapus hanya coretan TTD.
 * - Jendela 2x24 jam: tulis (submit/resubmit/skip/sign/countersign/finalize)
 *   pada baris reopened ditolak bila `now > reopened_until` (lihat
 *   `assertReopenWindowOpen` di collectionSubmission.ts). DRAFT normal
 *   (`reopened_until` NULL) tidak terpengaruh.
 * - Buntu dihindari: reopen pada DRAFT/PPK_SIGNED yang sudah punya jendela
 *   = perpanjangan jendela (tanpa arsip/bump); DRAFT normal ditolak
 *   ("masih terbuka").
 * - Kalender: FULL reopen mengubah `period_calendar` LOCKED → DIBUKA_SEBAGIAN
 *   (ditulis hanya oleh T7). Kembali ke LOCKED saat ranting re-FINAL
 *   (di countersignBranchSubmission).
 * - Idempoten-tombol: update bersyarat `WHERE status/version` + cek baris
 *   terpengaruh → CONFLICT bila balapan.
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { and, eq } from 'drizzle-orm';
import { Errors } from '../utils/errorCatalog';
import { insertActivityLog } from './auditLogService';
import { deleteFromR2 } from './r2';
import { buildPeriodBoundaries, periodKey, reopenWindowUntil, resolvePeriodStatus } from './periodCalendar';
import { baContentHash } from './beritaAcara';
import { branchContentSnapshot, ppkContentSnapshot } from './baPdfService';
import { notifyReopen } from './notifications';
import {
  toBranchResponse,
  toPpkResponse,
  type SubmissionActor,
} from './ppkSubmissions';

/** Jendela 2x24 jam — rumah di periodCalendar.ts (netral antarsiklik). */
export { REOPEN_WINDOW_HOURS } from './periodCalendar';

export interface ReopenInput {
  submissionId: string;
  reason: string;
  expectedVersion?: number;
}

function requireReopenReason(reason: string): string {
  const r = (reason ?? '').trim();
  if (r.length < 10) {
    throw Errors.VALIDATION_ERROR('Reopen wajib alasan (min 10 karakter).');
  }
  if (r.length > 255) {
    throw Errors.VALIDATION_ERROR('Alasan reopen maksimal 255 karakter.');
  }
  return r;
}

function windowUntil(now: Date): Date {
  return reopenWindowUntil(now);
}

async function auditReopen(params: {
  actor: SubmissionActor;
  actionType: string;
  entityType: string;
  entityId: string;
  newData: Record<string, unknown>;
}): Promise<void> {
  try {
    await insertActivityLog({
      userId: params.actor.userId,
      officerId: params.actor.officerId ?? null,
      actionType: params.actionType,
      entityType: params.entityType,
      entityId: params.entityId,
      oldData: null,
      newData: params.newData,
      ipAddress: 'reopen',
      userAgent: null,
    });
  } catch {
    // Audit tidak boleh menggagalkan reopen yang sah (pola T4–T6).
  }
}

async function deleteKeysBestEffort(keys: Array<string | null>): Promise<void> {
  for (const k of keys) {
    if (!k) continue;
    try {
      await deleteFromR2(k);
    } catch {
      // Best-effort (F1b): kegagalan hapus dicatat di audit pemanggil bila perlu.
    }
  }
}

async function ensureCalendarRowTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  year: number,
  month: number,
  now: Date,
): Promise<void> {
  const b = buildPeriodBoundaries(year, month);
  await tx
    .insert(schema.periodCalendar)
    .values({
      periodYear: year,
      periodMonth: month,
      assignDate: b.assignDate,
      dueDate: b.dueDate,
      toleranceEnd: b.toleranceEnd,
      status: resolvePeriodStatus(now, b),
    })
    .onConflictDoNothing({
      target: [schema.periodCalendar.periodYear, schema.periodCalendar.periodMonth],
    });
}

function assertPpkReopenScope(actor: SubmissionActor, subBranchId: string, branchDistrictId: string): void {
  if (actor.role === 'ADMIN_RANTING') {
    if (!actor.branchId || actor.branchId !== subBranchId) {
      throw Errors.FORBIDDEN_SCOPE('Bukan setoran ranting Anda');
    }
    return;
  }
  if (actor.role === 'ADMIN_KECAMATAN') {
    if (!actor.districtId || actor.districtId !== branchDistrictId) {
      throw Errors.FORBIDDEN_SCOPE('Bukan setoran distrik Anda');
    }
    return;
  }
  throw Errors.FORBIDDEN('Peran Anda tidak bisa me-reopen setoran PPK');
}

function assertBranchReopenScope(actor: SubmissionActor, sub: { branchId: string; districtId: string }): void {
  if (actor.role === 'ADMIN_RANTING') {
    if (!actor.branchId || actor.branchId !== sub.branchId) {
      throw Errors.FORBIDDEN_SCOPE('Bukan setoran ranting Anda');
    }
    return;
  }
  if (actor.role === 'ADMIN_KECAMATAN') {
    if (!actor.districtId || actor.districtId !== sub.districtId) {
      throw Errors.FORBIDDEN_SCOPE('Bukan setoran distrik Anda');
    }
    return;
  }
  throw Errors.FORBIDDEN('Peran Anda tidak bisa me-reopen setoran ranting');
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function archivePpkTx(tx: Tx, sub: typeof schema.ppkSubmissions.$inferSelect, actorUserId: string, reason: string): Promise<void> {
  await tx
    .insert(schema.baPdfArchives)
    .values({
      tier: 'ppk',
      submissionId: sub.id,
      version: sub.version,
      pdfKey: sub.pdfUrl,
      pdfHash: sub.pdfHash,
      contentHash: baContentHash('ppk', ppkContentSnapshot(sub)),
      status: sub.status,
      archivedBy: actorUserId,
      reopenReason: reason,
    })
    .onConflictDoNothing({
      target: [schema.baPdfArchives.tier, schema.baPdfArchives.submissionId, schema.baPdfArchives.version],
    });
}

async function archiveBranchTx(
  tx: Tx,
  sub: typeof schema.branchSubmissions.$inferSelect,
  actorUserId: string,
  reason: string,
): Promise<void> {
  await tx
    .insert(schema.baPdfArchives)
    .values({
      tier: 'branch',
      submissionId: sub.id,
      version: sub.version,
      pdfKey: sub.pdfUrl,
      pdfHash: sub.pdfHash,
      contentHash: baContentHash('branch', branchContentSnapshot(sub)),
      status: sub.status,
      archivedBy: actorUserId,
      reopenReason: reason,
    })
    .onConflictDoNothing({
      target: [schema.baPdfArchives.tier, schema.baPdfArchives.submissionId, schema.baPdfArchives.version],
    });
}

/**
 * Reopen 1 PPK FINAL → DRAFT (version+1, TTD hangus, arsip PDF, jendela 48 jam)
 * + menular ke branch pasangannya bila sudah FINAL/FINAL_NOL.
 */
export async function reopenPpkSubmission(actor: SubmissionActor, input: ReopenInput, now: Date = new Date()) {
  const reason = requireReopenReason(input.reason);
  const head = await db.query.ppkSubmissions.findFirst({
    where: eq(schema.ppkSubmissions.id, input.submissionId),
    with: { branch: { columns: { id: true, districtId: true } } },
  });
  if (!head || !head.branch) throw Errors.VALIDATION_ERROR('Setoran PPK tidak ditemukan');
  assertPpkReopenScope(actor, head.branchId, head.branch.districtId);
  if (input.expectedVersion !== undefined && input.expectedVersion !== head.version) {
    throw Errors.CONFLICT('Setoran berubah — muat ulang lalu coba lagi.');
  }

  // Perpanjangan jendela: DRAFT/PPK_SIGNED yang memang dibuka via reopen.
  // H1 (review-T7): kunci status ikut di WHERE agar re-FINAL yang commit di
  // antara baca & update tak tertimpa jendela basi (harmless, tapi diperketat).
  if (head.status !== 'FINAL') {
    if ((head.status === 'DRAFT' || head.status === 'PPK_SIGNED') && head.reopenedUntil !== null) {
      const until = windowUntil(now);
      const statusGuard =
        head.status === 'DRAFT'
          ? eq(schema.ppkSubmissions.status, 'DRAFT')
          : eq(schema.ppkSubmissions.status, 'PPK_SIGNED');
      const updated = await db
        .update(schema.ppkSubmissions)
        .set({ reopenedUntil: until, updatedAt: now })
        .where(
          input.expectedVersion !== undefined
            ? and(eq(schema.ppkSubmissions.id, head.id), eq(schema.ppkSubmissions.version, head.version), statusGuard)
            : and(eq(schema.ppkSubmissions.id, head.id), statusGuard),
        )
        .returning();
      if (updated.length === 0) throw Errors.CONFLICT('Setoran baru saja berubah — muat ulang lalu coba lagi.');
      await auditReopen({
        actor,
        actionType: 'REOPEN_WINDOW_EXTENDED',
        entityType: 'ppk_submission',
        entityId: head.id,
        newData: { period: periodKey(head.periodYear, head.periodMonth), reopened_until: until.toISOString(), reason },
      });
      return { ...toPpkResponse(updated[0]), reopened_until: until, extended: true as const, archived_version: null as number | null, contagion: null };
    }
    throw Errors.VALIDATION_ERROR('Setoran masih terbuka — tidak perlu reopen.');
  }

  const sigKeys = [head.ppkSignatureUrl, head.bendaharaSignatureUrl];
  const until = windowUntil(now);

  const out = await db.transaction(async (tx) => {
    const sub = await tx.query.ppkSubmissions.findFirst({
      where: eq(schema.ppkSubmissions.id, input.submissionId),
    });
    if (!sub) throw Errors.VALIDATION_ERROR('Setoran PPK tidak ditemukan');
    if (sub.status !== 'FINAL') throw Errors.CONFLICT('Setoran baru saja berubah — muat ulang lalu coba lagi.');

    await archivePpkTx(tx, sub, actor.userId, reason);

    const [reopened] = await tx
      .update(schema.ppkSubmissions)
      .set({
        status: 'DRAFT',
        version: sub.version + 1,
        finalizedAt: null,
        finalizedBy: null,
        ppkSignerId: null,
        ppkSignedAt: null,
        ppkSignatureUrl: null,
        bendaharaSignerId: null,
        bendaharaSignedAt: null,
        bendaharaSignatureUrl: null,
        pdfUrl: null,
        pdfHash: null,
        reopenedUntil: until,
        updatedAt: now,
      })
      .where(and(eq(schema.ppkSubmissions.id, sub.id), eq(schema.ppkSubmissions.status, 'FINAL'), eq(schema.ppkSubmissions.version, sub.version)))
      .returning();
    if (!reopened) throw Errors.CONFLICT('Setoran baru saja di-reopen pihak lain.');

    // Menular: branch pasangan yang sudah FINAL/FINAL_NOL ikut ke DRAFT.
    let contagion: typeof schema.branchSubmissions.$inferSelect | null = null;
    const branch = await tx.query.branchSubmissions.findFirst({
      where: and(
        eq(schema.branchSubmissions.branchId, sub.branchId),
        eq(schema.branchSubmissions.periodYear, sub.periodYear),
        eq(schema.branchSubmissions.periodMonth, sub.periodMonth),
      ),
    });
    if (branch && (branch.status === 'FINAL' || branch.status === 'FINAL_NOL')) {
      await archiveBranchTx(tx, branch, actor.userId, reason);
      sigKeys.push(branch.rantingSignatureUrl, branch.mwcBendaharaSignatureUrl);
      const [demoted] = await tx
        .update(schema.branchSubmissions)
        .set({
          status: 'DRAFT',
          version: branch.version + 1,
          finalizedAt: null,
          finalizedBy: null,
          rantingSignerId: null,
          rantingSignedAt: null,
          rantingSignatureUrl: null,
          mwcBendaharaSignerId: null,
          mwcBendaharaSignedAt: null,
          mwcBendaharaSignatureUrl: null,
          pdfUrl: null,
          pdfHash: null,
          reopenedUntil: until,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.branchSubmissions.id, branch.id),
            eq(schema.branchSubmissions.status, branch.status),
            eq(schema.branchSubmissions.version, branch.version),
          ),
        )
        .returning();
      if (!demoted) throw Errors.CONFLICT('Setoran ranting baru saja berubah — muat ulang lalu coba lagi.');
      contagion = demoted;
    }

    await ensureCalendarRowTx(tx, sub.periodYear, sub.periodMonth, now);
    await tx
      .update(schema.periodCalendar)
      .set({ status: 'DIBUKA_SEBAGIAN', lockedAt: now, lockedBy: actor.userId, updatedAt: now })
      .where(
        and(
          eq(schema.periodCalendar.periodYear, sub.periodYear),
          eq(schema.periodCalendar.periodMonth, sub.periodMonth),
          eq(schema.periodCalendar.status, 'LOCKED'),
        ),
      );

    return { reopened, contagion, archivedVersion: sub.version, archivedBranchVersion: contagion ? branch!.version : null };
  });

  await deleteKeysBestEffort(sigKeys);
  await auditReopen({
    actor,
    actionType: 'PPK_REOPENED',
    entityType: 'ppk_submission',
    entityId: out.reopened.id,
    newData: {
      period: periodKey(out.reopened.periodYear, out.reopened.periodMonth),
      from_version: out.archivedVersion,
      to_version: out.reopened.version,
      reopened_until: until.toISOString(),
      reason,
      contagion_branch_id: out.contagion?.branchId ?? null,
      contagion_archived_version: out.archivedBranchVersion,
    },
  });

  // C1-T11 (5): reopen → PPK + Admin Ranting terdampak.
  await notifyReopen(
    'ppk',
    out.reopened.officerId,
    out.reopened.branchId,
    head.branch.districtId,
    periodKey(out.reopened.periodYear, out.reopened.periodMonth),
    reason,
    actor.userId,
  );

  return {
    ...toPpkResponse(out.reopened),
    reopened_until: until,
    extended: false as const,
    archived_version: out.archivedVersion,
    contagion: out.contagion
      ? { ...toBranchResponse(out.contagion), reopened_until: until, archived_version: out.archivedBranchVersion as number }
      : null,
  };
}

/**
 * Reopen langsung 1 ranting (FINAL/FINAL_NOL → DRAFT). Untuk FINAL_NOL massal
 * T6 yang butuh koreksi susulan (tanpa PPK untuk di-reopen).
 */
export async function reopenBranchSubmission(actor: SubmissionActor, input: ReopenInput, now: Date = new Date()) {
  const reason = requireReopenReason(input.reason);
  const head = await db.query.branchSubmissions.findFirst({
    where: eq(schema.branchSubmissions.id, input.submissionId),
  });
  if (!head) throw Errors.VALIDATION_ERROR('Setoran ranting tidak ditemukan');
  assertBranchReopenScope(actor, head);
  if (input.expectedVersion !== undefined && input.expectedVersion !== head.version) {
    throw Errors.CONFLICT('Setoran berubah — muat ulang lalu coba lagi.');
  }

  if (head.status !== 'FINAL' && head.status !== 'FINAL_NOL') {
    if (head.status === 'DRAFT' && head.reopenedUntil !== null) {
      const until = windowUntil(now);
      const updated = await db
        .update(schema.branchSubmissions)
        .set({ reopenedUntil: until, updatedAt: now })
        .where(
          input.expectedVersion !== undefined
            ? and(
                eq(schema.branchSubmissions.id, head.id),
                eq(schema.branchSubmissions.version, head.version),
                eq(schema.branchSubmissions.status, 'DRAFT'),
              )
            : and(eq(schema.branchSubmissions.id, head.id), eq(schema.branchSubmissions.status, 'DRAFT')),
        )
        .returning();
      if (updated.length === 0) throw Errors.CONFLICT('Setoran baru saja berubah — muat ulang lalu coba lagi.');
      await auditReopen({
        actor,
        actionType: 'REOPEN_WINDOW_EXTENDED',
        entityType: 'branch_submission',
        entityId: head.id,
        newData: { period: periodKey(head.periodYear, head.periodMonth), reopened_until: until.toISOString(), reason },
      });
      return { ...toBranchResponse(updated[0]), reopened_until: until, extended: true as const, archived_version: null as number | null };
    }
    throw Errors.VALIDATION_ERROR('Setoran masih terbuka — tidak perlu reopen.');
  }

  const sigKeys = [head.rantingSignatureUrl, head.mwcBendaharaSignatureUrl];
  const until = windowUntil(now);
  const prevStatus = head.status;

  const reopened = await db.transaction(async (tx) => {
    const sub = await tx.query.branchSubmissions.findFirst({
      where: eq(schema.branchSubmissions.id, input.submissionId),
    });
    if (!sub) throw Errors.VALIDATION_ERROR('Setoran ranting tidak ditemukan');
    if (sub.status !== 'FINAL' && sub.status !== 'FINAL_NOL') {
      throw Errors.CONFLICT('Setoran baru saja berubah — muat ulang lalu coba lagi.');
    }

    await archiveBranchTx(tx, sub, actor.userId, reason);

    const [row] = await tx
      .update(schema.branchSubmissions)
      .set({
        status: 'DRAFT',
        version: sub.version + 1,
        finalizedAt: null,
        finalizedBy: null,
        rantingSignerId: null,
        rantingSignedAt: null,
        rantingSignatureUrl: null,
        mwcBendaharaSignerId: null,
        mwcBendaharaSignedAt: null,
        mwcBendaharaSignatureUrl: null,
        pdfUrl: null,
        pdfHash: null,
        reopenedUntil: until,
        updatedAt: now,
      })
      .where(and(eq(schema.branchSubmissions.id, sub.id), eq(schema.branchSubmissions.status, sub.status), eq(schema.branchSubmissions.version, sub.version)))
      .returning();
    if (!row) throw Errors.CONFLICT('Setoran baru saja di-reopen pihak lain.');

    await ensureCalendarRowTx(tx, sub.periodYear, sub.periodMonth, now);
    await tx
      .update(schema.periodCalendar)
      .set({ status: 'DIBUKA_SEBAGIAN', lockedAt: now, lockedBy: actor.userId, updatedAt: now })
      .where(
        and(
          eq(schema.periodCalendar.periodYear, sub.periodYear),
          eq(schema.periodCalendar.periodMonth, sub.periodMonth),
          eq(schema.periodCalendar.status, 'LOCKED'),
        ),
      );

    return { row, archivedVersion: sub.version };
  });

  await deleteKeysBestEffort(sigKeys);
  await auditReopen({
    actor,
    actionType: 'BRANCH_REOPENED',
    entityType: 'branch_submission',
    entityId: reopened.row.id,
    newData: {
      period: periodKey(reopened.row.periodYear, reopened.row.periodMonth),
      from_status: prevStatus,
      from_version: reopened.archivedVersion,
      to_version: reopened.row.version,
      reopened_until: until.toISOString(),
      reason,
    },
  });

  // C1-T11 (5): reopen ranting → Admin Ranting + MWC sedistrik.
  await notifyReopen(
    'branch',
    null,
    reopened.row.branchId,
    reopened.row.districtId,
    periodKey(reopened.row.periodYear, reopened.row.periodMonth),
    reason,
    actor.userId,
  );

  return { ...toBranchResponse(reopened.row), reopened_until: until, extended: false as const, archived_version: reopened.archivedVersion };
}
