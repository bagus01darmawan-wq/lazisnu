/**
 * C1-T5 — Co-sign 2 HP + berita acara teks (§14.6, §10, syarat review-T4 #1).
 *
 * Upacara (§14.6 KEPUTUSAN C-3): PPK menandatangani di HP PPK (sesi PPK),
 * bendahara di HP bendahara (sesi bendahara), ketemu di server. `signer_id`
 * SELALU = pemilik sesi login — tidak pernah dari body (jebakan #1).
 *
 * Tingkat 1 (PPK): sign (PPK) → DRAFT→PPK_SIGNED; countersign (bendahara
 * seranting) → FINAL bila tak ada ACTIVE tersisa, atau tetap PPK_SIGNED +
 * arahan force; force-finalize (Admin Ranting pemilik, butuh PPK_SIGNED +
 * kedua TTD + alasan).
 * Tingkat 2 (ranting): sign (Admin Ranting pemilik + angka T4) → tetap DRAFT;
 * countersign (Keuangan MWC sedistrik) → FINAL/FINAL_NOL.
 * Penandatanganan ulang PPK sebelum FINAL → CONFLICT (koreksi = reopen T7);
 * sign ulang ranting selama DRAFT menimpa + audit (MWC belum terlibat).
 *
 * Coretan TTD: PNG ≤ 50KB + consent eksplisit (UU 27/2022) → R2 privat
 * (key acak) → kolom `*_signature_url` menyimpan KEY (bukan URL publik).
 * PDF/hash/unduh/verifikasi = `baPdfService.ts` (T5 §C).
 */
import { randomUUID } from 'node:crypto';
import { db } from '../config/database';
import * as schema from '../database/schema';
import { and, eq, sql } from 'drizzle-orm';
import { Errors } from '../utils/errorCatalog';
import { insertActivityLog } from './auditLogService';
import { deleteFromR2, getSignedDownloadUrl, uploadToR2 } from './r2';
import { ensureBranchBaPdf, ensurePpkBaPdf } from './baPdfService';
import {
  buildBranchBaText,
  buildPpkBaText,
  type BranchBaText,
  type PpkBaText,
} from './beritaAcara';
import {
  assertMwcBendaharaScope,
  assertPpkBendaharaScope,
  BRANCH_FORMULA_SNAPSHOT,
  computeBranchFinalValues,
  computePpkTotals,
  finalizePpkSubmission,
  toBranchResponse,
  toPpkResponse,
  type BranchVarianceReason,
  type DbOrTx,
  type SubmissionActor,
} from './ppkSubmissions';
import { periodKey } from './periodCalendar';

// ---------------------------------------------------------------------------
// Validasi murni (tanpa DB/IO) — unit-testable.
// ---------------------------------------------------------------------------

/** Coretan TTD PNG kecil (§10: <50KB). */
export const SIGNATURE_MAX_BYTES = 50 * 1024;
/** Versi teks persetujuan yang dicatat di audit saat menandatangani. */
export const SIGNATURE_CONSENT_VERSION = 'v1';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/**
 * Validasi coretan TTD: base64 valid → PNG (magic bytes) → ≤ 50KB.
 * Melempar VALIDATION_ERROR (non-retry) bila tidak memenuhi.
 */
export function parseSignaturePng(base64: string): Buffer {
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    throw Errors.VALIDATION_ERROR('Coretan tanda tangan tidak valid (base64 rusak).');
  }
  // Buffer.from tidak pernah throw untuk base64 — verifikasi round-trip.
  if (buf.length === 0 || Buffer.from(buf.toString('base64'), 'base64').length !== buf.length) {
    throw Errors.VALIDATION_ERROR('Coretan tanda tangan tidak valid (base64 rusak).');
  }
  if (buf.length < PNG_MAGIC.length || !buf.subarray(0, 4).equals(PNG_MAGIC)) {
    throw Errors.VALIDATION_ERROR('Coretan harus berkas PNG.');
  }
  if (buf.length > SIGNATURE_MAX_BYTES) {
    throw Errors.VALIDATION_ERROR('Coretan maksimal 50KB — coret lebih ringkas.');
  }
  return buf;
}

