/**
 * C1-T8 — rekap MWC 2 kartu (DB nyata, R2 mock untuk co-sign).
 * FINAL/FINAL_NOL saja berangka; DRAFT = belum lapor; flag selisih.
 */
import { db, closeDbConnection } from '../../config/database';
import * as schema from '../../database/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { ErrorCode } from '../../utils/errorCatalog';
import { getMwcRecap } from '../mwcRecap';
import { ensurePpkSubmission, ensureBranchSubmission } from '../ppkSubmissions';
import { submitCollection } from '../collectionSubmission';
import { recordEmergencyAggregate } from '../emergencyAggregates';
import { signPpkSubmission, countersignPpkSubmission, signBranchSubmission, countersignBranchSubmission } from '../cosign';

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
const T0 = new Date(2026, 8, 28, 10, 0, 0);

const T8R_EMAILS = [
  'ppk-t8r@test.com', 'ppkp-t8r@test.com', 'keur-t8r@test.com', 'keup-t8r@test.com',
  'adminr-t8r@test.com', 'adminr2-t8r@test.com', 'adminp-t8r@test.com', 'keumwc-t8r@test.com', 'adminkec-t8r@test.com',
];
const T8R_BRANCH_CODES = ['BT8R-R1', 'BT8R-R2', 'BT8R-R3', 'BT8R-PROG'];
const T8R_DISTRICTS = ['DT8R'];

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
  const users = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, T8R_EMAILS));
  if (users.length > 0) {
    await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.userId, users.map((u) => u.id)));
  }
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T8R_BRANCH_CODES));
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
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T8R_BRANCH_CODES));
  const bIds = branches.map((b) => b.id);
  if (bIds.length > 0) {
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
    await db.delete(schema.ppkEmergencyAggregates).where(inArray(schema.ppkEmergencyAggregates.branchId, bIds));
    const officers = await db.select({ id: schema.officers.id }).from(schema.officers).where(inArray(schema.officers.branchId, bIds));
    for (const o of officers) {
      await db.delete(schema.assignments).where(eq(schema.assignments.officerId, o.id));
      await db.delete(schema.ppkEmergencyAggregates).where(eq(schema.ppkEmergencyAggregates.officerId, o.id));
      await db.delete(schema.officers).where(eq(schema.officers.id, o.id));
    }
    if (cIds.length > 0) await db.delete(schema.cans).where(inArray(schema.cans.id, cIds));
  }
  await db.delete(schema.periodCalendar).where(and(eq(schema.periodCalendar.periodYear, 2026), eq(schema.periodCalendar.periodMonth, 9)));
  await db.delete(schema.users).where(inArray(schema.users.email, T8R_EMAILS));
  if (bIds.length > 0) {
    await db.delete(schema.branches).where(inArray(schema.branches.id, bIds));
  }
  await db.delete(schema.districts).where(inArray(schema.districts.code, T8R_DISTRICTS));
}

