/**
 * C1-T7 — reopen menular + arsip PDF per versi + jendela 48 jam (DB nyata).
 * R2 di-mock (pola cosign T5). Periode fixed 2026-09 + now injeksi + cleanup
 * audit dulu (pola T3→T6).
 */
import { db, closeDbConnection } from '../../config/database';
import * as schema from '../../database/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { ErrorCode } from '../../utils/errorCatalog';
import { reopenBranchSubmission, reopenPpkSubmission, REOPEN_WINDOW_HOURS } from '../reopen';
import {
  countersignBranchSubmission,
  countersignPpkSubmission,
  getBaDownload,
  signBranchSubmission,
  signPpkSubmission,
} from '../cosign';
import { ensureBranchSubmission, ensurePpkSubmission } from '../ppkSubmissions';
import { assertReopenWindowOpen, resubmitCollection, submitCollection } from '../collectionSubmission';
import { baContentHash } from '../beritaAcara';
import { branchContentSnapshot, ppkContentSnapshot, verifyBaRecord } from '../baPdfService';

jest.mock('../r2', () => ({
  uploadToR2: jest.fn(async (p: { key: string }) => ({ success: true, key: p.key })),
  getSignedDownloadUrl: jest.fn(async () => 'https://signed.test/ba.pdf'),
  deleteFromR2: jest.fn(async () => true),
  downloadFromR2: jest.fn(async () =>
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )),
}));

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const CTX = { ipAddress: '127.0.0.1', userAgent: 'jest' } as const;

const T0 = new Date(2026, 9, 12, 10, 0, 0);
const LATE = new Date(T0.getTime() + REOPEN_WINDOW_HOURS * 3_600_000 + 3_600_000);

const T7_EMAILS = [
  'ppk-t7@test.com', 'keur-t7@test.com', 'adminr-t7@test.com',
  'keumwc-t7@test.com', 'adminkec-t7@test.com', 'adminkecb-t7@test.com',
  'adminr3-t7@test.com',
];
const T7_BRANCH_CODES = ['BT7-R1', 'BT7-R2', 'BT7-R3', 'BT7-PROG'];
const T7_DISTRICTS = ['DT7', 'DT7-B'];

async function withImmutableRulesDisabled(fn: () => Promise<void>) {
  await db.execute(sql`DROP RULE IF EXISTS disable_delete_koleksi ON collections`);
  await db.execute(sql`DROP RULE IF EXISTS disable_update_nominal_koleksi ON collections`);
  try {
    await fn();
  } finally {
    await db.execute(sql`CREATE OR REPLACE RULE disable_delete_koleksi AS ON DELETE TO collections DO INSTEAD NOTHING`);
    await db.execute(sql`CREATE OR REPLACE RULE disable_update_nominal_koleksi AS ON UPDATE TO collections WHERE NEW.nominal <> OLD.nominal DO INSTEAD NOTHING`);
  }
}

async function deleteMyAuditTrails() {
  const users = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, T7_EMAILS));
  if (users.length > 0) {
    await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.userId, users.map((u) => u.id)));
  }
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T7_BRANCH_CODES));
  if (branches.length > 0) {
    const bIds = branches.map((b) => b.id);
    const ppks = await db.select({ id: schema.ppkSubmissions.id }).from(schema.ppkSubmissions).where(inArray(schema.ppkSubmissions.branchId, bIds));
    const brs = await db.select({ id: schema.branchSubmissions.id }).from(schema.branchSubmissions).where(inArray(schema.branchSubmissions.branchId, bIds));
    const ids = [...ppks.map((p) => p.id), ...brs.map((b) => b.id)];
    if (ids.length > 0) {
      await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.entityId, ids));
      await db.delete(schema.baPdfArchives).where(inArray(schema.baPdfArchives.submissionId, ids));
    }
  }
}