/** Key R2 acak tak tertebak (§14.9): tidak ada URL publik di DB. */
export function signatureKey(tier: 'ppk' | 'branch', submissionId: string, role: string): string {
  return `signatures/${tier}/${submissionId}/${role}-${randomUUID()}.png`;
}

// ---------------------------------------------------------------------------
// Upload coretan (R2 privat) + audit consent.
// ---------------------------------------------------------------------------

export interface RequestContext {
  ipAddress: string;
  userAgent: string | null;
}

async function uploadSignature(params: {
  tier: 'ppk' | 'branch';
  submissionId: string;
  role: string;
  pngBase64: string;
}): Promise<string> {
  const buf = parseSignaturePng(params.pngBase64);
  const key = signatureKey(params.tier, params.submissionId, params.role);
  const result = await uploadToR2({
    key,
    body: buf,
    contentType: 'image/png',
    cacheControl: 'private',
    metadata: { submissionId: params.submissionId, role: params.role },
  });
  if (!result.success || !result.key) {
    throw Errors.INTERNAL_ERROR('Penyimpanan tanda tangan gagal — coba lagi.');
  }
  return result.key;
}

async function auditSign(params: {
  userId: string;
  officerId?: string | null;
  actionType: string;
  entityType: string;
  entityId: string;
  newData: Record<string, unknown>;
  ctx: RequestContext;
}): Promise<void> {
  try {
    await insertActivityLog({
      userId: params.userId,
      officerId: params.officerId ?? null,
      actionType: params.actionType,
      entityType: params.entityType,
      entityId: params.entityId,
      oldData: null,
      newData: {
        ...params.newData,
        consent: true,
        consent_text_version: SIGNATURE_CONSENT_VERSION,
        ip: params.ctx.ipAddress,
        user_agent: params.ctx.userAgent,
      },
      ipAddress: params.ctx.ipAddress,
      userAgent: params.ctx.userAgent,
    });
  } catch {
    // Audit tidak boleh menggagalkan tanda tangan yang sah.
  }
}

// ---------------------------------------------------------------------------
// Tingkat 1 — PPK ↔ bendahara ranting.
// ---------------------------------------------------------------------------

export interface SignInput {
  submissionId: string;
  signaturePng: string;
  consent: boolean;
  expectedVersion?: number;
}

function requireConsent(consent: boolean): void {
  if (consent !== true) {
    throw Errors.VALIDATION_ERROR('Tanda tangan wajib persetujuan eksplisit (consent).');
  }
}

/** PPK menandatangani di HP-nya: DRAFT → PPK_SIGNED (sekali; ulang = CONFLICT). */
export async function signPpkSubmission(
  actor: SubmissionActor,
  input: SignInput,
  ctx: RequestContext,
  now: Date = new Date(),
) {
  if (actor.role !== 'PETUGAS' || !actor.officerId) {
    throw Errors.FORBIDDEN('Hanya PPK pemilik yang menandatangani setoran ini');
  }
  requireConsent(input.consent);

  const key = await uploadSignature({
    tier: 'ppk', submissionId: input.submissionId, role: 'ppk', pngBase64: input.signaturePng,
  });

  const row = await db.transaction(async (tx) => {
    const sub = await tx.query.ppkSubmissions.findFirst({
      where: eq(schema.ppkSubmissions.id, input.submissionId),
    });
    if (!sub) throw Errors.VALIDATION_ERROR('Setoran PPK tidak ditemukan');
    const officer = await tx.query.officers.findFirst({
      where: eq(schema.officers.id, sub.officerId),
      columns: { userId: true },
    });
    if (!officer || officer.userId !== actor.userId) {
      throw Errors.FORBIDDEN('Bukan setoran Anda');
    }
    if (sub.status !== 'DRAFT') {
      throw Errors.CONFLICT('Setoran ini sudah ditandatangani/dikunci — tidak bisa tanda tangan ulang.');
    }
    if (input.expectedVersion !== undefined && input.expectedVersion !== sub.version) {
      throw Errors.CONFLICT('Setoran berubah — muat ulang lalu coba lagi.');
    }
    const updated = await tx
      .update(schema.ppkSubmissions)
      .set({
        ppkSignerId: actor.userId,
        ppkSignedAt: now,
        ppkSignatureUrl: key,
        updatedAt: now,
        status: 'PPK_SIGNED',
      })
      .where(
        and(
          eq(schema.ppkSubmissions.id, sub.id),
          eq(schema.ppkSubmissions.status, 'DRAFT'),
          eq(schema.ppkSubmissions.version, sub.version),
        ),
      )
      .returning();
    if (updated.length === 0) {
      throw Errors.CONFLICT('Setoran baru saja berubah — muat ulang lalu coba lagi.');
    }
    return updated[0];
  });

  await auditSign({
    userId: actor.userId,
    officerId: row.officerId,
    actionType: 'PPK_SIGNED',
    entityType: 'ppk_submission',
    entityId: row.id,
    newData: { signature_key: key },
    ctx,
  });
  return toPpkResponse(row);
}