describe('C1-T8 rekap MWC 2 kartu (DB, R2 mock)', () => {
  let dt8: string;
  let adminKec: { userId: string; role: string; branchId: null; districtId: string };

  async function mkUser(email: string, phone: string, role: 'PETUGAS' | 'STAF_KEUANGAN' | 'ADMIN_RANTING' | 'ADMIN_KECAMATAN', branchId: string | null, districtId: string | null) {
    const [u] = await db.insert(schema.users).values({ email, passwordHash: 'hash', fullName: email, phone, role, branchId, districtId }).returning();
    return u.id;
  }

  async function mkPpk(email: string, phone: string, code: string, branchId: string) {
    const u = await mkUser(email, phone, 'PETUGAS', branchId, null);
    const [o] = await db.insert(schema.officers).values({ userId: u, districtId: dt8, branchId, employeeCode: code, fullName: email, phone }).returning();
    return { userId: u, officerId: o.id };
  }

  async function mkCan(branchId: string, qr: string) {
    const [c] = await db.insert(schema.cans).values({ branchId, ownerName: `Owner ${qr}`, ownerWhatsapp: '084000000800', qrCode: qr }).returning();
    return c.id;
  }

  /** Kunci penuh satu PPK: submit → sign → countersign(FINAL). */
  async function lockPpk(officerId: string, branchId: string, canId: string, nominal: number, ppkUserId: string, keuUserId: string) {
    const [asg] = await db.insert(schema.assignments).values({ officerId, canId, periodYear: 2026, periodMonth: 9, status: 'ACTIVE' }).returning();
    await db.transaction(async (tx) => submitCollection(tx as never, {
      assignmentId: asg.id, canId, officerId, nominal, collectedAt: new Date(2026, 8, 25, 10, 0, 0),
    }, T0));
    const s = await ensurePpkSubmission(officerId, branchId, 2026, 9);
    const ppkActor = { userId: ppkUserId, role: 'PETUGAS', branchId, districtId: dt8, officerId };
    const keuActor = { userId: keuUserId, role: 'STAF_KEUANGAN', branchId, districtId: dt8 };
    await signPpkSubmission(ppkActor, { submissionId: s.id, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);
    await countersignPpkSubmission(keuActor, { submissionId: s.id, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);
    return s.id;
  }

  beforeAll(async () => {
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(cleanupFixtures);

    const [d1] = await db.insert(schema.districts).values({ name: 'District T8R', code: 'DT8R', regionCode: 'D8' }).returning();
    dt8 = d1.id;
    const [r1] = await db.insert(schema.branches).values({ districtId: dt8, name: 'Ranting T8R-1', code: 'BT8R-R1' }).returning();
    const [r2] = await db.insert(schema.branches).values({ districtId: dt8, name: 'Ranting T8R-2 nol', code: 'BT8R-R2' }).returning();
    const [r3] = await db.insert(schema.branches).values({ districtId: dt8, name: 'Ranting T8R-3 draft', code: 'BT8R-R3' }).returning();
    const [pg] = await db.insert(schema.branches).values({ districtId: dt8, name: 'Program T8R', code: 'BT8R-PROG', kind: 'PROGRAM_MWC' }).returning();

    const uKec = await mkUser('adminkec-t8r@test.com', '084000000815', 'ADMIN_KECAMATAN', null, dt8);
    adminKec = { userId: uKec, role: 'ADMIN_KECAMATAN', branchId: null, districtId: dt8 };
    const uKeuMwc = await mkUser('keumwc-t8r@test.com', '084000000814', 'STAF_KEUANGAN', null, dt8);
    const keuMwcActor = { userId: uKeuMwc, role: 'STAF_KEUANGAN', branchId: null, districtId: dt8 };

    // R1 FINAL: 50000 kaleng + 25000 agregat HP_HILANG (dicatat saat DRAFT).
    const p1 = await mkPpk('ppk-t8r@test.com', '084000000811', 'EMP-T8R-1', r1.id);
    const uKeu1 = await mkUser('keur-t8r@test.com', '084000000812', 'STAF_KEUANGAN', r1.id, null);
    const uAdm1 = await mkUser('adminr-t8r@test.com', '084000000813', 'ADMIN_RANTING', r1.id, null);
    const adminR1 = { userId: uAdm1, role: 'ADMIN_RANTING', branchId: r1.id, districtId: dt8 };
    const c1 = await mkCan(r1.id, 'TEST-QR-T8R-C1');
    const [asg1] = await db.insert(schema.assignments).values({ officerId: p1.officerId, canId: c1, periodYear: 2026, periodMonth: 9, status: 'ACTIVE' }).returning();
    await db.transaction(async (tx) => submitCollection(tx as never, {
      assignmentId: asg1.id, canId: c1, officerId: p1.officerId, nominal: 50000, collectedAt: new Date(2026, 8, 25, 10, 0, 0),
    }, T0));
    await ensurePpkSubmission(p1.officerId, r1.id, 2026, 9);
    await recordEmergencyAggregate(adminR1,
      { officerId: p1.officerId, year: 2026, month: 9, amount: 25000, reason: 'HP_HILANG', witnessUserId: uKeu1, note: 'uang fisik dihitung bersama bendahara' }, T0);
    const sPpk1 = await ensurePpkSubmission(p1.officerId, r1.id, 2026, 9);
    const ppkActor1 = { userId: p1.userId, role: 'PETUGAS', branchId: r1.id, districtId: dt8, officerId: p1.officerId };
    const keuActor1 = { userId: uKeu1, role: 'STAF_KEUANGAN', branchId: r1.id, districtId: dt8 };
    await signPpkSubmission(ppkActor1, { submissionId: sPpk1.id, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);
    await countersignPpkSubmission(keuActor1, { submissionId: sPpk1.id, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);
    const sBr1 = await ensureBranchSubmission(r1.id, 2026, 9);
    // 75000 → bis 8000 → sisa 67000 → ekspektasi 20100 → setor pas.
    await signBranchSubmission(adminR1, { submissionId: sBr1.id, signaturePng: TINY_PNG_B64, consent: true, shareMwc: 20100 }, CTX, T0);
    await countersignBranchSubmission(keuMwcActor, { submissionId: sBr1.id, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);

    // R2 FINAL_NOL (gaya massal: 0 + alasan).
    const uAdm2 = await mkUser('adminr2-t8r@test.com', '084000000816', 'ADMIN_RANTING', r2.id, null);
    const adminR2 = { userId: uAdm2, role: 'ADMIN_RANTING', branchId: r2.id, districtId: dt8 };
    const sBr2 = await ensureBranchSubmission(r2.id, 2026, 9);
    await signBranchSubmission(adminR2, { submissionId: sBr2.id, signaturePng: TINY_PNG_B64, consent: true, shareMwc: 0, varianceReason: 'KOREKSI_ADMIN', asNol: true }, CTX, T0);
    await countersignBranchSubmission(keuMwcActor, { submissionId: sBr2.id, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);

    // R3: DRAFT saja (belum lapor).
    await ensureBranchSubmission(r3.id, 2026, 9);

    // PROG FINAL: 30000 → bis 3000 → ekspektasi 8100; share 0 tanpa alasan
    // (gerbang selisih dilepas untuk PROGRAM_MWC, T8).
    const pp = await mkPpk('ppkp-t8r@test.com', '084000000817', 'EMP-T8R-P', pg.id);
    const uKeuP = await mkUser('keup-t8r@test.com', '084000000818', 'STAF_KEUANGAN', pg.id, null);
    const uAdmP = await mkUser('adminp-t8r@test.com', '084000000819', 'ADMIN_RANTING', pg.id, null);
    const adminP = { userId: uAdmP, role: 'ADMIN_RANTING', branchId: pg.id, districtId: dt8 };
    const cp = await mkCan(pg.id, 'TEST-QR-T8R-CP');
    await lockPpk(pp.officerId, pg.id, cp, 30000, pp.userId, uKeuP);
    const sBrP = await ensureBranchSubmission(pg.id, 2026, 9);
    await signBranchSubmission(adminP, { submissionId: sBrP.id, signaturePng: TINY_PNG_B64, consent: true, shareMwc: 0 }, CTX, T0);
    await countersignBranchSubmission(keuMwcActor, { submissionId: sBrP.id, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);
  });

  afterAll(async () => {
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(cleanupFixtures);
    await closeDbConnection();
  });

  test('gerbang: bukan MWC ditolak; periode invalid ditolak', async () => {
    await expect(getMwcRecap(
      { userId: 'x', role: 'ADMIN_RANTING', branchId: 'y', districtId: dt8 }, 2026, 9,
    )).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
    await expect(getMwcRecap(adminKec, 2026, 13)).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });

  test('2 kartu dari snapshot FINAL; DRAFT tak berangka; flag + pending', async () => {
    const res = await getMwcRecap(adminKec, 2026, 9);
    expect(res.period).toBe('2026-09');
    expect(res.rows.length).toBe(4);

    // Kartu ranting: R1 75000/8000/20100 + R2 NOL; R3 belum lapor.
    expect(res.kartu_ranting).toMatchObject({
      total: 75000, bisyaroh: 8000, ekspektasi_share: 20100, share_mwc: 20100,
      bersih: 46900, reported_count: 1, final_nol_count: 1, belum_lapor_count: 1,
    });
    // Kartu program: 30000/3000/27000, tanpa share.
    expect(res.kartu_program).toMatchObject({
      total: 30000, bisyaroh: 3000, bersih: 27000, reported_count: 1, belum_lapor_count: 0,
    });

    const byName = Object.fromEntries(res.rows.map((r) => [r.branch_name, r]));
    expect(byName['Ranting T8R-1'].status).toBe('FINAL');
    expect(byName['Ranting T8R-1'].aggregate_total).toBe(25000);
    expect(byName['Ranting T8R-1'].flags).toContain('MEMUAT_AGREGAT');
    expect(byName['Ranting T8R-2 nol'].status).toBe('FINAL_NOL');
    expect(byName['Ranting T8R-2 nol'].flags).toContain('INSIDEN_KOREKSI_ADMIN');
    expect(byName['Ranting T8R-3 draft'].status).toBe('BELUM_LAPOR');
    expect(byName['Ranting T8R-3 draft'].flags).toEqual(expect.arrayContaining(['BELUM_LAPOR', 'MASIH_DRAFT']));
    expect(byName['Program T8R'].kind).toBe('PROGRAM_MWC');
    expect(byName['Program T8R'].status).toBe('FINAL');
    expect(byName['Program T8R'].share_mwc).toBe(0);
  });
});
