/**
 * Overview & produktivitas: uang diatribusikan ke PERIODE ASSIGNMENT,
 * bukan bulan `collected_at` (C1-T12 §2.2).
 *
 * Skenario: jemputan 5 Nov 2026 untuk assignment periode Oktober 2026 harus
 * muncul di Overview Oktober dan TIDAK muncul di Overview November.
 */
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  getBranchComparison,
  getCollectionSummary,
  getMonthlyOperationalTrend,
  getTaskSummary,
} from '../overviewService';
import { getCollectionOutcome, getOfficerProductivity } from '../productivityService';
import { getCollectionDateRange } from '../collectionSubmission';
import { getReportStats, getReportSummary } from '../collectionReportService';
import { buildCollectionsQuery } from '../collectionQueryService';

const BRANCH_CODE = 'BOV-ATTR';
const DISTRICT_CODE = 'DOV-ATTR';
const OFFICER_EMAIL = 'ppk-overview-attr@test.com';
const OFFICER_PHONE = '084000000931';

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
  const branches = await db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(eq(schema.branches.code, BRANCH_CODE));
  const branchIds = branches.map((b) => b.id);

  if (branchIds.length > 0) {
    const cans = await db
      .select({ id: schema.cans.id })
      .from(schema.cans)
      .where(inArray(schema.cans.branchId, branchIds));
    const canIds = cans.map((c) => c.id);
    if (canIds.length > 0) {
      await db.delete(schema.collections).where(inArray(schema.collections.canId, canIds));
      await db.delete(schema.assignments).where(inArray(schema.assignments.canId, canIds));
    }
    const officers = await db
      .select({ id: schema.officers.id, userId: schema.officers.userId })
      .from(schema.officers)
      .where(inArray(schema.officers.branchId, branchIds));
    for (const officer of officers) {
      await db.delete(schema.assignments).where(eq(schema.assignments.officerId, officer.id));
      await db.delete(schema.collections).where(eq(schema.collections.officerId, officer.id));
    }
    await db.delete(schema.officers).where(inArray(schema.officers.branchId, branchIds));
    await db.delete(schema.users).where(inArray(schema.users.branchId, branchIds));
    if (canIds.length > 0) await db.delete(schema.cans).where(inArray(schema.cans.id, canIds));
    await db.delete(schema.branches).where(inArray(schema.branches.id, branchIds));
  }
  await db.delete(schema.districts).where(eq(schema.districts.code, DISTRICT_CODE));
}