/**
 * Bendahara menandatangani di HP-nya (STAF_KEUANGAN *seranting*, syarat
 * review-T4 #1). Satu transaksi: catat TTD → bila tak ada ACTIVE tersisa
 * langsung FINAL; bila masih ada → tetap PPK_SIGNED + arahan force.
 */
export async function countersignPpkSubmission(
  actor: SubmissionActor,
  input: SignInput,
  ctx: RequestContext,
  now: Date = new Date(),
) {
  if (actor.role !== 'STAF_KEUANGAN' || !actor.branchId) {
    throw Errors.FORBIDDEN('Hanya Bendahara/Sekretaris ranting yang meng-counter-sign');
  }
  requireConsent(input.consent);

  const key = await uploadSignature({
    tier: 'ppk', submissionId: input.submissionId, role: 'bendahara', pngBase64: input.signaturePng,
  });

  const outcome = await db.transaction(async (tx) => {
    const sub = await tx.query.ppkSubmissions.findFirst({
      where: eq(schema.ppkSubmissions.id, input.submissionId),
    });
    if (!sub) throw Errors.VALIDATION_ERROR('Setoran PPK tidak ditemukan');
    if (sub.status === 'FINAL') {
      throw Errors.CONFLICT('Setoran ini sudah FINAL.');
    }
    if (sub.status !== 'PPK_SIGNED') {
      throw Errors.VALIDATION_ERROR('PPK harus menandatangani lebih dulu.');
    }
    if (!sub.ppkSignerId) {
      throw Errors.VALIDATION_ERROR('Tanda tangan PPK belum tercatat.');
    }
    if (sub.ppkSignerId === actor.userId) {
      throw Errors.VALIDATION_ERROR('PPK dan Bendahara harus dua orang berbeda.');
    }
    if (input.expectedVersion !== undefined && input.expectedVersion !== sub.version) {
      throw Errors.CONFLICT('Setoran berubah — muat ulang lalu coba lagi.');
    }
    await assertPpkBendaharaScope(tx, actor.userId, sub.branchId);

    const signed = await tx
      .update(schema.ppkSubmissions)
      .set({
        bendaharaSignerId: actor.userId,
        bendaharaSignedAt: now,
        bendaharaSignatureUrl: key,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.ppkSubmissions.id, sub.id),
          eq(schema.ppkSubmissions.status, 'PPK_SIGNED'),
          eq(schema.ppkSubmissions.version, sub.version),
        ),
      )
      .returning();
    if (signed.length === 0) {
      throw Errors.CONFLICT('Setoran baru saja berubah — muat ulang lalu coba lagi.');
    }

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

    if (activeLeft > 0) {
      return { finalized: false as const, row: signed[0], activeLeft };
    }

    // Lengkap — kunci FINAL dalam transaksi yang sama (snapshot segar T4).
    const totals = await recomputePpkInTx(tx, signed[0]);
    const finalized = await tx
      .update(schema.ppkSubmissions)
      .set({
        totalAmount: BigInt(totals.total),
        collectionCount: totals.collectionCount,
        bisyarohAmount: BigInt(totals.bisyaroh),
        netAmount: BigInt(totals.net),
        status: 'FINAL',
        finalizedAt: now,
        finalizedBy: actor.userId,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.ppkSubmissions.id, sub.id),
          eq(schema.ppkSubmissions.status, 'PPK_SIGNED'),
          eq(schema.ppkSubmissions.version, sub.version),
        ),
      )
      .returning();
    if (finalized.length === 0) {
      throw Errors.CONFLICT('Setoran baru saja di-FINAL-kan pihak lain.');
    }
    return { finalized: true as const, row: finalized[0], activeLeft: 0 };
  });

  await auditSign({
    userId: actor.userId,
    officerId: outcome.row.officerId,
    actionType: outcome.finalized ? 'PPK_COUNTERSIGNED_FINAL' : 'PPK_COUNTERSIGNED',
    entityType: 'ppk_submission',
    entityId: outcome.row.id,
    newData: { signature_key: key, finalized: outcome.finalized, active_left: outcome.activeLeft },
    ctx,
  });
  return {
    ...toPpkResponse(outcome.row),
    needs_force: !outcome.finalized,
    active_left: outcome.activeLeft,
  };
}

