/**
 * C1-T5 — upacara co-sign 2 HP + BA + PDF dengan DB nyata (§14.6/8/9).
 * R2 di-mock per pola repo (tidak ada panggilan R2 nyata di test).
 * Pola: periode fixed 2026-09 + now injeksi + cleanup audit dulu.
 */
import { db, closeDbConnection } from '../../config/database';
import * as schema from '../../database/schema';
import {
  countersignBranchSubmission,
  countersignPpkSubmission,
  forceFinalizePpkSubmission,
  getBaDownload,
  getBranchBeritaAcara,
  getPpkBeritaAcara,
  purgeSignatureFile,
  signBranchSubmission,
  signPpkSubmission,
  type RequestContext,
} from '../cosign';
import { baContentHash } from '../beritaAcara';
import { ppkContentSnapshot, branchContentSnapshot, verifyBaRecord } from '../baPdfService';
import { ensurePpkSubmission, ensureBranchSubmission } from '../ppkSubmissions';
import { submitCollection, resubmitCollection, assertAssignmentSkippable } from '../collectionSubmission';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { ErrorCode } from '../../utils/errorCatalog';

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
const OCT5 = new Date(2026, 9, 5, 12, 0, 0);
const CTX: RequestContext = { ipAddress: '127.0.0.1', userAgent: 'jest' };

const T5_EMAILS = [
  'ppk1-t5@test.com', 'ppk2-t5@test.com', 'ppk3-t5@test.com',
  'keur-t5@test.com', 'keur2-t5@test.com', 'adminr-t5@test.com', 'adminr2-t5@test.com',
  'keumwc-t5@test.com', 'keudtb-t5@test.com', 'adminkec-t5@test.com',
];
const T5_BRANCH_CODES = ['BT5-R', 'BT5-T', 'BT5-R2'];

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
  const users = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, T5_EMAILS));
  if (users.length > 0) {
    await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.userId, users.map((u) => u.id)));
  }
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T5_BRANCH_CODES));
  if (branches.length > 0) {
    const bIds = branches.map((b) => b.id);
    const ppks = await db.select({ id: schema.ppkSubmissions.id }).from(schema.ppkSubmissions).where(inArray(schema.ppkSubmissions.branchId, bIds));
    const brs = await db.select({ id: schema.branchSubmissions.id }).from(schema.branchSubmissions).where(inArray(schema.branchSubmissions.branchId, bIds));
    const ids = [...ppks.map((p) => p.id), ...brs.map((b) => b.id)];
    if (ids.length > 0) {
      await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.entityId, ids));
    }
  }
}

