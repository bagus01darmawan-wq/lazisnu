/**
 * C1-T8 — agregat darurat + salin manual (DB nyata, R2 mock untuk co-sign).
 * Pola: periode fixed 2026-09 + now injeksi + cleanup audit dulu (T3→T7).
 */
import { db, closeDbConnection } from '../../config/database';
import * as schema from '../../database/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { ErrorCode } from '../../utils/errorCatalog';
import { recordEmergencyAggregate, getAggregateTotal } from '../emergencyAggregates';
import { recordManualCollection } from '../manualCollections';
import { computePpkTotals, ensurePpkSubmission, ensureBranchSubmission } from '../ppkSubmissions';
import { submitCollection } from '../collectionSubmission';
import { signPpkSubmission, countersignPpkSubmission, getPpkBeritaAcara, signBranchSubmission, countersignBranchSubmission } from '../cosign';

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

const T8_EMAILS = [
  'ppk-t8@test.com', 'ppk2-t8@test.com', 'keur-t8@test.com', 'adminr-t8@test.com',
  'keumwc-t8@test.com', 'adminkec-t8@test.com', 'keur3-t8@test.com', 'adminr3-t8@test.com',
];
const T8_BRANCH_CODES = ['BT8-R1', 'BT8-R3'];
const T8_DISTRICTS = ['DT8'];

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
  const users = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, T8_EMAILS));
  if (users.length > 0) {
    await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.userId, users.map((u) => u.id)));
  }
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T8_BRANCH_CODES));
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
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T8_BRANCH_CODES));
  const bIds = branches.map((b) => b.id);
  if (bIds.length > 0) {
    // Cross-talk T3 (jebakan T7 #1): draft lebih dulu.
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
    // Agregat darurat T8: sebelum officers (FK officer).
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
  await db.delete(schema.users).where(inArray(schema.users.email, T8_EMAILS));
  if (bIds.length > 0) {
    await db.delete(schema.branches).where(inArray(schema.branches.id, bIds));
  }
  await db.delete(schema.districts).where(inArray(schema.districts.code, T8_DISTRICTS));
}

