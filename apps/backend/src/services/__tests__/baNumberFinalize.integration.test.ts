/**
 * F7/D-14 — Nomor BA org end-to-end (DB nyata, R2 tak tersentuh).
 * - FINAL PPK pertama per ranting → 001/BA/X/2026; kedua → 002 (jalan terus).
 * - FINAL ranting → sekuens MWC sendiri (001).
 * - Reopen + FINAL ulang → nomor LAMA dipertahankan (stabil lintas versi).
 * - Teks BA memuat nomor + terbilang.
 */
import { db, closeDbConnection } from '../../config/database';
import * as schema from '../../database/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getPpkBeritaAcara } from '../cosign';
import { ensureBranchSubmission, ensurePpkSubmission, finalizeBranchSubmission, finalizePpkSubmission } from '../ppkSubmissions';
import { reopenPpkSubmission } from '../reopen';
import { submitCollection } from '../collectionSubmission';

const OCT5 = new Date(2026, 9, 5, 10, 0, 0); // Okt → X/2026
const SEP25 = new Date(2026, 8, 25, 10, 0, 0);
const CTX_EMAILS = ['ppk-bf7a@test.com', 'ppk-bf7b@test.com', 'keur-bf7@test.com', 'adminr-bf7@test.com', 'keumwc-bf7@test.com'];
const BRANCH_CODES = ['BT-BF7-R1'];
const DISTRICT_CODES = ['DT-BF7'];

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

async function cleanupFixtures() {
  // 0. Jejak audit dulu (FK user/officer memblokir hapus fixture).
  const users0 = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, CTX_EMAILS));
  if (users0.length > 0) {
    await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.userId, users0.map((u) => u.id)));
  }
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, BRANCH_CODES));
  const bIds = branches.map((b) => b.id);
  if (bIds.length > 0) {
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
    if (officers.length > 0) {
      await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.officerId, officers.map((o) => o.id)));
    }
    for (const o of officers) {
      await db.delete(schema.assignments).where(eq(schema.assignments.officerId, o.id));
      await db.delete(schema.officers).where(eq(schema.officers.id, o.id));
    }
    if (cIds.length > 0) await db.delete(schema.cans).where(inArray(schema.cans.id, cIds));
    // Counter nomor ikut dibersihkan agar rerun deterministik (001 lagi).
    for (const b of bIds) {
      await db.delete(schema.baCounters).where(and(eq(schema.baCounters.scopeType, 'RANTING'), eq(schema.baCounters.scopeId, b)));
    }
  }
  const users = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, CTX_EMAILS));
  if (users.length > 0) {
    await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.userId, users.map((u) => u.id)));
  }
  await db.delete(schema.users).where(inArray(schema.users.email, CTX_EMAILS));
  if (bIds.length > 0) await db.delete(schema.branches).where(inArray(schema.branches.id, bIds));
  const dts = await db.select({ id: schema.districts.id }).from(schema.districts).where(inArray(schema.districts.code, DISTRICT_CODES));
  for (const d of dts) {
    await db.delete(schema.baCounters).where(and(eq(schema.baCounters.scopeType, 'MWC'), eq(schema.baCounters.scopeId, d.id)));
  }
  await db.delete(schema.districts).where(inArray(schema.districts.code, DISTRICT_CODES));
}