async function cleanupFixtures() {
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T7_BRANCH_CODES));
  const bIds = branches.map((b) => b.id);
  if (bIds.length > 0) {
    // Cross-talk T3: preparePeriodDraft membuat draft untuk SEMUA ranting —
    // hapus dulu agar FK draft_items → officers tak memblokir cleanup.
    const drafts = await db.select({ id: schema.periodDrafts.id }).from(schema.periodDrafts).where(inArray(schema.periodDrafts.branchId, bIds));
    const dIds = drafts.map((d) => d.id);
    if (dIds.length > 0) {
      await db.delete(schema.periodDraftItems).where(inArray(schema.periodDraftItems.draftId, dIds));
      await db.delete(schema.periodDrafts).where(inArray(schema.periodDrafts.id, dIds));
    }
    const cans = await db.select({ id: schema.cans.id }).from(schema.cans).where(inArray(schema.cans.branchId, bIds));
    const cIds = cans.map((c) => c.id);
    if (cIds.length > 0) {
      await db.delete(schema.collections).where(inArray(schema.collections.canId, cIds));
      await db.delete(schema.assignments).where(inArray(schema.assignments.canId, cIds));
    }
    const ppks = await db.select({ id: schema.ppkSubmissions.id }).from(schema.ppkSubmissions).where(inArray(schema.ppkSubmissions.branchId, bIds));
    const brs = await db.select({ id: schema.branchSubmissions.id }).from(schema.branchSubmissions).where(inArray(schema.branchSubmissions.branchId, bIds));
    const subIds = [...ppks.map((p) => p.id), ...brs.map((b) => b.id)];
    if (subIds.length > 0) {
      await db.delete(schema.baPdfArchives).where(inArray(schema.baPdfArchives.submissionId, subIds));
    }
    for (const p of ppks) await db.delete(schema.ppkSubmissions).where(eq(schema.ppkSubmissions.id, p.id));
    for (const b of brs) await db.delete(schema.branchSubmissions).where(eq(schema.branchSubmissions.id, b.id));
    const officers = await db.select({ id: schema.officers.id }).from(schema.officers).where(inArray(schema.officers.branchId, bIds));
    for (const o of officers) {
      await db.delete(schema.assignments).where(eq(schema.assignments.officerId, o.id));
      await db.delete(schema.officers).where(eq(schema.officers.id, o.id));
    }
    if (cIds.length > 0) await db.delete(schema.cans).where(inArray(schema.cans.id, cIds));
  }
  // FK period_calendar.locked_by → users: kalender SEBELUM users.
  await db.delete(schema.periodCalendar).where(and(eq(schema.periodCalendar.periodYear, 2026), eq(schema.periodCalendar.periodMonth, 9)));
  // FK users.branch_id → branches: users SEBELUM branches.
  await db.delete(schema.users).where(inArray(schema.users.email, T7_EMAILS));
  if (bIds.length > 0) {
    await db.delete(schema.branches).where(inArray(schema.branches.id, bIds));
  }
  await db.delete(schema.districts).where(inArray(schema.districts.code, T7_DISTRICTS));
}