describe('C1-T8 agregat darurat + salin manual (DB, R2 mock)', () => {
  let dt8: string;
  let bR1: string;
  let off1: string;
  let asg1: string;
  let can1: string;

  let ppk1: { userId: string; role: string; branchId: string; districtId: string; officerId: string };
  let keuR1: { userId: string; role: string; branchId: string; districtId: string };
  let adminR1: { userId: string; role: string; branchId: string; districtId: string };
  let keuMwc: { userId: string; role: string; branchId: null; districtId: string };
  let adminR3: { userId: string; role: string; branchId: string; districtId: string };

  async function mkUser(email: string, phone: string, role: 'PETUGAS' | 'STAF_KEUANGAN' | 'ADMIN_RANTING' | 'ADMIN_KECAMATAN', branchId: string | null, districtId: string | null) {
    const [u] = await db.insert(schema.users).values({ email, passwordHash: 'hash', fullName: email, phone, role, branchId, districtId }).returning();
    return u.id;
  }

  beforeAll(async () => {
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(cleanupFixtures);

    const [d1] = await db.insert(schema.districts).values({ name: 'District T8', code: 'DT8', regionCode: 'D8' }).returning();
    dt8 = d1.id;
    const [r1] = await db.insert(schema.branches).values({ districtId: dt8, name: 'Ranting T8-1', code: 'BT8-R1' }).returning();
    const [r3] = await db.insert(schema.branches).values({ districtId: dt8, name: 'Ranting T8-3', code: 'BT8-R3' }).returning();
    bR1 = r1.id;
    const bR3 = r3.id;

    const uPpk = await mkUser('ppk-t8@test.com', '084000000801', 'PETUGAS', bR1, null);
    const [off] = await db.insert(schema.officers).values({
      userId: uPpk, districtId: dt8, branchId: bR1, employeeCode: 'EMP-T8-1', fullName: 'Petugas T8', phone: '084000000801',
    }).returning();
    off1 = off.id;
    const uKeu = await mkUser('keur-t8@test.com', '084000000802', 'STAF_KEUANGAN', bR1, null);
    const uAdm = await mkUser('adminr-t8@test.com', '084000000803', 'ADMIN_RANTING', bR1, null);
    const uKeuMwc = await mkUser('keumwc-t8@test.com', '084000000804', 'STAF_KEUANGAN', null, dt8);
    await mkUser('adminkec-t8@test.com', '084000000805', 'ADMIN_KECAMATAN', null, dt8);
    const uKeu3 = await mkUser('keur3-t8@test.com', '084000000806', 'STAF_KEUANGAN', bR3, null);
    const uAdm3 = await mkUser('adminr3-t8@test.com', '084000000807', 'ADMIN_RANTING', bR3, null);
    void uKeu3;

    ppk1 = { userId: uPpk, role: 'PETUGAS', branchId: bR1, districtId: dt8, officerId: off1 };
    keuR1 = { userId: uKeu, role: 'STAF_KEUANGAN', branchId: bR1, districtId: dt8 };
    adminR1 = { userId: uAdm, role: 'ADMIN_RANTING', branchId: bR1, districtId: dt8 };
    keuMwc = { userId: uKeuMwc, role: 'STAF_KEUANGAN', branchId: null, districtId: dt8 };
    adminR3 = { userId: uAdm3, role: 'ADMIN_RANTING', branchId: bR3, districtId: dt8 };

    const [can] = await db.insert(schema.cans).values({ branchId: bR1, ownerName: 'Owner T8', ownerWhatsapp: '084000000800', qrCode: 'TEST-QR-T8-C1' }).returning();
    can1 = can.id;
    const [asg] = await db.insert(schema.assignments).values({ officerId: off1, canId: can.id, periodYear: 2026, periodMonth: 9, status: 'ACTIVE' }).returning();
    asg1 = asg.id;
    await db.transaction(async (tx) => submitCollection(tx as never, {
      assignmentId: asg.id, canId: can.id, officerId: off1, nominal: 50000, collectedAt: new Date(2026, 8, 25, 10, 0, 0),
    }, T0));
    await ensurePpkSubmission(off1, bR1, 2026, 9);
  });

  afterAll(async () => {
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(cleanupFixtures);
    await closeDbConnection();
  });

  test('gerbang agregat: peran salah, scope salah, saksi salah, nominal & alasan', async () => {
    const good = { officerId: off1, year: 2026, month: 9, amount: 25000, reason: 'HP_HILANG' as const, witnessUserId: keuR1.userId, note: 'uang fisik dihitung bersama bendahara' };
    await expect(recordEmergencyAggregate(keuR1, good, T0)).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
    await expect(recordEmergencyAggregate(adminR3, good, T0)).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN_SCOPE });
    await expect(recordEmergencyAggregate(adminR1, { ...good, witnessUserId: keuMwc.userId }, T0)).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN_SCOPE,
    });
    await expect(recordEmergencyAggregate(adminR1, { ...good, amount: 0 }, T0)).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
    await expect(recordEmergencyAggregate(adminR1, { ...good, note: 'pendek' }, T0)).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  test('agregat masuk total (tak masuk rincian) + upsert ganti + BA tampil baris', async () => {
    const res = await recordEmergencyAggregate(adminR1, {
      officerId: off1, year: 2026, month: 9, amount: 25000, reason: 'HP_HILANG', witnessUserId: keuR1.userId, note: 'uang fisik dihitung bersama bendahara',
    }, T0);
    expect(res.amount).toBe(25000);
    expect(res.reason).toBe('HP_HILANG');

    const t = await computePpkTotals(db, off1, 2026, 9);
    // 50000 kaleng + 25000 agregat = 75000; bisyaroh ceil(7500) = 8000.
    expect(t).toEqual({ total: 75000, collectionCount: 1, bisyaroh: 8000, net: 67000, aggregateTotal: 25000, aggregateCount: 1 });
    expect(await getAggregateTotal(db, off1, 2026, 9)).toEqual({ total: 25000, count: 1 });

    // Upsert: catat ulang mengganti angka (audit old→new), tetap 1 baris.
    const res2 = await recordEmergencyAggregate(adminR1, {
      officerId: off1, year: 2026, month: 9, amount: 30000, reason: 'HP_HILANG', witnessUserId: keuR1.userId, note: 'koreksi hitung ulang bersama bendahara',
    }, T0);
    expect(res2.id).toBe(res.id);
    expect((await computePpkTotals(db, off1, 2026, 9)).total).toBe(80000);

    // BA teks memuat baris agregat; tanpa agregat tak ada baris (uji T5 utuh).
    const sub = await ensurePpkSubmission(off1, bR1, 2026, 9);
    const ba = await getPpkBeritaAcara(adminR1, sub.id);
    expect(ba.table.map((r) => r.label)).toContain('Termasuk agregat darurat');
  });

  test('FINAL mengunci agregat; snapshot ranting memuatnya', async () => {
    const sub = await ensurePpkSubmission(off1, bR1, 2026, 9);
    await signPpkSubmission(ppk1, { submissionId: sub.id, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);
    const fin = await countersignPpkSubmission(keuR1, { submissionId: sub.id, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);
    expect(fin.status).toBe('FINAL');
    expect(fin.total_amount).toBe(80000);

    await expect(recordEmergencyAggregate(adminR1, {
      officerId: off1, year: 2026, month: 9, amount: 10000, reason: 'KOREKSI_ADMIN', witnessUserId: keuR1.userId, note: 'coba ubah setelah final ditolak',
    }, T0)).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

    const sBr = await ensureBranchSubmission(bR1, 2026, 9);
    // total 80000 → bis 8000 → sisa 72000 → ekspektasi 21600; setor pas.
    await signBranchSubmission(adminR1, { submissionId: sBr.id, signaturePng: TINY_PNG_B64, consent: true, shareMwc: 21600 }, CTX, T0);
    const finBr = await countersignBranchSubmission(keuMwc, { submissionId: sBr.id, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);
    expect(finBr.status).toBe('FINAL');
    expect(finBr.total_amount).toBe(80000);
  });

  test('salin manual: happy path petugas kedua + kunci FINAL + scope', async () => {
    // Petugas kedua di ranting sama untuk jalur happy (R1 off1 sudah FINAL).
    const [u2] = await db.insert(schema.users).values({
      email: 'ppk2-t8@test.com', passwordHash: 'hash', fullName: 'ppk2-t8@test.com', phone: '084000000808', role: 'PETUGAS', branchId: bR1,
    }).returning();
    const [off2] = await db.insert(schema.officers).values({
      userId: u2.id, districtId: dt8, branchId: bR1, employeeCode: 'EMP-T8-2', fullName: 'Petugas T8-2', phone: '084000000808',
    }).returning();
    const [can2] = await db.insert(schema.cans).values({ branchId: bR1, ownerName: 'Owner T8-2', ownerWhatsapp: '084000000800', qrCode: 'TEST-QR-T8-C2' }).returning();
    const [asg2] = await db.insert(schema.assignments).values({ officerId: off2.id, canId: can2.id, periodYear: 2026, periodMonth: 9, status: 'ACTIVE' }).returning();

    const res = await recordManualCollection(adminR1, {
      assignmentId: asg2.id, canId: can2.id, officerId: off2.id, nominal: 40000,
      collectedAt: new Date(2026, 8, 26, 10, 0, 0), reason: 'salinan catatan kertas halaman 4',
    }, T0);
    expect(res.sync_status).toBe('COMPLETED');
    expect((await computePpkTotals(db, off2.id, 2026, 9)).total).toBe(40000);
    const audit = await db.query.activityLogs.findFirst({
      where: and(eq(schema.activityLogs.actionType, 'MANUAL_COLLECTION'), eq(schema.activityLogs.entityId, res.id)),
    });
    expect(audit?.userId).toBe(adminR1.userId);

    // Dobel submit: penugasan sudah COMPLETED → bukan tugas aktif lagi.
    await expect(recordManualCollection(adminR1, {
      assignmentId: asg2.id, canId: can2.id, officerId: off2.id, nominal: 10000,
      collectedAt: new Date(2026, 8, 26, 10, 0, 0), reason: 'dobel submit harus ditolak sistem',
    }, T0)).rejects.toMatchObject({ code: ErrorCode.ASSIGNMENT_INVALID });

    // Kunci FINAL: penugasan ACTIVE baru milik petugas FINAL tetap ditolak.
    const [can3] = await db.insert(schema.cans).values({ branchId: bR1, ownerName: 'Owner T8-3', ownerWhatsapp: '084000000800', qrCode: 'TEST-QR-T8-C3' }).returning();
    const [asg3] = await db.insert(schema.assignments).values({ officerId: off1, canId: can3.id, periodYear: 2026, periodMonth: 9, status: 'ACTIVE' }).returning();
    await expect(recordManualCollection(adminR1, {
      assignmentId: asg3.id, canId: can3.id, officerId: off1, nominal: 10000,
      collectedAt: new Date(2026, 8, 26, 10, 0, 0), reason: 'salinan susulan setelah final ditolak',
    }, T0)).rejects.toMatchObject({ code: ErrorCode.QR_ALREADY_SUBMITTED });

    // Scope: admin ranting lain ditolak; alasan pendek ditolak.
    await expect(recordManualCollection(adminR3, {
      assignmentId: asg2.id, canId: can2.id, officerId: off2.id, nominal: 40000,
      collectedAt: new Date(2026, 8, 26, 10, 0, 0), reason: 'salinan catatan kertas halaman 4',
    }, T0)).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN_SCOPE });
    await expect(recordManualCollection(adminR1, {
      assignmentId: asg1, canId: can1, officerId: off1, nominal: 10000,
      collectedAt: new Date(2026, 8, 26, 10, 0, 0), reason: 'pendek',
    }, T0)).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });
});
