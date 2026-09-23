/**
 * C1-T11 — dispatcher push→WA + hook + sapu + K3/K2 (DB nyata).
 * fcm + antrean WA di-mock (pola R2 T5); R2 mock untuk co-sign.
 */
import { db, closeDbConnection } from '../../config/database';
import * as schema from '../../database/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { sendFCMToDevice } from '../fcm';
import { addStaffTextJob } from '../queues';
import {
  buildNotifBody,
  dispatchNotif,
  filterFresh,
  notifySelisih,
  recentlyNotified,
  sweepNotifs,
} from '../notifications';
import { saveDeviceToken } from '../mobileRoles';
import { listPpkBaVersions } from '../baPdfService';
import { ensurePpkSubmission, ensureBranchSubmission } from '../ppkSubmissions';
import { submitCollection } from '../collectionSubmission';
import { signPpkSubmission, countersignPpkSubmission, signBranchSubmission } from '../cosign';
import { reopenPpkSubmission } from '../reopen';

jest.mock('../fcm', () => ({
  sendFCMToDevice: jest.fn(async () => ({ success: true, messageId: 'mock-m1' })),
}));
jest.mock('../queues', () => ({
  whatsappQueue: {},
  addWhatsAppJob: jest.fn(async () => ({ id: 'w1' })),
  addStaffTextJob: jest.fn(async () => ({ id: 'j1' })),
}));
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

const mockedFcm = sendFCMToDevice as jest.Mock;
const mockedQueue = addStaffTextJob as jest.Mock;

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const CTX = { ipAddress: '127.0.0.1', userAgent: 'jest' } as const;
const T0 = new Date(2026, 8, 28, 10, 0, 0);

const T11_EMAILS = [
  'ppk-t11@test.com', 'keur-t11@test.com', 'adminr-t11@test.com',
  'staf-t11@test.com', 'keumwc-t11@test.com', 'adminkec-t11@test.com',
];
const T11_PHONES = [
  '084000000911', '084000000912', '084000000913',
  '084000000914', '084000000915', '084000000916',
];
const T11_BRANCH_CODES = ['BT11-R1'];
const T11_DISTRICTS = ['DT11'];

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
  const users = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, T11_EMAILS));
  if (users.length > 0) {
    await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.userId, users.map((u) => u.id)));
  }
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T11_BRANCH_CODES));
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
  await db.delete(schema.notifications).where(inArray(schema.notifications.recipientPhone, T11_PHONES));
}

async function cleanupFixtures() {
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T11_BRANCH_CODES));
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
  await db.delete(schema.notifications).where(inArray(schema.notifications.recipientPhone, T11_PHONES));
  await db.delete(schema.users).where(inArray(schema.users.email, T11_EMAILS));
  if (bIds.length > 0) {
    await db.delete(schema.branches).where(inArray(schema.branches.id, bIds));
  }
  await db.delete(schema.districts).where(inArray(schema.districts.code, T11_DISTRICTS));
}

