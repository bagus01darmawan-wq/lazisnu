/**
 * C1-T9 — peran mobile server (DB nyata; R2 mock untuk co-sign/PDF).
 * period-info murni + device-token + ringkasan staf + inbox keuangan +
 * riwayat versi PDF (H3). Pola fixture T6–T8 (audit dulu, draft dulu).
 */
import { db, closeDbConnection } from '../../config/database';
import * as schema from '../../database/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { ErrorCode } from '../../utils/errorCatalog';
import {
  getKeuanganInbox,
  getPeriodInfo,
  getStafSummary,
  saveDeviceToken,
} from '../mobileRoles';
import { listBranchBaVersions, listPpkBaVersions } from '../baPdfService';
import { ensurePpkSubmission, ensureBranchSubmission } from '../ppkSubmissions';
import { submitCollection } from '../collectionSubmission';
import {
  countersignBranchSubmission,
  countersignPpkSubmission,
  getBaDownload,
  signBranchSubmission,
  signPpkSubmission,
} from '../cosign';
import { reopenPpkSubmission } from '../reopen';

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

const T9_EMAILS = [
  'ppk-t9@test.com', 'ppk2-t9@test.com', 'keur-t9@test.com', 'keu2-t9@test.com',
  'adminr-t9@test.com', 'adminr2-t9@test.com', 'staf-t9@test.com',
  'keumwc-t9@test.com', 'adminkec-t9@test.com',
];
const T9_BRANCH_CODES = ['BT9-R1', 'BT9-R2'];
const T9_DISTRICTS = ['DT9'];

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
  const users = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, T9_EMAILS));
  if (users.length > 0) {
    await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.userId, users.map((u) => u.id)));
  }
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T9_BRANCH_CODES));
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
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T9_BRANCH_CODES));
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
  await db.delete(schema.users).where(inArray(schema.users.email, T9_EMAILS));
  if (bIds.length > 0) {
    await db.delete(schema.branches).where(inArray(schema.branches.id, bIds));
  }
  await db.delete(schema.districts).where(inArray(schema.districts.code, T9_DISTRICTS));
}

