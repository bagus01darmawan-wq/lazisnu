/**
 * Penjaga daftar fresh: Selesai Periode menutup ACTIVE berjalan + kedaluwarsa.
 * Fixture sendiri (DB nyata): 1 ACTIVE Okt (berjalan) + 1 ACTIVE Sept +
 * 1 ACTIVE Juli (kedaluwarsa) + 1 COMPLETED Juli (kontrol, tak tersentuh).
 */
import { db, closeDbConnection } from '../../config/database';
import * as schema from '../../database/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { completeOfficerPeriod } from '../periodComplete';

const EMAILS = ['ppk-pc@test.com'];
const BRANCHES = ['BT-PC-R1'];
const DISTRICTS = ['DT-PC'];
const OCT5 = new Date(2026, 9, 5, 10, 0, 0);

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
  const users = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, EMAILS));
  if (users.length > 0) {
    await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.userId, users.map((u) => u.id)));
  }
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, BRANCHES));
  const bIds = branches.map((b) => b.id);
  if (bIds.length > 0) {
    const cans = await db.select({ id: schema.cans.id }).from(schema.cans).where(inArray(schema.cans.branchId, bIds));
    const cIds = cans.map((c) => c.id);
    if (cIds.length > 0) {
      await db.delete(schema.assignments).where(inArray(schema.assignments.canId, cIds));
      await db.delete(schema.cans).where(inArray(schema.cans.id, cIds));
    }
    const officers = await db.select({ id: schema.officers.id }).from(schema.officers).where(inArray(schema.officers.branchId, bIds));
    for (const o of officers) await db.delete(schema.officers).where(eq(schema.officers.id, o.id));
  }
  await db.delete(schema.users).where(inArray(schema.users.email, EMAILS));
  if (bIds.length > 0) await db.delete(schema.branches).where(inArray(schema.branches.id, bIds));
  await db.delete(schema.districts).where(inArray(schema.districts.code, DISTRICTS));
}

describe('completeOfficerPeriod', () => {
  let off1: string;
  let uPpk1: string;

  beforeAll(async () => {
    await withImmutableRulesDisabled(cleanupFixtures);
    const [d] = await db.insert(schema.districts).values({ name: 'DT PC', code: 'DT-PC', regionCode: 'PC' }).returning();
    const [r] = await db.insert(schema.branches).values({ districtId: d.id, name: 'Ranting PC', code: 'BT-PC-R1' }).returning();
    uPpk1 = (await db.insert(schema.users).values({ email: 'ppk-pc@test.com', passwordHash: 'h', fullName: 'PPK PC', phone: '084000009901', role: 'PETUGAS', branchId: r.id, districtId: null }).returning())[0].id;
    off1 = (await db.insert(schema.officers).values({ userId: uPpk1, districtId: d.id, branchId: r.id, employeeCode: 'EMP-PC-1', fullName: 'PPK PC', phone: '084000009901' }).returning())[0].id;
    const mkAsg = async (periodYear: number, periodMonth: number, status: 'ACTIVE' | 'COMPLETED', qr: string) => {
      const [can] = await db.insert(schema.cans).values({ branchId: r.id, ownerName: `Owner ${qr}`, ownerWhatsapp: '084000009900', qrCode: qr }).returning();
      await db.insert(schema.assignments).values({ officerId: off1, canId: can.id, periodYear, periodMonth, status });
    };
    await mkAsg(2026, 10, 'ACTIVE', 'TEST-QR-PC-OCT');
    await mkAsg(2026, 9, 'ACTIVE', 'TEST-QR-PC-SEP');
    await mkAsg(2026, 7, 'ACTIVE', 'TEST-QR-PC-JUL');
    await mkAsg(2026, 7, 'COMPLETED', 'TEST-QR-PC-JUL-DONE');
  });

  afterAll(async () => {
    await withImmutableRulesDisabled(cleanupFixtures);
    await closeDbConnection();
  });

  test('tutup berjalan + kedaluwarsa; COMPLETED tak tersentuh; audit tercatat', async () => {
    const res = await completeOfficerPeriod(
      { officerId: off1, userId: uPpk1, ipAddress: '127.0.0.1', userAgent: 'jest' },
      OCT5,
    );
    expect(res.period).toBe('2026-10');
    expect(res.skipped_count).toBe(1);
    expect(res.expired_closed_count).toBe(2);

    const rows = await db.select({ periodMonth: schema.assignments.periodMonth, status: schema.assignments.status })
      .from(schema.assignments)
      .where(eq(schema.assignments.officerId, off1));
    const byMonth = new Map(rows.map((r) => [r.periodMonth, r.status] as const));
    expect(byMonth.get(10)).toBe('UNCOLLECTED');
    expect(byMonth.get(9)).toBe('UNCOLLECTED');
    const jul = rows.filter((r) => r.periodMonth === 7).map((r) => r.status).sort();
    expect(jul).toEqual(['COMPLETED', 'UNCOLLECTED']);

    const audit = await db.query.activityLogs.findFirst({
      where: and(eq(schema.activityLogs.actionType, 'PERIOD_COMPLETED'), eq(schema.activityLogs.officerId, off1)),
    });
    expect(audit?.newData).toMatchObject({ skipped_count: 1, expired_closed_count: 2 });
  });

  test('kedua kali: nol + pesan tidak ada', async () => {
    const res = await completeOfficerPeriod(
      { officerId: off1, userId: uPpk1, ipAddress: '127.0.0.1', userAgent: 'jest' },
      OCT5,
    );
    expect(res.skipped_count).toBe(0);
    expect(res.expired_closed_count).toBe(0);
  });
});
