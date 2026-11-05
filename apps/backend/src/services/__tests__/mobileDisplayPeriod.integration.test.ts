/**
 * Mobile: periode aksi (display_period) menjadi dasar penutupan periode dan
 * metadata riwayat. Skenario: tugas Oktober masih ACTIVE saat kalender sudah
 * November → display_period Oktober; "Selesai Periode" menutup Oktober (dan
 * lebih lama), bukan November.
 */
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { eq, inArray } from 'drizzle-orm';
import { resolveDisplayPeriod } from '../periodState';
import { completeOfficerPeriod } from '../periodComplete';
import { toMobileHistoryItem } from '../../routes/mobile/collections';

const BRANCH_CODE = 'BMDP-ATTR';
const DISTRICT_CODE = 'DMDP-ATTR';
const OFFICER_EMAIL = 'ppk-mobile-period@test.com';
const OFFICER_PHONE = '084000000941';

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
      .select({ id: schema.officers.id })
      .from(schema.officers)
      .where(inArray(schema.officers.branchId, branchIds));
    const officerIds = officers.map((o) => o.id);
    if (officerIds.length > 0) {
      await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.officerId, officerIds));
    }
    await db.delete(schema.officers).where(inArray(schema.officers.branchId, branchIds));
    await db.delete(schema.users).where(inArray(schema.users.branchId, branchIds));
    if (canIds.length > 0) await db.delete(schema.cans).where(inArray(schema.cans.id, canIds));
    await db.delete(schema.branches).where(inArray(schema.branches.id, branchIds));
  }
  await db.delete(schema.districts).where(eq(schema.districts.code, DISTRICT_CODE));
}

describe('Periode aksi mobile', () => {
  let districtId: string;
  let branchId: string;
  let officerId: string;
  let octoberAssignmentId: string;
  let novemberAssignmentId: string;
  let canId: string;

  beforeAll(async () => {
    await cleanupFixtures();

    const [district] = await db
      .insert(schema.districts)
      .values({ name: 'District Mobile Period', code: DISTRICT_CODE, regionCode: 'D8' })
      .returning();
    districtId = district.id;

    const [branch] = await db
      .insert(schema.branches)
      .values({ districtId, name: 'Ranting Mobile Period', code: BRANCH_CODE })
      .returning();
    branchId = branch.id;

    const [user] = await db
      .insert(schema.users)
      .values({
        email: OFFICER_EMAIL,
        passwordHash: 'hash',
        fullName: 'Petugas Mobile Period',
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
        employeeCode: 'EMP-MDP-ATTR',
        fullName: 'Petugas Mobile Period',
        phone: OFFICER_PHONE,
      })
      .returning();
    officerId = officer.id;

    const [can] = await db
      .insert(schema.cans)
      .values({
        branchId,
        ownerName: 'Bojong Mobile',
        ownerWhatsapp: '084000000942',
        qrCode: 'TEST-QR-MDP-ATTR',
      })
      .returning();
    canId = can.id;

    const [october] = await db
      .insert(schema.assignments)
      .values({ officerId, canId, periodYear: 2026, periodMonth: 10, status: 'ACTIVE' })
      .returning();
    octoberAssignmentId = october.id;

    const [november] = await db
      .insert(schema.assignments)
      .values({ officerId, canId, periodYear: 2026, periodMonth: 11, status: 'ACTIVE' })
      .returning();
    novemberAssignmentId = november.id;
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  test('display_period memilih Oktober, bukan bulan kalender November', async () => {
    const display = await resolveDisplayPeriod(
      { role: 'PETUGAS', officerId },
      new Date(2026, 10, 5),
    );
    expect(display).toEqual({ year: 2026, month: 10 });
  });

  test('Selesai Periode menutup periode display dan lebih lama, bukan November', async () => {
    const result = await completeOfficerPeriod(
      {
        officerId,
        userId: null,
        ipAddress: null,
        userAgent: null,
      },
      new Date(2026, 10, 5),
      { year: 2026, month: 10 },
    );
    expect(result.period).toBe('2026-10');
    expect(result.skipped_count).toBe(1);
    expect(result.expired_closed_count).toBe(0);

    const october = await db.query.assignments.findFirst({
      where: eq(schema.assignments.id, octoberAssignmentId),
      columns: { status: true },
    });
    const november = await db.query.assignments.findFirst({
      where: eq(schema.assignments.id, novemberAssignmentId),
      columns: { status: true },
    });
    expect(october?.status).toBe('UNCOLLECTED');
    expect(november?.status).toBe('ACTIVE');
  });

  test('Riwayat membawa periode assignment, bukan bulan collected_at', () => {
    const item = toMobileHistoryItem({
      id: 'collection-1',
      offlineId: null,
      assignmentId: octoberAssignmentId,
      canId,
      nominal: 50000n,
      collectedAt: new Date(2026, 10, 5, 10, 0, 0),
      syncStatus: 'COMPLETED',
      submitSequence: 1,
      can: {
        qrCode: 'TEST-QR-MDP-ATTR',
        ownerName: 'Bojong Mobile',
        ownerAddress: null,
        condition: 'AKTIF',
      },
      assignment: { periodYear: 2026, periodMonth: 10 },
    });
    expect(item.period).toBe('2026-10');
    expect(item.collected_at).toEqual(new Date(2026, 10, 5, 10, 0, 0));
  });
});