type PpkSubmissionRow = typeof schema.ppkSubmissions.$inferSelect;

async function recomputePpkInTx(
  tx: DbOrTx,
  sub: PpkSubmissionRow,
): Promise<{ total: number; collectionCount: number; bisyaroh: number; net: number }> {
  return computePpkTotals(tx, sub.officerId, sub.periodYear, sub.periodMonth);
}

/**
 * Force FINAL Admin Ranting: mensyaratkan PPK_SIGNED + kedua TTD tercatat
 * (force menimpa gerbang ACTIVE saja — tidak pernah syarat TTD, §9.1).
 * Mendelegasikan ke finalize T4 (gerbang peran/scope/version + audit forced).
 */
export async function forceFinalizePpkSubmission(
  actor: SubmissionActor,
  input: { submissionId: string; forceReason: string; expectedVersion?: number },
  ctx: RequestContext,
  now: Date = new Date(),
) {
  if (!input.forceReason || input.forceReason.trim().length < 5) {
    throw Errors.VALIDATION_ERROR('Force FINAL wajib alasan (min 5 karakter).');
  }
  const sub = await db.query.ppkSubmissions.findFirst({
    where: eq(schema.ppkSubmissions.id, input.submissionId),
  });
  if (!sub) throw Errors.VALIDATION_ERROR('Setoran PPK tidak ditemukan');
  if (sub.status !== 'PPK_SIGNED' || !sub.ppkSignerId || !sub.bendaharaSignerId) {
    throw Errors.VALIDATION_ERROR('Force FINAL mensyaratkan kedua TTD sudah tercatat (PPK_SIGNED).');
  }
  return finalizePpkSubmission(
    actor,
    {
      submissionId: input.submissionId,
      ppkSignerId: sub.ppkSignerId,
      bendaharaSignerId: sub.bendaharaSignerId,
      expectedVersion: input.expectedVersion,
      forceReason: input.forceReason.trim(),
    },
    now,
  );
}

// ---------------------------------------------------------------------------
// Tingkat 2 — ranting ↔ MWC.
// ---------------------------------------------------------------------------

export interface BranchSignInput {
  submissionId: string;
  signaturePng: string;
  consent: boolean;
  expectedVersion?: number;
  shareMwc: number;
  varianceReason?: BranchVarianceReason;
  linkedPeriods?: string[];
  asNol?: boolean;
}

/**
 * Admin Ranting menandatangani (angka T4 divalidasi + dibekukan ke baris,
 * status tetap DRAFT menunggu MWC). Sign ulang selama DRAFT menimpa coretan
 * sebelumnya + audit (MWC belum terlibat — beda dengan PPK yang sekali jalan).
 */
