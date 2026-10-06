/**
 * C1-T12 — Akseptansi tutup siklus (§12 + §2.2).
 * Hanya skenario yang BELUM dikunci tiket T0–T11; 17 lainnya dipetakan di
 * docs C1-T12 (uji penuh hijau = bukti). Pola fixture T6–T11.
 */
import { db, closeDbConnection } from '../../config/database';
import * as schema from '../../database/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { ErrorCode } from '../../utils/errorCatalog';
import {
  sumCollectionsByPeriod,
  submitCollection,
  validateAssignmentForSubmit,
} from '../collectionSubmission';
import { ensurePpkSubmission, finalizePpkSubmission } from '../ppkSubmissions';
import { sweepNotifs } from '../notifications';
import { handleJobFailure } from '../../workers/whatsapp.worker';
import { getApp, closeApp } from '../../routes/__tests__/helpers/app-helper';

// Worker BullMQ asli + ioredis-mock = poll Lua error tanpa akhir (pola
// whatsapp-worker.test.ts: mock Worker, uji handleJobFailure langsung).
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn() })),
}));

const T12_EMAILS = ['ppk-t12@test.com', 'staf-t12@test.com'];
const T12_PHONES = ['084000000921', '084000000922'];
const T12_BRANCH_CODES = ['BT12-R1'];
const T12_DISTRICTS = ['DT12'];

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
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T12_BRANCH_CODES));
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
  await db.delete(schema.periodCalendar).where(and(eq(schema.periodCalendar.periodYear, 2026), eq(schema.periodCalendar.periodMonth, 10)));
  await db.delete(schema.notifications).where(inArray(schema.notifications.recipientPhone, T12_PHONES));
  await db.delete(schema.users).where(inArray(schema.users.email, T12_EMAILS));
  if (bIds.length > 0) {
    // Sisa user massal #22 (di luar T12_EMAILS) — hapus per branch dulu.
    await db.delete(schema.users).where(inArray(schema.users.branchId, bIds));
    await db.delete(schema.branches).where(inArray(schema.branches.id, bIds));
  }
  await db.delete(schema.districts).where(inArray(schema.districts.code, T12_DISTRICTS));
}