describe('C1-T7 reopen menular + arsip + jendela (DB, R2 mock)', () => {
  let dt7: string;
  let bR1: string;
  let bR2: string;
  let bR3: string;
  let off1: string;
  let uPpk1: string;

  let ppk1: { userId: string; role: string; branchId: string; districtId: string; officerId: string };
  let keuR1: { userId: string; role: string; branchId: string; districtId: string };
  let adminR1: { userId: string; role: string; branchId: string; districtId: string };
  let adminR3: { userId: string; role: string; branchId: string; districtId: string };
  let keuMwc: { userId: string; role: string; branchId: null; districtId: string };
  let adminKec: { userId: string; role: string; branchId: null; districtId: string };
  let adminKecB: { userId: string; role: string; branchId: null; districtId: string };

  let ppkSubId: string;
  let branchSubId: string;
  let colId: string;
  let asgId: string;
  let canId: string;

  async function mkUser(email: string, phone: string, role: 'PETUGAS' | 'STAF_KEUANGAN' | 'ADMIN_RANTING' | 'ADMIN_KECAMATAN', branchId: string | null, districtId: string | null) {
    const [u] = await db.insert(schema.users).values({ email, passwordHash: 'hash', fullName: email, phone, role, branchId, districtId }).returning();
    return u.id;
  }

  beforeAll(async () => {
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(cleanupFixtures);

    const [d1] = await db.insert(schema.districts).values({ name: 'District T7', code: 'DT7', regionCode: 'D7' }).returning();
    const [d2] = await db.insert(schema.districts).values({ name: 'District T7-B', code: 'DT7-B', regionCode: 'DB' }).returning();
    dt7 = d1.id;
    const dt7b = d2.id;

    const [r1] = await db.insert(schema.branches).values({ districtId: dt7, name: 'Ranting T7-1', code: 'BT7-R1' }).returning();
    const [r2] = await db.insert(schema.branches).values({ districtId: dt7, name: 'Ranting T7-2', code: 'BT7-R2' }).returning();
    const [r3] = await db.insert(schema.branches).values({ districtId: dt7, name: 'Ranting T7-3', code: 'BT7-R3' }).returning();
    await db.insert(schema.branches).values({ districtId: dt7, name: 'Program T7', code: 'BT7-PROG', kind: 'PROGRAM_MWC' });
    bR1 = r1.id; bR2 = r2.id; bR3 = r3.id;

    uPpk1 = await mkUser('ppk-t7@test.com', '084000000701', 'PETUGAS', bR1, null);
    const [off] = await db.insert(schema.officers).values({
      userId: uPpk1, districtId: dt7, branchId: bR1, employeeCode: 'EMP-T7-1', fullName: 'Petugas T7', phone: '084000000701',
    }).returning();
    off1 = off.id;
    const uKeu = await mkUser('keur-t7@test.com', '084000000702', 'STAF_KEUANGAN', bR1, null);
    const uAdm = await mkUser('adminr-t7@test.com', '084000000703', 'ADMIN_RANTING', bR1, null);
    const uAdm3 = await mkUser('adminr3-t7@test.com', '084000000707', 'ADMIN_RANTING', bR3, null);
    const uKeuMwc = await mkUser('keumwc-t7@test.com', '084000000704', 'STAF_KEUANGAN', null, dt7);
    const uKec = await mkUser('adminkec-t7@test.com', '084000000705', 'ADMIN_KECAMATAN', null, dt7);
    const uKecB = await mkUser('adminkecb-t7@test.com', '084000000706', 'ADMIN_KECAMATAN', null, dt7b);

    ppk1 = { userId: uPpk1, role: 'PETUGAS', branchId: bR1, districtId: dt7, officerId: off1 };
    keuR1 = { userId: uKeu, role: 'STAF_KEUANGAN', branchId: bR1, districtId: dt7 };
    adminR1 = { userId: uAdm, role: 'ADMIN_RANTING', branchId: bR1, districtId: dt7 };
    adminR3 = { userId: uAdm3, role: 'ADMIN_RANTING', branchId: bR3, districtId: dt7 };
    keuMwc = { userId: uKeuMwc, role: 'STAF_KEUANGAN', branchId: null, districtId: dt7 };
    adminKec = { userId: uKec, role: 'ADMIN_KECAMATAN', branchId: null, districtId: dt7 };
    adminKecB = { userId: uKecB, role: 'ADMIN_KECAMATAN', branchId: null, districtId: dt7b };

    const [can] = await db.insert(schema.cans).values({ branchId: bR1, ownerName: 'Owner T7', ownerWhatsapp: '084000000700', qrCode: 'TEST-QR-T7-C1' }).returning();
    canId = can.id;
    const [asg] = await db.insert(schema.assignments).values({ officerId: off1, canId: can.id, periodYear: 2026, periodMonth: 9, status: 'ACTIVE' }).returning();
    asgId = asg.id;
    const col = await db.transaction(async (tx) => submitCollection(tx as never, {
      assignmentId: asg.id, canId: can.id, officerId: off1, nominal: 50000, collectedAt: new Date(2026, 8, 25, 10, 0, 0),
    }));
    colId = col.id;

    // Kunci penuh T5: PPK sign → countersign (FINAL) → ranting sign → countersign (FINAL).
    const sPpk = await ensurePpkSubmission(off1, bR1, 2026, 9);
    ppkSubId = sPpk.id;
    await signPpkSubmission(ppk1, { submissionId: ppkSubId, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);
    await countersignPpkSubmission(keuR1, { submissionId: ppkSubId, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);
    const sBr = await ensureBranchSubmission(bR1, 2026, 9);
    branchSubId = sBr.id;
    await signBranchSubmission(adminR1, { submissionId: branchSubId, signaturePng: TINY_PNG_B64, consent: true, shareMwc: 13500 }, CTX, T0);
    await countersignBranchSubmission(keuMwc, { submissionId: branchSubId, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);

    // Unduh PDF pra-reopen agar arsip berisi key+hash nyata (F1b).
    await getBaDownload(ppk1, 'ppk', ppkSubId, CTX);
    await getBaDownload(adminR1, 'branch', branchSubId, CTX);
  });

  afterAll(async () => {
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(cleanupFixtures);
    await closeDbConnection();
  });

  test('gerbang: DRAFT ditolak, alasan pendek ditolak, scope salah 403, versi basi CONFLICT', async () => {
    // R2 disiapkan sebagai DRAFT polos (tanpa reopen).
    await ensureBranchSubmission(bR2, 2026, 9);
    const draft = await db.query.branchSubmissions.findFirst({
      where: and(eq(schema.branchSubmissions.branchId, bR2), eq(schema.branchSubmissions.periodYear, 2026), eq(schema.branchSubmissions.periodMonth, 9)),
    });
    await expect(reopenBranchSubmission(adminR1, { submissionId: draft!.id, reason: 'koreksi susulan masuk ya' }, T0)).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN_SCOPE,
    });
    const adminR2like = { ...adminR1, branchId: bR2 };
    await expect(reopenBranchSubmission(adminR2like, { submissionId: draft!.id, reason: 'pendek' }, T0)).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
    await expect(
      reopenBranchSubmission(adminR2like, { submissionId: draft!.id, reason: 'masih terbuka tidak perlu' }, T0),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    // PPK: bendahara tak berhak; MWC distrik lain tak berhak; versi basi CONFLICT.
    await expect(reopenPpkSubmission(keuR1, { submissionId: ppkSubId, reason: 'bendahara mencoba reopen' }, T0)).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
    });
    await expect(reopenPpkSubmission(adminKecB, { submissionId: ppkSubId, reason: 'mwc distrik lain mencoba' }, T0)).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN_SCOPE,
    });
    await expect(
      reopenPpkSubmission(adminR1, { submissionId: ppkSubId, reason: 'versi basi harus ditolak', expectedVersion: 999 }, T0),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    await expect(reopenPpkSubmission(adminR3, { submissionId: ppkSubId, reason: 'admin ranting lain mencoba' }, T0)).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN_SCOPE,
    });
  });

  test('F3 tier-PPK (G3b): FINAL + hash benar → true; hash salah → false', async () => {
    const live = await db.query.ppkSubmissions.findFirst({ where: eq(schema.ppkSubmissions.id, ppkSubId) });
    expect(live?.status).toBe('FINAL');
    const good = baContentHash('ppk', ppkContentSnapshot(live!));
    expect(await verifyBaRecord('ppk', ppkSubId, live!.version, good)).toBe(true);
    expect(await verifyBaRecord('ppk', ppkSubId, live!.version, '0'.repeat(64))).toBe(false);
  });

  test('reopen PPK menular penuh: arsip + TTD hangus + jendela + kalender', async () => {
    const before = await db.query.ppkSubmissions.findFirst({ where: eq(schema.ppkSubmissions.id, ppkSubId) });
    const beforeBr = await db.query.branchSubmissions.findFirst({ where: eq(schema.branchSubmissions.id, branchSubId) });
    expect(before?.status).toBe('FINAL');
    expect(beforeBr?.status).toBe('FINAL');
    const oldPpkHash = baContentHash('ppk', ppkContentSnapshot(before!));
    const oldBrHash = baContentHash('branch', branchContentSnapshot(beforeBr!));

    const res = await reopenPpkSubmission(adminR1, { submissionId: ppkSubId, reason: 'ada kaleng tertinggal belum kejemput' }, T0);
    expect(res.status).toBe('DRAFT');
    expect(res.version).toBe(2);
    expect(res.archived_version).toBe(1);
    expect(res.ppk_signer_id).toBeNull();
    expect(res.bendahara_signer_id).toBeNull();
    expect(res.reopened_until).toEqual(new Date(T0.getTime() + REOPEN_WINDOW_HOURS * 3_600_000));
    expect(res.contagion).not.toBeNull();
    expect(res.contagion?.status).toBe('DRAFT');
    expect(res.contagion?.version).toBe(2);

    // Arsip: 2 baris (ppk v1 + branch v1) berisi key+hash PDF nyata.
    const archPpk = await db.query.baPdfArchives.findFirst({
      where: and(eq(schema.baPdfArchives.tier, 'ppk'), eq(schema.baPdfArchives.submissionId, ppkSubId), eq(schema.baPdfArchives.version, 1)),
    });
    const archBr = await db.query.baPdfArchives.findFirst({
      where: and(eq(schema.baPdfArchives.tier, 'branch'), eq(schema.baPdfArchives.submissionId, branchSubId), eq(schema.baPdfArchives.version, 1)),
    });
    expect(archPpk?.contentHash).toBe(oldPpkHash);
    expect(archBr?.contentHash).toBe(oldBrHash);
    expect(archPpk?.pdfKey).toMatch(/^ba-pdfs\/ppk\//);
    expect(archPpk?.pdfHash).toMatch(/^[0-9a-f]{64}$/);
    expect(archPpk?.status).toBe('FINAL');

    // QR lama tetap SAH via arsip; versi baru (DRAFT) tidak sah.
    expect(await verifyBaRecord('ppk', ppkSubId, 1, oldPpkHash)).toBe(true);
    expect(await verifyBaRecord('branch', branchSubId, 1, oldBrHash)).toBe(true);

    // Kalender → DIBUKA_SEBAGIAN (baris dibuat T6 REKAP/KERAS atau ensure di sini).
    const cal = await db.query.periodCalendar.findFirst({
      where: and(eq(schema.periodCalendar.periodYear, 2026), eq(schema.periodCalendar.periodMonth, 9)),
    });
    expect(cal?.status).toBe('DIBUKA_SEBAGIAN');
  });

  test('jendela: tulis lewat 49 jam ditolak; perpanjang → boleh lagi', async () => {
    // Penegakan deterministik via now injeksi (choke memakai jam server).
    const row = await db.query.ppkSubmissions.findFirst({ where: eq(schema.ppkSubmissions.id, ppkSubId) });
    expect(row?.status).toBe('DRAFT');
    expect(() => assertReopenWindowOpen(row!, T0)).not.toThrow();
    expect(() => assertReopenWindowOpen(row!, LATE)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
    await expect(
      signPpkSubmission(ppk1, { submissionId: ppkSubId, signaturePng: TINY_PNG_B64, consent: true }, CTX, LATE),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

    // Perpanjang jendela via reopen ulang.
    const ext = await reopenPpkSubmission(adminKec, { submissionId: ppkSubId, reason: 'perpanjangan jendela koreksi susulan' }, LATE);
    expect(ext.extended).toBe(true);
    expect(ext.version).toBe(2);
    const after = await db.query.ppkSubmissions.findFirst({ where: eq(schema.ppkSubmissions.id, ppkSubId) });
    expect(after!.reopenedUntil!.getTime()).toBe(LATE.getTime() + REOPEN_WINDOW_HOURS * 3_600_000);
  });

  test('siklus penuh: resubmit → co-sign ulang → FINAL v2 + kalender LOCKED + QR v1&v2 sah', async () => {
    // Koreksi nominal 50000 → 60000 via resubmit (dalam jendela LATE+).
    const now2 = new Date(LATE.getTime() + 3_600_000);
    await db.transaction(async (tx) => {
      await resubmitCollection(tx as never, { collectionId: colId, nominal: 60000, alasanResubmit: 'kurang catat satu donasi' }, now2);
    });
    const recount = await ensurePpkSubmission(off1, bR1, 2026, 9);
    expect(recount.totalAmount).toBe(BigInt(60000));

    await signPpkSubmission(ppk1, { submissionId: ppkSubId, signaturePng: TINY_PNG_B64, consent: true, expectedVersion: 2 }, CTX, now2);
    const fin = await countersignPpkSubmission(keuR1, { submissionId: ppkSubId, signaturePng: TINY_PNG_B64, consent: true, expectedVersion: 2 }, CTX, now2);
    expect(fin.status).toBe('FINAL');
    expect(fin.version).toBe(2);

    const reBr = await ensureBranchSubmission(bR1, 2026, 9);
    expect(Number(reBr.totalAmount)).toBe(60000);
    await signBranchSubmission(adminR1, { submissionId: branchSubId, signaturePng: TINY_PNG_B64, consent: true, shareMwc: 13500, expectedVersion: 2 }, CTX, now2);
    const finBr = await countersignBranchSubmission(keuMwc, { submissionId: branchSubId, signaturePng: TINY_PNG_B64, consent: true, expectedVersion: 2 }, CTX, now2);
    expect(finBr.status).toBe('FINAL');
    expect(finBr.version).toBe(2);

    const cal = await db.query.periodCalendar.findFirst({
      where: and(eq(schema.periodCalendar.periodYear, 2026), eq(schema.periodCalendar.periodMonth, 9)),
    });
    expect(cal?.status).toBe('LOCKED');

    // QR v1 (arsip) dan v2 (live) sama-sama SAH; hash salah tetap false.
    const livePpk = await db.query.ppkSubmissions.findFirst({ where: eq(schema.ppkSubmissions.id, ppkSubId) });
    const h2 = baContentHash('ppk', ppkContentSnapshot(livePpk!));
    expect(await verifyBaRecord('ppk', ppkSubId, 2, h2)).toBe(true);
    expect(await verifyBaRecord('ppk', ppkSubId, 2, '0'.repeat(64))).toBe(false);
    const liveBr = await db.query.branchSubmissions.findFirst({ where: eq(schema.branchSubmissions.id, branchSubId) });
    const hb2 = baContentHash('branch', branchContentSnapshot(liveBr!));
    expect(await verifyBaRecord('branch', branchSubId, 2, hb2)).toBe(true);
  });

  test('J1: extend basi pasca re-FINAL menyelinap → CONFLICT, tanpa jendela basi', async () => {
    // Simulasi maling H1 (review-T7) secara deterministik, satu thread:
    // T-baca: admin membaca DRAFT v3. T-selinap: re-FINAL commit (FINAL v4)
    // di antara baca & tulis. T-tulis: perpanjangan basi dari bacaan T-baca
    // wajib ditolak CONFLICT dan TIDAK boleh menulis jendela basi ke baris FINAL.
    // (Varian tanpa expectedVersion ditahan statusGuard di UPDATE yang sama;
    // varian basi ini ditahan cek versi — garansi akhirnya identik.)
    const tRead = new Date(LATE.getTime() + 2 * 3_600_000);
    const re = await reopenPpkSubmission(adminR1, { submissionId: ppkSubId, reason: 'koreksi susulan kasbon donatur' }, tRead);
    expect(re.status).toBe('DRAFT');
    expect(re.version).toBe(3);
    // T-selinap: tiru finalize yang commit di tengah (direct update agar
    // deterministik — jalur asli butuh upacara 2 TTD + jendela).
    await db
      .update(schema.ppkSubmissions)
      .set({ status: 'FINAL', version: 4, reopenedUntil: null, updatedAt: new Date(tRead.getTime() + 1000) })
      .where(eq(schema.ppkSubmissions.id, ppkSubId));
    // T-tulis: perpanjangan basi → CONFLICT, bukan jendela basi.
    await expect(
      reopenPpkSubmission(adminKec, { submissionId: ppkSubId, reason: 'perpanjangan basi dari bacaan lama', expectedVersion: 3 }, new Date(tRead.getTime() + 2000)),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    const after = await db.query.ppkSubmissions.findFirst({ where: eq(schema.ppkSubmissions.id, ppkSubId) });
    expect(after?.status).toBe('FINAL');
    expect(after?.version).toBe(4);
    expect(after?.reopenedUntil).toBeNull();
  });

  test('reopen ranting langsung: FINAL_NOL massal-gaya → DRAFT v2', async () => {
    // R2: kunci NOL via upacara (total 0 + alasan) → FINAL_NOL.
    const sBr2 = await ensureBranchSubmission(bR2, 2026, 9);
    const adminR2like = { ...adminR1, branchId: bR2 };
    const keuMwcLike = keuMwc;
    await signBranchSubmission(adminR2like, { submissionId: sBr2.id, signaturePng: TINY_PNG_B64, consent: true, shareMwc: 0, varianceReason: 'KOREKSI_ADMIN', asNol: true }, CTX, T0);
    const finNol = await countersignBranchSubmission(keuMwcLike, { submissionId: sBr2.id, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);
    expect(finNol.status).toBe('FINAL_NOL');

    const res = await reopenBranchSubmission(adminKec, { submissionId: sBr2.id, reason: 'laporan susulan ranting baru masuk' }, T0);
    expect(res.status).toBe('DRAFT');
    expect(res.version).toBe(2);
    expect(res.archived_version).toBe(1);
    expect(res.ranting_signer_id).toBeNull();
    const arch = await db.query.baPdfArchives.findFirst({
      where: and(eq(schema.baPdfArchives.tier, 'branch'), eq(schema.baPdfArchives.submissionId, sBr2.id), eq(schema.baPdfArchives.version, 1)),
    });
    expect(arch?.status).toBe('FINAL_NOL');
  });
});