describe('Atribusi periode overview (assignment, bukan collected_at)', () => {
  let districtId: string;
  let branchId: string;
  let officerId: string;

  beforeAll(async () => {
    await withImmutableRulesDisabled(cleanupFixtures);

    const [district] = await db
      .insert(schema.districts)
      .values({ name: 'District Overview Attr', code: DISTRICT_CODE, regionCode: 'D9' })
      .returning();
    districtId = district.id;

    const [branch] = await db
      .insert(schema.branches)
      .values({ districtId, name: 'Ranting Overview Attr', code: BRANCH_CODE })
      .returning();
    branchId = branch.id;

    const [user] = await db
      .insert(schema.users)
      .values({
        email: OFFICER_EMAIL,
        passwordHash: 'hash',
        fullName: 'Petugas Overview Attr',
        phone: OFFICER_PHONE,
        role: 'PETUGAS',
        branchId,
      })
      .returning();

    const [officer] = await db
      .insert(schema.officers)
      .values({
        userId: user.id,
        districtId,
        branchId,
        employeeCode: 'EMP-OV-ATTR',
        fullName: 'Petugas Overview Attr',
        phone: OFFICER_PHONE,
      })
      .returning();
    officerId = officer.id;

    const [can] = await db
      .insert(schema.cans)
      .values({
        branchId,
        ownerName: 'Bojong 5',
        ownerWhatsapp: '084000000932',
        qrCode: 'TEST-QR-OV-ATTR',
      })
      .returning();

    const [assignment] = await db
      .insert(schema.assignments)
      .values({
        officerId,
        canId: can.id,
        periodYear: 2026,
        periodMonth: 10,
        status: 'COMPLETED',
        completedAt: new Date(2026, 10, 5, 10, 0, 0),
      })
      .returning();

    await db.insert(schema.collections).values({
      assignmentId: assignment.id,
      canId: can.id,
      officerId,
      nominal: 50000n,
      collectedAt: new Date(2026, 10, 5, 10, 0, 0),
      submittedAt: new Date(2026, 10, 5, 10, 0, 0),
      syncedAt: new Date(2026, 10, 5, 10, 0, 0),
      syncStatus: 'COMPLETED',
      serverTimestamp: new Date(2026, 10, 5, 10, 0, 0),
      submitSequence: 1,
    });
  });

  afterAll(async () => {
    await withImmutableRulesDisabled(cleanupFixtures);
  });

  const scope = () => ({ districtId, branchId });

  test('Overview Oktober memuat jemputan 5 Nov milik assignment Oktober', async () => {
    const october = await getCollectionSummary(scope(), { year: 2026, month: 10, months: [10] });
    expect(october).toEqual({ nominal: 50000, successful_collections: 1 });

    const november = await getCollectionSummary(scope(), { year: 2026, month: 11, months: [11] });
    expect(november).toEqual({ nominal: 0, successful_collections: 0 });
  });

  test('Ringkasan tugas dan tren bulan memakai bucket periode assignment yang sama', async () => {
    const tasks = await getTaskSummary(scope(), { year: 2026, month: 10, months: [10] });
    expect(tasks.task_total).toBe(1);
    expect(tasks.task_completed).toBe(1);

    const trend = await getMonthlyOperationalTrend(scope(), { year: 2026, month: 10, months: [10] });
    expect(trend.find((m) => m.month === '2026-10')).toMatchObject({ collected: 1, nominal: 50000 });
    expect(trend.find((m) => m.month === '2026-11')).toMatchObject({ collected: 0, nominal: 0 });
  });

  test('Perbandingan ranting, hasil produktivitas, dan tabel PPK ikut periode assignment', async () => {
    const comparison = await getBranchComparison(districtId, { year: 2026, month: 10, months: [10] });
    expect(comparison.find((b) => b.branch_id === branchId)).toMatchObject({
      collection_nominal: 50000,
      collection_filled: 1,
    });

    const outcome = await getCollectionOutcome(scope(), 2026, [10]);
    expect(outcome).toEqual({ collected: 1, empty: 0 });

    const novemberOutcome = await getCollectionOutcome(scope(), 2026, [11]);
    expect(novemberOutcome).toEqual({ collected: 0, empty: 0 });

    const productivity = await getOfficerProductivity(scope(), 2026, [10]);
    expect(productivity.find((o) => o.officer_id === officerId)).toMatchObject({
      assigned: 1,
      collected: 1,
      filled: 1,
    });
  });

  test('Rentang tanggal penghimpunan BA memakai min–max collected_at periode assignment', async () => {
    const range = await getCollectionDateRange({ officerId, year: 2026, month: 10 });
    expect(range?.start).toEqual(new Date(2026, 10, 5, 10, 0, 0));
    expect(range?.end).toEqual(new Date(2026, 10, 5, 10, 0, 0));

    const byOfficerIds = await getCollectionDateRange({ officerIds: [officerId], year: 2026, month: 10 });
    expect(byOfficerIds?.start).toEqual(new Date(2026, 10, 5, 10, 0, 0));

    expect(await getCollectionDateRange({ officerId, year: 2026, month: 11 })).toBeNull();
  });

  test('Laporan web (summary + stats) memakai periode assignment, bukan collected_at', async () => {
    const octoberQuery = await buildCollectionsQuery({
      period: { year: 2026, months: [10] },
      scope: { branchId },
    });
    expect(octoberQuery.emptyResult).toBe(false);
    const octoberSummary = await getReportSummary(octoberQuery.whereClause);
    expect(Number(octoberSummary.totalRes?.total ?? 0)).toBe(50000);
    expect(Number(octoberSummary.totalRes?.count ?? 0)).toBe(1);

    const novemberQuery = await buildCollectionsQuery({
      period: { year: 2026, months: [11] },
      scope: { branchId },
    });
    const novemberSummary = await getReportSummary(novemberQuery.whereClause);
    expect(Number(novemberSummary.totalRes?.total ?? 0)).toBe(0);
    expect(Number(novemberSummary.totalRes?.count ?? 0)).toBe(0);

    const octoberStats = await getReportStats({ year: 2026, months: [10], branchId });
    expect(octoberStats.total_collected_cans).toBe(1);
    expect(octoberStats.zero_nominal_count).toBe(0);
    expect(octoberStats.total_assignments).toBe(1);

    const novemberStats = await getReportStats({ year: 2026, months: [11], branchId });
    expect(novemberStats.total_collected_cans).toBe(0);
    expect(novemberStats.total_assignments).toBe(0);
  });
});