describe('F7 nomor BA org saat FINAL', () => {
  let dt: string; let bR1: string;
  let uPpk1: string; let uPpk2: string; let uKeuR: string;
  let off1: string; let off2: string;
  let ppk1: any; let ppk2: any; let keuR: any; let adminR: any; let keuMwc: any;
  let sub1Id: string; let sub2Id: string;

  beforeAll(async () => {
    await withImmutableRulesDisabled(cleanupFixtures);
    const [d] = await db.insert(schema.districts).values({ name: 'DT BF7', code: 'DT-BF7', regionCode: 'BF' }).returning();
    dt = d.id;
    const [r] = await db.insert(schema.branches).values({ districtId: dt, name: 'Ranting BF7', code: 'BT-BF7-R1' }).returning();
    bR1 = r.id;
    const mkUser = async (email: string, phone: string, role: any, branchId: string | null, districtId: string | null) =>
      (await db.insert(schema.users).values({ email, passwordHash: 'h', fullName: email, phone, role, branchId, districtId }).returning())[0].id;
    uPpk1 = await mkUser('ppk-bf7a@test.com', '084000001101', 'PETUGAS', bR1, null);
    uPpk2 = await mkUser('ppk-bf7b@test.com', '084000001102', 'PETUGAS', bR1, null);
    uKeuR = await mkUser('keur-bf7@test.com', '084000001103', 'STAF_KEUANGAN', bR1, null);
    const uAdm = await mkUser('adminr-bf7@test.com', '084000001104', 'ADMIN_RANTING', bR1, null);
    const uKeuMwc = await mkUser('keumwc-bf7@test.com', '084000001105', 'STAF_KEUANGAN', null, dt);
    off1 = (await db.insert(schema.officers).values({ userId: uPpk1, districtId: dt, branchId: bR1, employeeCode: 'EMP-BF7-1', fullName: 'PPK BF7 Satu', phone: '084000001101' }).returning())[0].id;
    off2 = (await db.insert(schema.officers).values({ userId: uPpk2, districtId: dt, branchId: bR1, employeeCode: 'EMP-BF7-2', fullName: 'PPK BF7 Dua', phone: '084000001102' }).returning())[0].id;
    ppk1 = { userId: uPpk1, role: 'PETUGAS', branchId: bR1, districtId: dt, officerId: off1 };
    ppk2 = { userId: uPpk2, role: 'PETUGAS', branchId: bR1, districtId: dt, officerId: off2 };
    keuR = { userId: uKeuR, role: 'STAF_KEUANGAN', branchId: bR1, districtId: dt };
    adminR = { userId: uAdm, role: 'ADMIN_RANTING', branchId: bR1, districtId: dt };
    keuMwc = { userId: uKeuMwc, role: 'STAF_KEUANGAN', branchId: null, districtId: dt };
    for (const [off, qr, nom] of [[off1, 'TEST-QR-BF7-1', 100000], [off2, 'TEST-QR-BF7-2', 50000]] as const) {
      const [can] = await db.insert(schema.cans).values({ branchId: bR1, ownerName: `Owner ${qr}`, ownerWhatsapp: '084000001100', qrCode: qr }).returning();
      const [asg] = await db.insert(schema.assignments).values({ officerId: off, canId: can.id, periodYear: 2026, periodMonth: 9, status: 'ACTIVE' }).returning();
      await db.transaction(async (tx) => {
        await submitCollection(tx as never, { assignmentId: asg.id, canId: can.id, officerId: off, nominal: nom, collectedAt: SEP25 }, SEP25);
      });
    }
  });

  afterAll(async () => {
    await withImmutableRulesDisabled(cleanupFixtures);
    await closeDbConnection();
  });

  test('FINAL PPK #1 → 001, #2 → 002 (sekuens ranting jalan terus)', async () => {
    const s1 = await ensurePpkSubmission(off1, bR1, 2026, 9);
    sub1Id = s1.id;
    const r1 = await finalizePpkSubmission(keuR, { submissionId: sub1Id, ppkSignerId: uPpk1, bendaharaSignerId: uKeuR }, OCT5);
    expect(r1.status).toBe('FINAL');
    expect(r1.ba_number).toBe('001/BA/X/2026');
    const s2 = await ensurePpkSubmission(off2, bR1, 2026, 9);
    sub2Id = s2.id;
    const r2 = await finalizePpkSubmission(keuR, { submissionId: sub2Id, ppkSignerId: uPpk2, bendaharaSignerId: uKeuR }, OCT5);
    expect(r2.ba_number).toBe('002/BA/X/2026');
  });

  test('teks BA memuat nomor + terbilang', async () => {
    const ba = await getPpkBeritaAcara(ppk1, sub1Id);
    expect(ba.ba_number).toBe('001/BA/X/2026');
    expect(ba.form_code).toBe('F-NUCARE/PYL-10 Rev. 0');
    expect(ba.statements.join('\n')).toContain('Seratus Ribu Rupiah (Rp 100.000)');
  });

  test('FINAL ranting → sekuens MWC sendiri (001)', async () => {
    const s = await ensureBranchSubmission(bR1, 2026, 9);
    const res = await finalizeBranchSubmission(adminR, {
      submissionId: s.id, shareMwc: 40500,
      rantingSignerId: adminR.userId, mwcBendaharaSignerId: keuMwc.userId,
    }, OCT5);
    expect(res.status).toBe('FINAL');
    expect(res.ba_number).toBe('001/BA/X/2026');
  });

  test('reopen + FINAL ulang → nomor lama dipertahankan', async () => {
    const re = await reopenPpkSubmission(adminR, { submissionId: sub1Id, reason: 'ada koreksi susulan nominal' }, OCT5);
    expect(re.status).toBe('DRAFT');
    expect(re.ba_number).toBe('001/BA/X/2026');
    const fin = await finalizePpkSubmission(keuR, { submissionId: sub1Id, ppkSignerId: uPpk1, bendaharaSignerId: uKeuR }, OCT5);
    expect(fin.status).toBe('FINAL');
    expect(fin.ba_number).toBe('001/BA/X/2026');
  });
});