describe('C1-T5 co-sign 2 HP + BA + PDF (DB, R2 mock)', () => {
  let dt5: string;
  let dt5b: string;
  let branchR: string;
  let branchR2: string;
  let off1: string;
  let off2: string;
  let off3: string;
  let uPpk1: string;
  let uPpk3: string;
  let uKeuR: string;
  let uAdminR: string;
  let sub1Id: string;

  let ppk1: any;
  let ppk2: any;
  let ppk3: any;
  let keuR: any;
  let keuR2: any;
  let adminR: any;
  let adminR2: any;
  let keuMwc: any;
  let keuDTB: any;
  let adminKec: any;

  async function mkPetugas(email: string, phone: string, branchId: string, code: string, name: string) {
    const [u] = await db.insert(schema.users).values({
      email, passwordHash: 'hash', fullName: name, phone, role: 'PETUGAS', branchId,
    }).returning();
    const [o] = await db.insert(schema.officers).values({
      userId: u.id, districtId: dt5, branchId, employeeCode: code, fullName: name, phone,
    }).returning();
    return { userId: u.id, officerId: o.id };
  }

  beforeAll(async () => {
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(async () => {
      const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T5_BRANCH_CODES));
      const bIds = branches.map((b) => b.id);
      if (bIds.length > 0) {
        const cans = await db.select({ id: schema.cans.id }).from(schema.cans).where(inArray(schema.cans.branchId, bIds));
        const cIds = cans.map((c) => c.id);
        if (cIds.length > 0) {
          await db.delete(schema.collections).where(inArray(schema.collections.canId, cIds));
          await db.delete(schema.assignments).where(inArray(schema.assignments.canId, cIds));
        }
        const ppks = await db.select({ id: schema.ppkSubmissions.id }).from(schema.ppkSubmissions).where(inArray(schema.ppkSubmissions.branchId, bIds));
        for (const p of ppks) await db.delete(schema.ppkSubmissions).where(eq(schema.ppkSubmissions.id, p.id));
        const brs = await db.select({ id: schema.branchSubmissions.id }).from(schema.branchSubmissions).where(inArray(schema.branchSubmissions.branchId, bIds));
        for (const b of brs) await db.delete(schema.branchSubmissions).where(eq(schema.branchSubmissions.id, b.id));
        const officers = await db.select({ id: schema.officers.id }).from(schema.officers).where(inArray(schema.officers.branchId, bIds));
        for (const o of officers) {
          await db.delete(schema.assignments).where(eq(schema.assignments.officerId, o.id));
          await db.delete(schema.officers).where(eq(schema.officers.id, o.id));
        }
        if (cIds.length > 0) await db.delete(schema.cans).where(inArray(schema.cans.id, cIds));
        await db.delete(schema.branches).where(inArray(schema.branches.id, bIds));
      }
      await db.delete(schema.users).where(inArray(schema.users.email, T5_EMAILS));
      await db.delete(schema.districts).where(inArray(schema.districts.code, ['DT5', 'DT5-B']));
    });

    const [d1] = await db.insert(schema.districts).values({ name: 'District T5', code: 'DT5', regionCode: 'DT' }).returning();
    dt5 = d1.id;
    const [d2] = await db.insert(schema.districts).values({ name: 'District T5-B', code: 'DT5-B', regionCode: 'DB' }).returning();
    dt5b = d2.id;

    const [r] = await db.insert(schema.branches).values({ districtId: dt5, name: 'Ranting T5', code: 'BT5-R' }).returning();
    branchR = r.id;
    await db.insert(schema.branches).values({ districtId: dt5, name: 'Taqwa T5', code: 'BT5-T', kind: 'PROGRAM_MWC' });
    const [r2] = await db.insert(schema.branches).values({ districtId: dt5, name: 'Ranting T5-2', code: 'BT5-R2' }).returning();
    branchR2 = r2.id;

    const p1 = await mkPetugas('ppk1-t5@test.com', '084000000101', branchR, 'EMP-T5-1', 'Petugas T5 Satu');
    const p2 = await mkPetugas('ppk2-t5@test.com', '084000000102', branchR, 'EMP-T5-2', 'Petugas T5 Dua');
    const p3 = await mkPetugas('ppk3-t5@test.com', '084000000103', branchR2, 'EMP-T5-3', 'Petugas T5 Tiga');
    uPpk1 = p1.userId; off1 = p1.officerId;
    off2 = p2.officerId;
    uPpk3 = p3.userId; off3 = p3.officerId;

    async function mkUser(email: string, phone: string, role: 'STAF_KEUANGAN' | 'ADMIN_RANTING' | 'ADMIN_KECAMATAN', branchId: string | null, districtId: string | null) {
      const [u] = await db.insert(schema.users).values({
        email, passwordHash: 'hash', fullName: email, phone, role, branchId, districtId,
      }).returning();
      return u.id;
    }
    uKeuR = await mkUser('keur-t5@test.com', '084000000201', 'STAF_KEUANGAN', branchR, null);
    const uKeuR2 = await mkUser('keur2-t5@test.com', '084000000202', 'STAF_KEUANGAN', branchR2, null);
    uAdminR = await mkUser('adminr-t5@test.com', '084000000203', 'ADMIN_RANTING', branchR, null);
    const uAdminR2 = await mkUser('adminr2-t5@test.com', '084000000207', 'ADMIN_RANTING', branchR2, null);
    const uKeuMwc = await mkUser('keumwc-t5@test.com', '084000000204', 'STAF_KEUANGAN', null, dt5);
    const uKeuDTB = await mkUser('keudtb-t5@test.com', '084000000205', 'STAF_KEUANGAN', null, dt5b);
    const uAdminKec = await mkUser('adminkec-t5@test.com', '084000000206', 'ADMIN_KECAMATAN', null, dt5);

    ppk1 = { userId: uPpk1, role: 'PETUGAS', branchId: branchR, districtId: dt5, officerId: off1 };
    ppk2 = { userId: p2.userId, role: 'PETUGAS', branchId: branchR, districtId: dt5, officerId: off2 };
    ppk3 = { userId: uPpk3, role: 'PETUGAS', branchId: branchR2, districtId: dt5, officerId: off3 };
    keuR = { userId: uKeuR, role: 'STAF_KEUANGAN', branchId: branchR, districtId: dt5 };
    keuR2 = { userId: uKeuR2, role: 'STAF_KEUANGAN', branchId: branchR2, districtId: dt5 };
    adminR = { userId: uAdminR, role: 'ADMIN_RANTING', branchId: branchR, districtId: dt5 };
    adminR2 = { userId: uAdminR2, role: 'ADMIN_RANTING', branchId: branchR2, districtId: dt5 };
    keuMwc = { userId: uKeuMwc, role: 'STAF_KEUANGAN', branchId: null, districtId: dt5 };
    keuDTB = { userId: uKeuDTB, role: 'STAF_KEUANGAN', branchId: null, districtId: dt5b };
    adminKec = { userId: uAdminKec, role: 'ADMIN_KECAMATAN', branchId: null, districtId: dt5 };

    async function mkCan(branchId: string, qr: string) {
      const [c] = await db.insert(schema.cans).values({
        branchId, ownerName: `Owner ${qr}`, ownerWhatsapp: '084000000100', qrCode: qr,
      }).returning();
      return c.id;
    }
    const c1 = await mkCan(branchR, 'TEST-QR-T5-C1');
    const c2 = await mkCan(branchR, 'TEST-QR-T5-C2');
    const c3 = await mkCan(branchR, 'TEST-QR-T5-C3');

    async function mkAsg(officerId: string, canId: string) {
      const [a] = await db.insert(schema.assignments).values({
        officerId, canId, periodYear: 2026, periodMonth: 9, status: 'ACTIVE',
      }).returning();
      return a.id;
    }
    const a1 = await mkAsg(off1, c1);
    const a2 = await mkAsg(off1, c2);
    await mkAsg(off2, c3); // ACTIVE tersisa (jalur needs_force)
    for (const [aid, cid, nom] of [[a1, c1, 50000], [a2, c2, 100000]] as const) {
      await db.transaction(async (tx) => {
        await submitCollection(tx as never, {
          assignmentId: aid, canId: cid, officerId: off1, nominal: nom,
          collectedAt: new Date(2026, 8, 25, 10, 0, 0),
        });
      });
    }

    const s1 = await ensurePpkSubmission(off1, branchR, 2026, 9);
    sub1Id = s1.id;
  });

  afterAll(async () => {
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(async () => {
      const cans = await db.select({ id: schema.cans.id }).from(schema.cans).where(inArray(schema.cans.branchId, [branchR, branchR2]));
      const cIds = cans.map((c) => c.id);
      if (cIds.length > 0) {
        await db.delete(schema.collections).where(inArray(schema.collections.canId, cIds));
        await db.delete(schema.assignments).where(inArray(schema.assignments.canId, cIds));
      }
      const ppks = await db.select({ id: schema.ppkSubmissions.id }).from(schema.ppkSubmissions).where(inArray(schema.ppkSubmissions.branchId, [branchR, branchR2]));
      for (const p of ppks) await db.delete(schema.ppkSubmissions).where(eq(schema.ppkSubmissions.id, p.id));
      const brs = await db.select({ id: schema.branchSubmissions.id }).from(schema.branchSubmissions).where(inArray(schema.branchSubmissions.branchId, [branchR, branchR2]));
      for (const b of brs) await db.delete(schema.branchSubmissions).where(eq(schema.branchSubmissions.id, b.id));
      const officers = await db.select({ id: schema.officers.id }).from(schema.officers).where(inArray(schema.officers.branchId, [branchR, branchR2]));
      for (const o of officers) {
        await db.delete(schema.assignments).where(eq(schema.assignments.officerId, o.id));
        await db.delete(schema.officers).where(eq(schema.officers.id, o.id));
      }
      if (cIds.length > 0) await db.delete(schema.cans).where(inArray(schema.cans.id, cIds));
      await db.delete(schema.users).where(inArray(schema.users.email, T5_EMAILS));
      await db.delete(schema.branches).where(inArray(schema.branches.code, T5_BRANCH_CODES));
      await db.delete(schema.districts).where(inArray(schema.districts.code, ['DT5', 'DT5-B']));
    });
    await closeDbConnection();
  });

  test('sign: bukan pemilik 403, tanpa consent 400, PNG rusak 400, happy PPK_SIGNED, ganda CONFLICT', async () => {
    await expect(
      signPpkSubmission(ppk2, { submissionId: sub1Id, signaturePng: TINY_PNG_B64, consent: true }, CTX, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
    await expect(
      signPpkSubmission(ppk1, { submissionId: sub1Id, signaturePng: TINY_PNG_B64, consent: false }, CTX, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    await expect(
      signPpkSubmission(ppk1, {
        submissionId: sub1Id, signaturePng: Buffer.from('bukan gambar').toString('base64'), consent: true,
      }, CTX, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

    const res = await signPpkSubmission(ppk1, { submissionId: sub1Id, signaturePng: TINY_PNG_B64, consent: true }, CTX, OCT5);
    expect(res.status).toBe('PPK_SIGNED');
    expect(res.ppk_signer_id).toBe(uPpk1);
    const row = await db.query.ppkSubmissions.findFirst({ where: eq(schema.ppkSubmissions.id, sub1Id) });
    expect(row?.ppkSignatureUrl).toMatch(/^signatures\/ppk\//);
    expect(row?.version).toBe(1);

    await expect(
      signPpkSubmission(ppk1, { submissionId: sub1Id, signaturePng: TINY_PNG_B64, consent: true }, CTX, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
  });

  test('countersign: keuangan ranting lain 403 (temuan review-T4 #1)', async () => {
    await expect(
      countersignPpkSubmission(keuR2, { submissionId: sub1Id, signaturePng: TINY_PNG_B64, consent: true }, CTX, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN_SCOPE });
  });

  test('countersign happy: lengkap → FINAL', async () => {
    const res = await countersignPpkSubmission(keuR, { submissionId: sub1Id, signaturePng: TINY_PNG_B64, consent: true }, CTX, OCT5);
    expect(res.status).toBe('FINAL');
    expect(res.needs_force).toBe(false);
    expect(res.bendahara_signer_id).toBe(keuR.userId);
  });

  test('countersign sisa ACTIVE: tetap PPK_SIGNED + arahan force; lalu force ADMIN', async () => {
    const s2 = await ensurePpkSubmission(off2, branchR, 2026, 9);
    await signPpkSubmission(ppk2, { submissionId: s2.id, signaturePng: TINY_PNG_B64, consent: true }, CTX, OCT5);
    const res = await countersignPpkSubmission(keuR, { submissionId: s2.id, signaturePng: TINY_PNG_B64, consent: true }, CTX, OCT5);
    expect(res.status).toBe('PPK_SIGNED');
    expect(res.needs_force).toBe(true);
    expect(res.active_left).toBe(1);
    expect(res.bendahara_signer_id).toBe(keuR.userId);

    await expect(
      forceFinalizePpkSubmission(adminR, { submissionId: s2.id, forceReason: 'x' }, CTX, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    const forced = await forceFinalizePpkSubmission(adminR, {
      submissionId: s2.id, forceReason: 'PPK sakit, sisa 1 kaleng susulan admin',
    }, CTX, OCT5);
    expect(forced.status).toBe('FINAL');
  });

  test('force menolak DRAFT (belum PPK_SIGNED + TTD)', async () => {
    const s3 = await ensurePpkSubmission(off3, branchR2, 2026, 9);
    await expect(
      forceFinalizePpkSubmission(adminR2, { submissionId: s3.id, forceReason: 'Alasan cukup panjang' }, CTX, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });

  test('version basi: sign & countersign → CONFLICT', async () => {
    const s3row = await db.query.ppkSubmissions.findFirst({
      where: and(
        eq(schema.ppkSubmissions.officerId, off3),
        eq(schema.ppkSubmissions.periodYear, 2026),
        eq(schema.ppkSubmissions.periodMonth, 9),
      ),
    });
    await expect(
      signPpkSubmission(ppk3, {
        submissionId: s3row!.id, signaturePng: TINY_PNG_B64, consent: true, expectedVersion: 999,
      }, CTX, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    const signed = await signPpkSubmission(ppk3, {
      submissionId: s3row!.id, signaturePng: TINY_PNG_B64, consent: true,
    }, CTX, OCT5);
    expect(signed.status).toBe('PPK_SIGNED');
    await expect(
      countersignPpkSubmission(keuR2, {
        submissionId: s3row!.id, signaturePng: TINY_PNG_B64, consent: true, expectedVersion: 999,
      }, CTX, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    const fin = await countersignPpkSubmission(keuR2, {
      submissionId: s3row!.id, signaturePng: TINY_PNG_B64, consent: true,
    }, CTX, OCT5);
    expect(fin.status).toBe('FINAL');
  });

  test('kunci pasca-FINAL tetap (regresi T4: submit/resubmit/skip)', async () => {
    const [c4] = await db.insert(schema.cans).values({
      branchId: branchR, ownerName: 'Owner T5-C4', ownerWhatsapp: '084000000100', qrCode: 'TEST-QR-T5-C4',
    }).returning();
    const [asg] = await db.insert(schema.assignments).values({
      officerId: off1, canId: c4.id, periodYear: 2026, periodMonth: 9, status: 'ACTIVE',
    }).returning();
    await expect(
      db.transaction(async (tx) => {
        await submitCollection(tx as never, {
          assignmentId: asg.id, canId: c4.id, officerId: off1, nominal: 10000,
          collectedAt: new Date(2026, 8, 26, 10, 0, 0),
        });
      }),
    ).rejects.toMatchObject({ code: ErrorCode.QR_ALREADY_SUBMITTED });

    const col = await db.query.collections.findFirst({
      where: and(eq(schema.collections.officerId, off1), eq(schema.collections.submitSequence, 1)),
    });
    await expect(
      db.transaction(async (tx) => {
        await resubmitCollection(tx as never, {
          collectionId: col!.id, nominal: 51000, alasanResubmit: 'Coba koreksi pasca FINAL upacara',
        });
      }),
    ).rejects.toMatchObject({ code: ErrorCode.QR_ALREADY_SUBMITTED });

    const asgRow = await db.query.assignments.findFirst({ where: eq(schema.assignments.id, asg.id) });
    await expect(assertAssignmentSkippable(db, asgRow!)).rejects.toMatchObject({
      code: ErrorCode.QR_ALREADY_SUBMITTED,
    });
  });

  test('BA teks: DRAFT ber-cap + akses lintas-scope 403; FINAL tanpa cap + angka benar', async () => {
    const oct = await ensurePpkSubmission(off1, branchR, 2026, 10);
    expect(oct.status).toBe('DRAFT');
    const draftBa = await getPpkBeritaAcara(ppk1, oct.id);
    expect(draftBa.draft_warning).toBe('DRAFT — belum sah');
    await expect(getPpkBeritaAcara(keuMwc, oct.id)).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN_SCOPE });
    await expect(getPpkBeritaAcara(ppk2, oct.id)).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
    const adminBa = await getPpkBeritaAcara(adminKec, oct.id);
    expect(adminBa.officer_name).toBe('Petugas T5 Satu');

    const finBa = await getPpkBeritaAcara(keuR, sub1Id);
    expect(finBa.draft_warning).toBeNull();
    expect(finBa.table.map((r) => r.value)).toEqual(['Rp 150.000', 'Rp 15.000', 'Rp 135.000', '2']);
    expect(finBa.officer_name).toBe('Petugas T5 Satu');
    expect(finBa.branch_name).toBe('Ranting T5');
  });

  test('PDF: pra-FINAL ditolak; pasca-FINAL key+hash, idempoten, audit unduh', async () => {
    const oct = await ensurePpkSubmission(off1, branchR, 2026, 10);
    await expect(getBaDownload(ppk1, 'ppk', oct.id, CTX)).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });

    const first = await getBaDownload(ppk1, 'ppk', sub1Id, CTX);
    expect(first.download_url).toBe('https://signed.test/ba.pdf');
    expect(first.pdf_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.reused).toBe(false);
    const row = await db.query.ppkSubmissions.findFirst({ where: eq(schema.ppkSubmissions.id, sub1Id) });
    expect(row?.pdfUrl).toMatch(/^ba-pdfs\/ppk\//);

    const second = await getBaDownload(keuR, 'ppk', sub1Id, CTX);
    expect(second.reused).toBe(true);
    expect(second.pdf_hash).toBe(first.pdf_hash);

    const logs = await db.query.activityLogs.findMany({
      where: and(eq(schema.activityLogs.actionType, 'BA_DOWNLOADED'), eq(schema.activityLogs.entityId, sub1Id)),
    });
    expect(logs.length).toBeGreaterThanOrEqual(2);
  });

  test('verify: hash konten benar → true; salah/tak dikenal → false seragam', async () => {
    const row = await db.query.ppkSubmissions.findFirst({ where: eq(schema.ppkSubmissions.id, sub1Id) });
    const good = baContentHash('ppk', ppkContentSnapshot(row!));
    expect(await verifyBaRecord('ppk', sub1Id, row!.version, good)).toBe(true);
    expect(await verifyBaRecord('ppk', sub1Id, row!.version, '0'.repeat(64))).toBe(false);
    expect(await verifyBaRecord('ppk', sub1Id, 999, good)).toBe(false);
    expect(await verifyBaRecord('ppk', '00000000-0000-0000-0000-000000000000', 1, good)).toBe(false);
    expect(await verifyBaRecord('branch', sub1Id, row!.version, good)).toBe(false);
  });

  test('tingkat 2: bendahara ranting lain 403; MWC distrik lain 403; happy FINAL', async () => {
    await ensureBranchSubmission(branchR, 2026, 9);
    const sub = await db.query.branchSubmissions.findFirst({
      where: and(
        eq(schema.branchSubmissions.branchId, branchR),
        eq(schema.branchSubmissions.periodYear, 2026),
        eq(schema.branchSubmissions.periodMonth, 9),
      ),
    });
    // Penandatangan BA ranting = Bendahara Ranting (STAF_KEUANGAN bercakupan
    // ranting), bukan Admin Ranting. Bendahara ranting LAIN tetap ditolak
    // dengan FORBIDDEN_SCOPE (bukan FORBIDDEN) — cakupan, bukan peran.
    await expect(
      signBranchSubmission(keuR2, {
        submissionId: sub!.id, signaturePng: TINY_PNG_B64, consent: true, shareMwc: 40000,
      }, CTX, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN_SCOPE });

    const signed = await signBranchSubmission(keuR, {
      submissionId: sub!.id, signaturePng: TINY_PNG_B64, consent: true, shareMwc: 40000,
    }, CTX, OCT5);
    expect(signed.status).toBe('DRAFT');
    expect(signed.ranting_signer_id).toBe(keuR.userId);

    await expect(
      countersignBranchSubmission(keuDTB, {
        submissionId: sub!.id, signaturePng: TINY_PNG_B64, consent: true,
      }, CTX, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN_SCOPE });

    const fin = await countersignBranchSubmission(keuMwc, {
      submissionId: sub!.id, signaturePng: TINY_PNG_B64, consent: true,
    }, CTX, OCT5);
    expect(fin.status).toBe('FINAL');
    expect(fin.share_mwc).toBe(40000);
  });

  test('tingkat 2 PDF + verify + purge coretan', async () => {
    const sub = await db.query.branchSubmissions.findFirst({
      where: and(
        eq(schema.branchSubmissions.branchId, branchR),
        eq(schema.branchSubmissions.periodYear, 2026),
        eq(schema.branchSubmissions.periodMonth, 9),
      ),
    });
    const dl = await getBaDownload(adminR, 'branch', sub!.id, CTX);
    expect(dl.pdf_hash).toMatch(/^[0-9a-f]{64}$/);

    const good = baContentHash('branch', branchContentSnapshot(sub!));
    expect(await verifyBaRecord('branch', sub!.id, sub!.version, good)).toBe(true);

    const ba = await getBranchBeritaAcara(adminR, sub!.id);
    expect(ba.draft_warning).toBeNull();
    expect(ba.ppk_penyusun.length).toBe(2);

    expect(await purgeSignatureFile('signatures/ppk/x.png')).toBe(true);
    await expect(purgeSignatureFile('ba-pdfs/ppk/x.pdf')).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });
});