export async function signBranchSubmission(
  actor: SubmissionActor,
  input: BranchSignInput,
  ctx: RequestContext,
  now: Date = new Date(),
) {
  if (actor.role !== 'ADMIN_RANTING' || !actor.branchId) {
    throw Errors.FORBIDDEN('Hanya Admin Ranting pemilik yang menandatangani');
  }
  requireConsent(input.consent);

  const key = await uploadSignature({
    tier: 'branch', submissionId: input.submissionId, role: 'ranting', pngBase64: input.signaturePng,
  });

  const row = await db.transaction(async (tx) => {
    const sub = await tx.query.branchSubmissions.findFirst({
      where: eq(schema.branchSubmissions.id, input.submissionId),
    });
    if (!sub) throw Errors.VALIDATION_ERROR('Setoran ranting tidak ditemukan');
    if (actor.branchId !== sub.branchId) {
      throw Errors.FORBIDDEN_SCOPE('Bukan setoran ranting Anda');
    }
    if (sub.status !== 'DRAFT') {
      throw Errors.CONFLICT('Setoran ranting ini sudah dikunci.');
    }
    if (input.expectedVersion !== undefined && input.expectedVersion !== sub.version) {
      throw Errors.CONFLICT('Setoran berubah — muat ulang lalu coba lagi.');
    }
    const computed = await computeBranchFinalValues(tx, sub, {
      shareMwc: input.shareMwc,
      varianceReason: input.varianceReason,
      linkedPeriods: input.linkedPeriods,
      asNol: input.asNol,
    });
    const updated = await tx
      .update(schema.branchSubmissions)
      .set({
        totalAmount: BigInt(computed.total),
        bisyarohTotal: BigInt(computed.bisyarohTotal),
        shareMwc: BigInt(computed.shareMwc),
        netAmount: BigInt(computed.total - computed.bisyarohTotal - computed.shareMwc),
        expectedShare: BigInt(computed.expectedShare),
        shareVariance: BigInt(computed.variance),
        varianceReason: input.varianceReason ?? null,
        linkedPeriods: input.linkedPeriods ?? null,
        collectionCount: computed.collectionCount,
        canTotal: computed.cans.AKTIF + computed.cans.NON_AKTIF + computed.cans.RUSAK + computed.cans.HILANG + computed.cans.DIKEMBALIKAN,
        canAktif: computed.cans.AKTIF,
        canNonaktif: computed.cans.NON_AKTIF,
        canRusak: computed.cans.RUSAK,
        canHilang: computed.cans.HILANG,
        canDikembalikan: computed.cans.DIKEMBALIKAN,
        formulaSnapshot: { ...BRANCH_FORMULA_SNAPSHOT },
        rantingSignerId: actor.userId,
        rantingSignedAt: now,
        rantingSignatureUrl: key,
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
      throw Errors.CONFLICT('Setoran baru saja berubah — muat ulang lalu coba lagi.');
    }
    return updated[0];
  });

  await auditSign({
    userId: actor.userId,
    actionType: 'BRANCH_SIGNED',
    entityType: 'branch_submission',
    entityId: row.id,
    newData: { signature_key: key, share_mwc: input.shareMwc },
    ctx,
  });
  return toBranchResponse(row);
}

/**
 * Bendahara MWC menandatangani (STAF_KEUANGAN level distrik, tanpa branchId)
 * → FINAL / FINAL_NOL + audit. Satu transaksi; angka dihitung ulang segar
 * (tak bisa berubah pra-T7, tetapi murah dan defensif).
 */
export async function countersignBranchSubmission(
  actor: SubmissionActor,
  input: SignInput,
  ctx: RequestContext,
  now: Date = new Date(),
) {
  if (actor.role !== 'STAF_KEUANGAN') {
    throw Errors.FORBIDDEN('Hanya Bendahara/Sekretaris MWC yang meng-counter-sign');
  }
  requireConsent(input.consent);

  const key = await uploadSignature({
    tier: 'branch', submissionId: input.submissionId, role: 'mwc-bendahara', pngBase64: input.signaturePng,
  });

  const outcome = await db.transaction(async (tx) => {
    const sub = await tx.query.branchSubmissions.findFirst({
      where: eq(schema.branchSubmissions.id, input.submissionId),
    });
    if (!sub) throw Errors.VALIDATION_ERROR('Setoran ranting tidak ditemukan');
    if (sub.status !== 'DRAFT') {
      throw Errors.CONFLICT('Setoran ranting ini sudah dikunci.');
    }
    if (!sub.rantingSignerId) {
      throw Errors.VALIDATION_ERROR('Admin Ranting harus menandatangani lebih dulu.');
    }
    if (sub.rantingSignerId === actor.userId) {
      throw Errors.VALIDATION_ERROR('Admin Ranting dan Bendahara MWC harus dua orang berbeda.');
    }
    if (input.expectedVersion !== undefined && input.expectedVersion !== sub.version) {
      throw Errors.CONFLICT('Setoran berubah — muat ulang lalu coba lagi.');
    }
    await assertMwcBendaharaScope(tx, actor.userId, sub.districtId);

    // Angka segar + kewajaran terhadap yang disepakati saat sign. as_nol
    // tidak disimpan di kolom — diturunkan: nol + alasan tersimpan = FINAL_NOL.
    const storedReason = sub.varianceReason as BranchVarianceReason | null;
    const computed = await computeBranchFinalValues(tx, sub, {
      shareMwc: Number(sub.shareMwc),
      varianceReason: storedReason ?? undefined,
      linkedPeriods: (sub.linkedPeriods as string[] | null) ?? undefined,
      asNol: false,
    });
    if (computed.total !== Number(sub.totalAmount)) {
      throw Errors.CONFLICT('Angka berubah sejak ditandatangani ranting — minta tanda tangan ulang.');
    }
    // Niat NOL dikodekan sebagai (nol + alasan tersimpan): sign-time menolak
    // as_nol tanpa alasan, sehingga turunannya di sini deterministik.
    const asNol = computed.total === 0 && computed.shareMwc === 0 && storedReason !== null;

    const finalized = await tx
      .update(schema.branchSubmissions)
      .set({
        totalAmount: BigInt(computed.total),
        bisyarohTotal: BigInt(computed.bisyarohTotal),
        shareMwc: BigInt(computed.shareMwc),
        netAmount: BigInt(computed.total - computed.bisyarohTotal - computed.shareMwc),
        expectedShare: BigInt(computed.expectedShare),
        shareVariance: BigInt(computed.variance),
        collectionCount: computed.collectionCount,
        canTotal: computed.cans.AKTIF + computed.cans.NON_AKTIF + computed.cans.RUSAK + computed.cans.HILANG + computed.cans.DIKEMBALIKAN,
        canAktif: computed.cans.AKTIF,
        canNonaktif: computed.cans.NON_AKTIF,
        canRusak: computed.cans.RUSAK,
        canHilang: computed.cans.HILANG,
        canDikembalikan: computed.cans.DIKEMBALIKAN,
        formulaSnapshot: { ...BRANCH_FORMULA_SNAPSHOT },
        status: asNol ? 'FINAL_NOL' : 'FINAL',
        finalizedAt: now,
        finalizedBy: actor.userId,
        mwcBendaharaSignerId: actor.userId,
        mwcBendaharaSignedAt: now,
        mwcBendaharaSignatureUrl: key,
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
    if (finalized.length === 0) {
      throw Errors.CONFLICT('Setoran baru saja dikunci pihak lain.');
    }
    return finalized[0];
  });

  await auditSign({
    userId: actor.userId,
    actionType: 'BRANCH_COUNTERSIGNED',
    entityType: 'branch_submission',
    entityId: outcome.id,
    newData: { signature_key: key, status: outcome.status },
    ctx,
  });
  return toBranchResponse(outcome);
}

// ---------------------------------------------------------------------------
// Akses baca BA/unduh (gerbang peran + scope di server).
// ---------------------------------------------------------------------------

export interface PpkBaScope {
  officerUserId: string;
  branchId: string;
  districtId: string;
}

export function assertPpkBaAccess(
  actor: SubmissionActor,
  scope: PpkBaScope,
): void {
  if (actor.role === 'PETUGAS') {
    if (actor.userId !== scope.officerUserId) throw Errors.FORBIDDEN('Bukan setoran Anda');
    return;
  }
  if (actor.role === 'STAF_KEUANGAN' || actor.role === 'ADMIN_RANTING') {
    if (!actor.branchId || actor.branchId !== scope.branchId) {
      throw Errors.FORBIDDEN_SCOPE('Bukan setoran ranting Anda');
    }
    return;
  }
  if (actor.role === 'ADMIN_KECAMATAN') {
    if (!actor.districtId || actor.districtId !== scope.districtId) {
      throw Errors.FORBIDDEN_SCOPE('Bukan setoran distrik Anda');
    }
    return;
  }
  throw Errors.FORBIDDEN('Peran Anda tidak bisa membaca berita acara ini');
}

export interface BranchBaScope {
  branchId: string;
  districtId: string;
}

export function assertBranchBaAccess(actor: SubmissionActor, scope: BranchBaScope): void {
  if (actor.role === 'ADMIN_RANTING') {
    if (!actor.branchId || actor.branchId !== scope.branchId) {
      throw Errors.FORBIDDEN_SCOPE('Bukan setoran ranting Anda');
    }
    return;
  }
  if (actor.role === 'ADMIN_KECAMATAN') {
    if (!actor.districtId || actor.districtId !== scope.districtId) {
      throw Errors.FORBIDDEN_SCOPE('Bukan setoran distrik Anda');
    }
    return;
  }
  if (actor.role === 'STAF_KEUANGAN') {
    if (actor.branchId && actor.branchId === scope.branchId) return;
    if (!actor.branchId && actor.districtId === scope.districtId) return;
    throw Errors.FORBIDDEN_SCOPE('Bukan setoran scope Anda');
  }
  throw Errors.FORBIDDEN('Peran Anda tidak bisa membaca berita acara ini');
}

export async function getPpkBeritaAcara(actor: SubmissionActor, submissionId: string): Promise<PpkBaText> {
  const sub = await db.query.ppkSubmissions.findFirst({
    where: eq(schema.ppkSubmissions.id, submissionId),
    with: {
      officer: { columns: { userId: true, fullName: true } },
      branch: { columns: { id: true, name: true, districtId: true } },
    },
  });
  if (!sub || !sub.officer || !sub.branch) throw Errors.VALIDATION_ERROR('Setoran PPK tidak ditemukan');
  assertPpkBaAccess(actor, {
    officerUserId: sub.officer.userId,
    branchId: sub.branchId,
    districtId: sub.branch.districtId,
  });
  return buildPpkBaText({
    sub,
    officerName: sub.officer.fullName,
    branchName: sub.branch.name,
  });
}

export async function getBranchBeritaAcara(actor: SubmissionActor, submissionId: string): Promise<BranchBaText> {
  const sub = await db.query.branchSubmissions.findFirst({
    where: eq(schema.branchSubmissions.id, submissionId),
    with: { branch: { columns: { name: true } }, district: { columns: { name: true } } },
  });
  if (!sub || !sub.branch) throw Errors.VALIDATION_ERROR('Setoran ranting tidak ditemukan');
  assertBranchBaAccess(actor, { branchId: sub.branchId, districtId: sub.districtId });
  const ppks = await db.query.ppkSubmissions.findMany({
    where: and(
      eq(schema.ppkSubmissions.branchId, sub.branchId),
      eq(schema.ppkSubmissions.periodYear, sub.periodYear),
      eq(schema.ppkSubmissions.periodMonth, sub.periodMonth),
    ),
    with: { officer: { columns: { fullName: true } } },
  });
  return buildBranchBaText({
    sub,
    branchName: sub.branch.name,
    districtName: sub.district?.name ?? null,
    ppkList: ppks.map((p) => ({ officerName: p.officer?.fullName ?? p.officerId, total: Number(p.totalAmount) })),
  });
}

/** Umur signed URL unduhan BA (§14.9: pendek). */
export const BA_DOWNLOAD_URL_TTL_SECONDS = 600;

/**
 * Unduh BA: gerbang akses + wajib FINAL/FINAL_NOL → lazy-PDF (idempoten) →
 * signed URL pendek + audit tiap unduhan (§14.9). R2 gagal = "belum siap",
 * tidak menggagalkan apa pun yang sudah sah.
 */
export async function getBaDownload(
  actor: SubmissionActor,
  tier: 'ppk' | 'branch',
  submissionId: string,
  ctx: RequestContext,
): Promise<{ download_url: string; expires_in_seconds: number; pdf_hash: string; reused: boolean }> {
  if (tier === 'ppk') {
    const sub = await db.query.ppkSubmissions.findFirst({
      where: eq(schema.ppkSubmissions.id, submissionId),
      with: {
        officer: { columns: { userId: true } },
        branch: { columns: { districtId: true } },
      },
    });
    if (!sub || !sub.officer || !sub.branch) throw Errors.VALIDATION_ERROR('Setoran PPK tidak ditemukan');
    assertPpkBaAccess(actor, {
      officerUserId: sub.officer.userId,
      branchId: sub.branchId,
      districtId: sub.branch.districtId,
    });
    if (sub.status !== 'FINAL') {
      throw Errors.VALIDATION_ERROR('BA belum sah — belum kedua TTD (FINAL).');
    }
    const ensured = await ensurePpkBaPdf(submissionId);
    const url = await getSignedDownloadUrl(ensured.key, BA_DOWNLOAD_URL_TTL_SECONDS);
    if (!url) throw Errors.INTERNAL_ERROR('Berkas BA belum siap — coba unduh lagi.');
    await auditDownload(actor, 'ppk_submission', submissionId, ensured, ctx);
    return { download_url: url, expires_in_seconds: BA_DOWNLOAD_URL_TTL_SECONDS, pdf_hash: ensured.hash, reused: ensured.reused };
  }

  const sub = await db.query.branchSubmissions.findFirst({
    where: eq(schema.branchSubmissions.id, submissionId),
  });
  if (!sub) throw Errors.VALIDATION_ERROR('Setoran ranting tidak ditemukan');
  assertBranchBaAccess(actor, { branchId: sub.branchId, districtId: sub.districtId });
  if (sub.status !== 'FINAL' && sub.status !== 'FINAL_NOL') {
    throw Errors.VALIDATION_ERROR('BA belum sah — belum kedua TTD (FINAL).');
  }
  const ensured = await ensureBranchBaPdf(submissionId);
  const url = await getSignedDownloadUrl(ensured.key, BA_DOWNLOAD_URL_TTL_SECONDS);
  if (!url) throw Errors.INTERNAL_ERROR('Berkas BA belum siap — coba unduh lagi.');
  await auditDownload(actor, 'branch_submission', submissionId, ensured, ctx);
  return { download_url: url, expires_in_seconds: BA_DOWNLOAD_URL_TTL_SECONDS, pdf_hash: ensured.hash, reused: ensured.reused };
}

async function auditDownload(
  actor: SubmissionActor,
  entityType: string,
  entityId: string,
  ensured: { key: string; hash: string; reused: boolean },
  ctx: RequestContext,
): Promise<void> {
  try {
    await insertActivityLog({
      userId: actor.userId,
      officerId: actor.officerId ?? null,
      actionType: 'BA_DOWNLOADED',
      entityType,
      entityId,
      oldData: null,
      newData: { key: ensured.key, hash: ensured.hash, reused: ensured.reused },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  } catch {
    // Audit tidak boleh menggagalkan unduhan yang sah.
  }
}

// ---------------------------------------------------------------------------
// Hapus coretan (retensi UU 27/2022) — admin MWC beralasan + audit.
// Catatan: menghapus TTD membuat PDF lama tak bisa di-render ulang identik;
// arsip hash tetap untuk verifikasi (T7).
// ---------------------------------------------------------------------------

export async function purgeSignatureFile(key: string): Promise<boolean> {
  if (!key.startsWith('signatures/')) {
    throw Errors.VALIDATION_ERROR('Hanya key coretan (signatures/…) yang boleh dihapus jalur ini.');
  }
  return deleteFromR2(key);
}