describe('C1-T11 dispatcher + hook + sapu (DB, fcm/WA mock)', () => {
  let dt11: string;
  let bR1: string;
  let off1: string;
  let ppkSubId: string;
  let adminR1: { userId: string; role: string; branchId: string; districtId: string };
  let keuR1: { userId: string; role: string; branchId: string; districtId: string };
  let ppkPhone: string;
  let adminPhone: string;

  async function mkUser(email: string, phone: string, role: 'PETUGAS' | 'STAF_KEUANGAN' | 'STAF_PENGUMPULAN' | 'ADMIN_RANTING' | 'ADMIN_KECAMATAN', branchId: string | null, districtId: string | null, fcmToken: string | null = null) {
    const [u] = await db.insert(schema.users).values({ email, passwordHash: 'hash', fullName: email, phone, role, branchId, districtId, fcmToken }).returning();
    return u.id;
  }

  beforeEach(() => {
    mockedFcm.mockResolvedValue({ success: true, messageId: 'mock-m1' });
  });

  beforeAll(async () => {
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(cleanupFixtures);

    const [d1] = await db.insert(schema.districts).values({ name: 'District T11', code: 'DT11', regionCode: 'D1' }).returning();
    dt11 = d1.id;
    const [r1] = await db.insert(schema.branches).values({ districtId: dt11, name: 'Ranting T11', code: 'BT11-R1' }).returning();
    bR1 = r1.id;

    // PPK punya token (jalur push), admin tidak (jalur WA).
    const uPpk = await mkUser('ppk-t11@test.com', T11_PHONES[0]!, 'PETUGAS', bR1, null, 'fcm-ppk-t11');
    const [off] = await db.insert(schema.officers).values({
      userId: uPpk, districtId: dt11, branchId: bR1, employeeCode: 'EMP-T11-1', fullName: 'Petugas T11', phone: T11_PHONES[0]!,
    }).returning();
    off1 = off.id;
    ppkPhone = T11_PHONES[0]!;
    const uKeu = await mkUser('keur-t11@test.com', T11_PHONES[1]!, 'STAF_KEUANGAN', bR1, null);
    const uAdm = await mkUser('adminr-t11@test.com', T11_PHONES[2]!, 'ADMIN_RANTING', bR1, null);
    adminPhone = T11_PHONES[2]!;
    await mkUser('staf-t11@test.com', T11_PHONES[3]!, 'STAF_PENGUMPULAN', bR1, null);
    await mkUser('keumwc-t11@test.com', T11_PHONES[4]!, 'STAF_KEUANGAN', null, dt11);
    await mkUser('adminkec-t11@test.com', T11_PHONES[5]!, 'ADMIN_KECAMATAN', null, dt11);
    adminR1 = { userId: uAdm, role: 'ADMIN_RANTING', branchId: bR1, districtId: dt11 };
    keuR1 = { userId: uKeu, role: 'STAF_KEUANGAN', branchId: bR1, districtId: dt11 };

    const [can] = await db.insert(schema.cans).values({ branchId: bR1, ownerName: 'Owner T11', ownerWhatsapp: '084000000900', qrCode: 'TEST-QR-T11-C1' }).returning();
    const [asg] = await db.insert(schema.assignments).values({ officerId: off.id, canId: can.id, periodYear: 2026, periodMonth: 9, status: 'ACTIVE' }).returning();
    await db.transaction(async (tx) => submitCollection(tx as never, {
      assignmentId: asg.id, canId: can.id, officerId: off.id, nominal: 50000, collectedAt: new Date(2026, 8, 25, 10, 0, 0),
    }, T0));
    const s = await ensurePpkSubmission(off.id, bR1, 2026, 9);
    ppkSubId = s.id;
  });

  afterAll(async () => {
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(cleanupFixtures);
    await closeDbConnection();
  });

  test('dispatch: token→push, tanpa-token→WA, tanpa-HP→skip, throw→tak melempar', async () => {
    const text = buildNotifBody('PENGINGAT_H3', { name: 'Ali', left: 3, period: '2026-09' });
    const r1 = await dispatchNotif({
      template: 'PENGINGAT_H3',
      text,
      recipients: [{ userId: 'u1', phone: ppkPhone, fcmToken: 'tok-1', fullName: 'A' }],
      entityId: 'e1',
    });
    expect(r1).toMatchObject({ push_ok: 1, wa_queued: 0 });
    expect(mockedFcm).toHaveBeenCalled();

    const r2 = await dispatchNotif({
      template: 'PENGINGAT_H3',
      text,
      recipients: [{ userId: 'u2', phone: adminPhone, fcmToken: null, fullName: 'B' }],
      entityId: 'e2',
    });
    expect(r2).toMatchObject({ push_ok: 0, wa_queued: 1 });
    expect(mockedQueue).toHaveBeenCalledWith(expect.objectContaining({ phone: adminPhone }));

    const r3 = await dispatchNotif({
      template: 'PENGINGAT_H3',
      text,
      recipients: [{ userId: 'u3', phone: null, fcmToken: null, fullName: 'C' }],
      entityId: 'e3',
    });
    expect(r3.skipped).toBe(1);

    mockedFcm.mockRejectedValueOnce(new Error('boom'));
    const r4 = await dispatchNotif({
      template: 'PENGINGAT_H3',
      text,
      recipients: [{ userId: 'u4', phone: null, fcmToken: 'tok-x', fullName: 'D' }],
      entityId: 'e4',
    });
    expect(r4.push_fail).toBe(1);
  });

  test('dedup: tercatat ≤20 jam dilewati; filterFresh', async () => {
    // createdAt eksplisit = T0 agar konsisten dengan now injeksi (produksi:
    // dispatcher menulis createdAt = now yang sama — lihat dispatchNotif).
    await db.insert(schema.notifications).values({
      collectionId: null,
      recipientPhone: adminPhone,
      messageTemplate: 'APPROVE_ESKALASI',
      messageContent: 'x',
      status: 'QUEUED',
      createdAt: T0,
    });
    expect(await recentlyNotified('APPROVE_ESKALASI', adminPhone, 20, T0)).toBe(true);
    expect(await recentlyNotified('APPROVE_ESKALASI', ppkPhone, 20, T0)).toBe(false);
    const fresh = await filterFresh('APPROVE_ESKALASI', [
      { userId: 'a', phone: adminPhone, fcmToken: null, fullName: 'A' },
      { userId: 'b', phone: ppkPhone, fcmToken: null, fullName: 'B' },
    ], 20, T0);
    expect(fresh.map((r) => r.userId)).toEqual(['b']);
  });

  test('hook FINAL + selisih + reopen menulis dispatch', async () => {
    const ppkActor = { userId: (await db.query.officers.findFirst({ where: eq(schema.officers.id, off1), columns: { userId: true } }))!.userId, role: 'PETUGAS', branchId: bR1, districtId: dt11, officerId: off1 };
    await signPpkSubmission(ppkActor, { submissionId: ppkSubId, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);
    await countersignPpkSubmission(keuR1, { submissionId: ppkSubId, signaturePng: TINY_PNG_B64, consent: true }, CTX, T0);

    const finAudit = await db.query.activityLogs.findFirst({
      where: and(eq(schema.activityLogs.actionType, 'NOTIF_DISPATCHED'), eq(schema.activityLogs.userId, keuR1.userId)),
    });
    expect(finAudit).toBeDefined();
    expect(finAudit?.newData).toMatchObject({ template: 'PPK_FINAL' });

    // Selisih besar saat sign ranting (variance 60000-? → wajib alasan).
    // Penandatangan BA ranting = Bendahara Ranting (STAF_KEUANGAN bercakupan
    // ranting), bukan Admin Ranting (koreksi Pion 23 Sep 2026). Audit
    // NOTIF_DISPATCHED dicatat atas nama PELAKU (actor), jadi filternya ikut
    // pindah ke keuR1 — penerima push-nya tetap Admin Ranting + MWC.
    const sBr = await ensureBranchSubmission(bR1, 2026, 9);
    await signBranchSubmission(keuR1, {
      submissionId: sBr.id, signaturePng: TINY_PNG_B64, consent: true,
      shareMwc: 0, varianceReason: 'KURANG_BAYAR',
    }, CTX, T0);
    const selAudit = await db.query.activityLogs.findMany({
      where: and(eq(schema.activityLogs.actionType, 'NOTIF_DISPATCHED'), eq(schema.activityLogs.userId, keuR1.userId)),
    });
    expect(selAudit.some((a) => (a.newData as { template?: string })?.template === 'SELISIH_BESAR')).toBe(true);

    // Reopen → REOPEN untuk PPK + admin.
    await reopenPpkSubmission(adminR1, { submissionId: ppkSubId, reason: 'uji hook reopen notifikasi' }, T0);
    const reAudit = await db.query.activityLogs.findMany({
      where: and(eq(schema.activityLogs.actionType, 'NOTIF_DISPATCHED'), eq(schema.activityLogs.userId, adminR1.userId)),
    });
    expect(reAudit.some((a) => (a.newData as { template?: string })?.template === 'REOPEN')).toBe(true);

    // notifySelisih diam bila toleransi.
    expect(await notifySelisih(bR1, '2026-09', 5000, 'KOREKSI_ADMIN', adminR1.userId)).toBeNull();
  });

  test('sapu: eskalasi + H-3 terkirim sekali lalu dedup nol', async () => {
    // H-3: now 25 Sep (jendela [due-3d, due]); draft disiapkan 25 jam sebelumnya.
    const h3now = new Date(2026, 8, 25, 10, 0, 0);
    const [draft] = await db.insert(schema.periodDrafts).values({
      periodYear: 2026, periodMonth: 9, branchId: bR1, districtId: dt11, status: 'DRAFT',
      preparedAt: new Date(h3now.getTime() - 25 * 3_600_000),
    }).returning();
    void draft;
    // ACTIVE tersisa untuk off1 (semua sudah COMPLETED — kaleng + assignment baru).
    const [canS] = await db.insert(schema.cans).values({ branchId: bR1, ownerName: 'Owner T11-S', ownerWhatsapp: '084000000900', qrCode: 'TEST-QR-T11-CS' }).returning();
    await db.insert(schema.assignments).values({ officerId: off1, canId: canS.id, periodYear: 2026, periodMonth: 9, status: 'ACTIVE' });

    const r1 = await sweepNotifs(2026, 9, h3now);
    expect(r1.escalated).toBeGreaterThanOrEqual(1);
    expect(r1.h3).toBeGreaterThanOrEqual(1);
    const r2 = await sweepNotifs(2026, 9, h3now);
    expect(r2).toMatchObject({ escalated: 0, h3: 0, near_lock: 0 });
  });

  test('K3: device-token mencatat audit; K2: arsip non-FINAL tak tampil', async () => {
    const users = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, 'staf-t11@test.com'));
    await saveDeviceToken(users[0]!.id, 'fcm-t11-x');
    const audit = await db.query.activityLogs.findFirst({
      where: and(eq(schema.activityLogs.actionType, 'DEVICE_TOKEN_SAVED'), eq(schema.activityLogs.userId, users[0]!.id)),
    });
    expect(audit).toBeDefined();

    await db.insert(schema.baPdfArchives).values({
      tier: 'ppk',
      submissionId: ppkSubId,
      version: 99,
      pdfKey: null,
      pdfHash: null,
      contentHash: 'abc',
      status: 'DRAFT',
      archivedBy: users[0]!.id,
      reopenReason: 'uji K2',
    });
    const versions = await listPpkBaVersions(ppkSubId);
    expect(versions.some((v) => v.version === 99)).toBe(false);
  });
});