describe('C1-T9 peran mobile server (DB, R2 mock)', () => {
  let dt9: string;
  let bR1: string;
  let bR2: string;
  let adminKec: { userId: string; role: string; branchId: null; districtId: string };
  let stafActor: { userId: string; role: string; branchId: string; districtId: string };
  let keuActor: { userId: string; role: string; branchId: string; districtId: string };
  let keuMwcActor: { userId: string; role: string; branchId: null; districtId: string };
  let ppkSubId: string;
  let branchSubId: string;
  let branchSubId2: string;
  let uAdmR1: string;

  async function mkUser(email: string, phone: string, role: 'PETUGAS' | 'STAF_KEUANGAN' | 'STAF_PENGUMPULAN' | 'ADMIN_RANTING' | 'ADMIN_KECAMATAN', branchId: string | null, districtId: string | null) {
    const [u] = await db.insert(schema.users).values({ email, passwordHash: 'hash', fullName: email, phone, role, branchId, districtId }).returning();
    return u.id;
  }

  beforeAll(async () => {
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(cleanupFixtures);

    const [d1] = await db.insert(schema.districts).values({ name: 'District T9', code: 'DT9', regionCode: 'D9' }).returning();
    dt9 = d1.id;
    const [r1] = await db.insert(schema.branches).values({ districtId: dt9, name: 'Ranting T9-1', code: 'BT9-R1' }).returning();
    const [r2] = await db.insert(schema.branches).values({ districtId: dt9, name: 'Ranting T9-2', code: 'BT9-R2' }).returning();
    bR1 = r1.id;
    bR2 = r2.id;

    const uPpk = await mkUser('ppk-t9@test.com', '084000000901', 'PETUGAS', bR1, null);
    const [off] = await db.insert(schema.officers).values({
      userId: uPpk, districtId: dt9, branchId: bR1, employeeCode: 'EMP-T9-1', fullName: 'Petugas T9', phone: '084000000901',
    }).returning();
    const uPpk2 = await mkUser('ppk2-t9@test.com', '084000000902', 'PETUGAS', bR2, null);
    const [off2] = await db.insert(schema.officers).values({
      userId: uPpk2, districtId: dt9, branchId: bR2, employeeCode: 'EMP-T9-2', fullName: 'Petugas T9-2', phone: '084000000902',
    }).returning();
    const uKeu = await mkUser('keur-t9@test.com', '084000000903', 'STAF_KEUANGAN', bR1, null);
    uAdmR1 = await mkUser('adminr-t9@test.com', '084000000904', 'ADMIN_RANTING', bR1, null);
    const uStaf = await mkUser('staf-t9@test.com', '084000000905', 'STAF_PENGUMPULAN', bR1, null);
    const uKeuMwc = await mkUser('keumwc-t9@test.com', '084000000906', 'STAF_KEUANGAN', null, dt9);
    const uKec = await mkUser('adminkec-t9@test.com', '084000000907', 'ADMIN_KECAMATAN', null, dt9);

    stafActor = { userId: uStaf, role: 'STAF_PENGUMPULAN', branchId: bR1, districtId: dt9 };
    keuActor = { userId: uKeu, role: 'STAF_KEUANGAN', branchId: bR1, districtId: dt9 };
    keuMwcActor = { userId: uKeuMwc, role: 'STAF_KEUANGAN', branchId: null, districtId: dt9 };
    adminKec = { userId: uKec, role: 'ADMIN_KECAMATAN', branchId: null, districtId: dt9 };
    void adminKec;

    // PPK R1: submit 50000 → sign saja (PPK_SIGNED, masuk inbox keuangan).
    const [can1] = await db.insert(schema.cans).values({ branchId: bR1, ownerName: 'Owner T9', ownerWhatsapp: '084000000900', qrCode: 'TEST-QR-T9-C1' }).returning();
    const [asg1] = await db.insert(schema.assignments).values({ officerId: off.id, canId: can1.id, periodYear: 2026, periodMonth: 9, status: 'ACTIVE' }).returning();
    await db.transaction(async (tx) => submitCollection(tx as never, {
      assignmentId: asg1.id, canId: can1.id, officerId: off.id, nominal: 50000, collectedAt: new Date(2026, 8, 25, 10, 0, 0),
    }, T0));
    const sPpk = await ensurePpkSubmission(off.id, bR1, 2026, 9);
    ppkSubId = sPpk.id;
    const ppkActor = { userId: uPpk, role: 'PETUGAS', branchId: bR1, districtId: dt9, officerId: off.id };
    await signPpkSubmission(ppkActor, { submissionId: ppkSubId, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);

    // Branch R1: DRAFT polos (reopen di test riwayat tak menular ke mana-mana).
    // Inbox MWC diuji lewat R2 (PPK FINAL + branch sign) di bawah.
    const sBr = await ensureBranchSubmission(bR1, 2026, 9);
    branchSubId = sBr.id;

    // Draft eskalasi untuk ringkasan staf (prepared 25 jam lalu).
    await db.insert(schema.periodDrafts).values({
      periodYear: 2026, periodMonth: 9, branchId: bR1, districtId: dt9, status: 'DRAFT',
      preparedAt: new Date(T0.getTime() - 25 * 3_600_000),
    });

    // R2: PPK FINAL + branch sign (DRAFT bertanda → inbox MWC).
    // 40000 → bis 4000 → sisa 36000 → ekspektasi 10800 → setor pas.
    const [can2] = await db.insert(schema.cans).values({ branchId: bR2, ownerName: 'Owner T9-2', ownerWhatsapp: '084000000900', qrCode: 'TEST-QR-T9-C2' }).returning();
    const [asg2] = await db.insert(schema.assignments).values({ officerId: off2.id, canId: can2.id, periodYear: 2026, periodMonth: 9, status: 'ACTIVE' }).returning();
    await db.transaction(async (tx) => submitCollection(tx as never, {
      assignmentId: asg2.id, canId: can2.id, officerId: off2.id, nominal: 40000, collectedAt: new Date(2026, 8, 25, 10, 0, 0),
    }, T0));
    const sPpk2 = await ensurePpkSubmission(off2.id, bR2, 2026, 9);
    const uKeu2 = await mkUser('keu2-t9@test.com', '084000000908', 'STAF_KEUANGAN', bR2, null);
    const uAdm2 = await mkUser('adminr2-t9@test.com', '084000000909', 'ADMIN_RANTING', bR2, null);
    const ppkActor2 = { userId: uPpk2, role: 'PETUGAS', branchId: bR2, districtId: dt9, officerId: off2.id };
    const keuActor2 = { userId: uKeu2, role: 'STAF_KEUANGAN', branchId: bR2, districtId: dt9 };
    const admActor2 = { userId: uAdm2, role: 'ADMIN_RANTING', branchId: bR2, districtId: dt9 };
    await signPpkSubmission(ppkActor2, { submissionId: sPpk2.id, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);
    await countersignPpkSubmission(keuActor2, { submissionId: sPpk2.id, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);
    const sBr2 = await ensureBranchSubmission(bR2, 2026, 9);
    branchSubId2 = sBr2.id;
    await signBranchSubmission(admActor2, { submissionId: sBr2.id, signaturePng: TINY_PNG_B64, consent: true, shareMwc: 10800 }, CTX, T0);
  });

  afterAll(async () => {
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(cleanupFixtures);
    await closeDbConnection();
  });

  test('period-info: batas + countdown deterministik; invalid ditolak', () => {
    const info = getPeriodInfo(2026, 9, new Date(2026, 8, 27, 12, 0, 0));
    expect(info.period).toBe('2026-09');
    expect(info.period_status).toBe('OPEN');
    expect(info.days_to_due).toBe(1);
    expect(info.days_to_lock).toBe(13);
    expect(info.in_tolerance).toBe(false);
    const tol = getPeriodInfo(2026, 9, new Date(2026, 9, 5, 12, 0, 0));
    expect(tol.period_status).toBe('TOLERANCE');
    expect(tol.in_tolerance).toBe(true);
    expect(tol.days_to_due).toBe(0);
    const locked = getPeriodInfo(2026, 9, new Date(2026, 9, 10, 0, 0, 1));
    expect(locked.period_status).toBe('LOCKED');
    expect(locked.days_to_lock).toBe(0);
    expect(() => getPeriodInfo(2026, 13)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  test('device-token: simpan milik sendiri; kosong/panjang ditolak', async () => {
    const users = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, 'staf-t9@test.com'));
    expect(await saveDeviceToken(users[0].id, 'fcm-token-abc')).toEqual({ saved: true });
    const row = await db.query.users.findFirst({ where: eq(schema.users.id, users[0].id), columns: { fcmToken: true } });
    expect(row?.fcmToken).toBe('fcm-token-abc');
    await expect(saveDeviceToken(users[0].id, '')).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    await expect(saveDeviceToken('00000000-0000-0000-0000-000000000000', 'x')).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  test('staf ringkasan: scope ranting + eskalasi + progres + countdown K1; peran salah 403', async () => {
    const res = await getStafSummary(stafActor, 2026, 9, T0);
    expect(res.period).toBe('2026-09');
    expect(res.scope).toMatchObject({ kind: 'RANTING', branch_id: bR1 });
    expect(res.drafts).toMatchObject({ pending: 0, escalated: 1, approved: 0 });
    expect(res.ppk.total_count).toBe(1);
    expect(res.ppk.final_count).toBe(0);
    // K1: countdown nyata (T0 = 28 Sep → toleransi, due lewat, kunci 12 hari).
    expect(res.period_status).toBe('TOLERANCE');
    expect(res.in_tolerance).toBe(true);
    expect(res.days_to_due).toBe(0);
    expect(res.days_to_lock).toBe(12);
    await expect(getStafSummary(keuActor, 2026, 9, T0)).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
    await expect(getStafSummary({ userId: 'x', role: 'STAF_PENGUMPULAN', branchId: null, districtId: null }, 2026, 9, T0)).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN_SCOPE,
    });
  });

  test('keuangan inbox: PPK_SIGNED seranting + branch-signed sedistrik', async () => {
    const ranting = await getKeuanganInbox(keuActor, 2026, 9);
    expect(ranting.items.length).toBe(1);
    expect(ranting.items[0]).toMatchObject({ kind: 'ppk', submission_id: ppkSubId, needs_force: false });

    const mwc = await getKeuanganInbox(keuMwcActor, 2026, 9);
    const branchItem = mwc.items.find((i) => i.submission_id === branchSubId2);
    expect(branchItem).toMatchObject({ kind: 'branch' });

    await expect(getKeuanganInbox(stafActor, 2026, 9)).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  test('riwayat versi (H3): live + arsip, tanpa pdf_key, urut menanjak', async () => {
    // FINAL-kan R2 dulu (countersign PPK + sign/countersign ranting sudah? belum).
    // R2 masih DRAFT PPK → riwayat cukup 1 entri live; arsip diuji via reopen R1.
    const liveOnly = await listPpkBaVersions(ppkSubId);
    expect(liveOnly.length).toBe(1);
    expect(liveOnly[0]).toMatchObject({ version: 1, status: 'PPK_SIGNED', is_current: true });
    expect(liveOnly[0].verify_url).toContain('/v1/verify/ba?type=ppk');
    expect('pdf_key' in liveOnly[0]).toBe(false);

    // Reopen butuh FINAL — FINAL-kan R1 PPK via countersign, unduh PDF, reopen.
    await countersignPpkSubmission(keuActor, { submissionId: ppkSubId, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);
    await getBaDownload(keuActor, 'ppk', ppkSubId, CTX);
    await reopenPpkSubmission(
      { userId: uAdmR1, role: 'ADMIN_RANTING', branchId: bR1, districtId: dt9 },
      { submissionId: ppkSubId, reason: 'uji riwayat versi arsip T9' }, T0,
    );
    const versions = await listPpkBaVersions(ppkSubId);
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    expect(versions[0]).toMatchObject({ is_current: false, status: 'FINAL' });
    expect(versions[0].pdf_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(versions[1]).toMatchObject({ is_current: true, status: 'DRAFT' });

    const branchVersions = await listBranchBaVersions(branchSubId);
    expect(branchVersions.length).toBeGreaterThanOrEqual(1);
    expect(branchVersions[branchVersions.length - 1].is_current).toBe(true);
  });
});