describe('C1-T12 akseptansi tutup (§2.2 + celah §12)', () => {
  let dt12: string;
  let bR1: string;
  let off1: string;
  let can1: string;
  let can2: string;
  let septAsg: string;
  let septAsg2: string;
  let oktAsg: string;

  beforeAll(async () => {
    await withImmutableRulesDisabled(cleanupFixtures);

    const [d1] = await db.insert(schema.districts).values({ name: 'District T12', code: 'DT12', regionCode: 'D2' }).returning();
    dt12 = d1.id;
    const [r1] = await db.insert(schema.branches).values({ districtId: dt12, name: 'Ranting T12', code: 'BT12-R1' }).returning();
    bR1 = r1.id;
    const [uPpk] = await db.insert(schema.users).values({
      email: 'ppk-t12@test.com', passwordHash: 'hash', fullName: 'ppk', phone: T12_PHONES[0]!, role: 'PETUGAS', branchId: bR1,
    }).returning();
    const [off] = await db.insert(schema.officers).values({
      userId: uPpk.id, districtId: dt12, branchId: bR1, employeeCode: 'EMP-T12-1', fullName: 'Petugas T12', phone: T12_PHONES[0]!,
    }).returning();
    off1 = off.id;
    await db.insert(schema.users).values({
      email: 'staf-t12@test.com', passwordHash: 'hash', fullName: 'staf', phone: T12_PHONES[1]!, role: 'STAF_PENGUMPULAN', branchId: bR1,
    });
    const [can] = await db.insert(schema.cans).values({ branchId: bR1, ownerName: 'Owner T12', ownerWhatsapp: '084000000900', qrCode: 'TEST-QR-T12-C1' }).returning();
    can1 = can.id;
    // Assignment Sept (dijemput 5 Okt — toleransi) + Okt (jemput awal 12 Okt).
    // can2+septAsg2 tetap ACTIVE untuk uji kunci-periode #13 (septAsg ikut
    // COMPLETED oleh submit atribusi di bawah).
    const [sa] = await db.insert(schema.assignments).values({ officerId: off1, canId: can.id, periodYear: 2026, periodMonth: 9, status: 'ACTIVE' }).returning();
    const [oa] = await db.insert(schema.assignments).values({ officerId: off1, canId: can.id, periodYear: 2026, periodMonth: 10, status: 'ACTIVE' }).returning();
    septAsg = sa.id;
    oktAsg = oa.id;
    await db.transaction(async (tx) => submitCollection(tx as never, {
      assignmentId: septAsg, canId: can1, officerId: off1, nominal: 50000, collectedAt: new Date(2026, 9, 5, 10, 0, 0),
    }, new Date(2026, 9, 5, 10, 0, 0)));
    const [canB] = await db.insert(schema.cans).values({ branchId: bR1, ownerName: 'Owner T12-B', ownerWhatsapp: '084000000900', qrCode: 'TEST-QR-T12-C2' }).returning();
    can2 = canB.id;
    const [sa2] = await db.insert(schema.assignments).values({ officerId: off1, canId: canB.id, periodYear: 2026, periodMonth: 9, status: 'ACTIVE' }).returning();
    septAsg2 = sa2.id;
  });

  afterAll(async () => {
    await withImmutableRulesDisabled(cleanupFixtures);
    await closeApp();
  });

  test('§2.2: jemputan 5 Okt milik assignment Sept = pemasukan Sept, bukan Okt', async () => {
    const sept = await sumCollectionsByPeriod(db, { officerId: off1, periods: [{ year: 2026, month: 9 }] });
    expect(sept).toEqual({ collected: 1, total_nominal: 50000 });
    const okt = await sumCollectionsByPeriod(db, { officerId: off1, periods: [{ year: 2026, month: 10 }] });
    expect(okt).toEqual({ collected: 0, total_nominal: 0 });
    const both = await sumCollectionsByPeriod(db, { officerId: off1, periods: [{ year: 2026, month: 9 }, { year: 2026, month: 10 }] });
    expect(both).toEqual({ collected: 1, total_nominal: 50000 });
    expect(await sumCollectionsByPeriod(db, { officerId: off1, periods: [] })).toEqual({ collected: 0, total_nominal: 0 });
  });

  test('#20: STAF_PENGUMPULAN tekan FINAL → FORBIDDEN', async () => {
    const sub = await ensurePpkSubmission(off1, bR1, 2026, 9);
    const staf = await db.query.users.findFirst({ where: eq(schema.users.email, 'staf-t12@test.com') });
    await expect(finalizePpkSubmission(
      { userId: staf!.id, role: 'STAF_PENGUMPULAN', branchId: bR1, districtId: dt12 },
      { submissionId: sub.id, ppkSignerId: 'x', bendaharaSignerId: 'y' },
      new Date(2026, 8, 28),
    )).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  test('#13: sync 11 Okt untuk Sept → PERIOD_CLOSED; Okt dipercepat lolos', async () => {
    await db.transaction(async (tx) => {
      await expect(validateAssignmentForSubmit(tx as never, septAsg2, can2, off1, new Date(2026, 9, 11, 10, 0, 0)))
        .rejects.toMatchObject({ code: ErrorCode.QR_PERIOD_CLOSED });
      const okt = await validateAssignmentForSubmit(tx as never, oktAsg, can1, off1, new Date(2026, 9, 12, 10, 0, 0));
      expect(okt.id).toBe(oktAsg);
    });
  });

  test('#22: sapu massal tak melempar + DLQ tercatat saat attempt habis', async () => {
    const emails: string[] = [];
    const oids: string[] = [];
    const cids: string[] = [];
    for (let i = 0; i < 25; i++) {
      const email = `ppk-t12-${i}@test.com`;
      emails.push(email);
      const [u] = await db.insert(schema.users).values({
        email, passwordHash: 'hash', fullName: `p${i}`, phone: `0840000019${String(i).padStart(2, '0')}`,
        role: 'PETUGAS', branchId: bR1,
      }).returning();
      const [o] = await db.insert(schema.officers).values({
        userId: u.id, districtId: dt12, branchId: bR1, employeeCode: `EMP-T12-M${i}`, fullName: `p${i}`, phone: u.phone,
      }).returning();
      oids.push(o.id);
      const [c] = await db.insert(schema.cans).values({ branchId: bR1, ownerName: `O${i}`, ownerWhatsapp: '084000000900', qrCode: `TEST-QR-T12-M${i}` }).returning();
      cids.push(c.id);
      await db.insert(schema.assignments).values({ officerId: o.id, canId: c.id, periodYear: 2026, periodMonth: 9, status: 'ACTIVE' });
    }
    const res = await sweepNotifs(2026, 9, new Date(2026, 8, 25, 10, 0, 0));
    expect(res.h3).toBeGreaterThanOrEqual(25);
    // Bersih-bersih massal (urutan FK: assignment → officer → can → user).
    await db.delete(schema.assignments).where(inArray(schema.assignments.officerId, oids));
    await db.delete(schema.officers).where(inArray(schema.officers.id, oids));
    await db.delete(schema.cans).where(inArray(schema.cans.id, cids));
    for (const email of emails) {
      await db.delete(schema.users).where(eq(schema.users.email, email));
    }
    await db.delete(schema.notifications).where(
      and(
        eq(schema.notifications.messageTemplate, 'PENGINGAT_H3'),
        sql`${schema.notifications.recipientPhone} LIKE '0840000019%'`,
      ),
    );
    // DLQ: attempt terakhir → baris FAILED (pola P2-C3 worker).
    await handleJobFailure(
      { id: 'j-dlq', name: 'send-text', attemptsMade: 10, opts: { attempts: 10 }, data: { phone: T12_PHONES[0], body: 'x'.repeat(10) } } as never,
      new Error('provider down'),
    );
    const dlq = await db.query.notifications.findFirst({
      where: and(eq(schema.notifications.recipientPhone, T12_PHONES[0]!), eq(schema.notifications.status, 'FAILED')),
    });
    expect(dlq).toBeDefined();
    expect(dlq?.messageTemplate).toBe('staff_notice');
  });

  test('#9: rate limit scan 30/menit tetap berlaku', async () => {
    const request = (await import('supertest')).default;
    const app = await getApp();
    let lastStatus = 200;
    for (let i = 0; i < 31; i++) {
      const res = await request(app.server).get('/v1/verify/ba?type=ppk&id=x&version=1&hash=y');
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  }, 60000);
});

