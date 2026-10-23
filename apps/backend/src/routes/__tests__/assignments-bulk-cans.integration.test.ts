/**
 * Kontrak bulk-cans untuk tab Kelola:
 *   - periode mengikuti periode terpilih, bukan selalu bulan berjalan;
 *   - kaleng assignable di periode itu tidak bisa ditugaskan dua kali;
 *   - petugas dari kecamatan lain ditolak.
 */
import { randomUUID } from 'crypto';
import { eq, inArray, or } from 'drizzle-orm';
import { getApp, closeApp } from './helpers/app-helper';
import { db } from '../../config/database';
import * as schema from '../../database/schema';

const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();

const IDS = {
  district: randomUUID(),
  otherDistrict: randomUUID(),
  branch: randomUUID(),
  otherBranch: randomUUID(),
  dukuh: randomUUID(),
  adminUser: randomUUID(),
  officerUser: randomUUID(),
  otherOfficerUser: randomUUID(),
  officer: randomUUID(),
  otherOfficer: randomUUID(),
  can: randomUUID(),
};

let token = '';

describe('POST /v1/admin/assignments/bulk-cans', () => {
  beforeAll(async () => {
    const app = await getApp();

    await db.insert(schema.districts).values([
      {
        id: IDS.district,
        code: `BCD${TAG}`,
        name: 'Kecamatan Bulk Cans',
        regionCode: '35',
      },
      {
        id: IDS.otherDistrict,
        code: `BCE${TAG}`,
        name: 'Kecamatan Lain',
        regionCode: '36',
      },
    ]);

    await db.insert(schema.branches).values([
      { id: IDS.branch, districtId: IDS.district, code: `BCB${TAG}`, name: 'Ranting Bulk Cans' },
      {
        id: IDS.otherBranch,
        districtId: IDS.otherDistrict,
        code: `BCF${TAG}`,
        name: 'Ranting Kecamatan Lain',
      },
    ]);

    await db.insert(schema.dukuhs).values({
      id: IDS.dukuh,
      branchId: IDS.branch,
      name: 'Dukuh Bulk Cans',
    });

    await db.insert(schema.users).values([
      {
        id: IDS.adminUser,
        email: `bc.admin.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Admin Bulk Cans',
        phone: `6285501${TAG}`,
        role: 'ADMIN_KECAMATAN',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
      {
        id: IDS.officerUser,
        email: `bc.officer.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Petugas Bulk Cans',
        phone: `6285502${TAG}`,
        role: 'PETUGAS',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
      {
        id: IDS.otherOfficerUser,
        email: `bc.other.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Petugas Kecamatan Lain',
        phone: `6285503${TAG}`,
        role: 'PETUGAS',
        districtId: IDS.otherDistrict,
        branchId: IDS.otherBranch,
      },
    ]);

    await db.insert(schema.officers).values([
      {
        id: IDS.officer,
        userId: IDS.officerUser,
        employeeCode: `BC${TAG}`,
        fullName: 'Petugas Bulk Cans',
        phone: `6285502${TAG}`,
        districtId: IDS.district,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        isActive: true,
      },
      {
        id: IDS.otherOfficer,
        userId: IDS.otherOfficerUser,
        employeeCode: `BD${TAG}`,
        fullName: 'Petugas Kecamatan Lain',
        phone: `6285503${TAG}`,
        districtId: IDS.otherDistrict,
        branchId: IDS.otherBranch,
        isActive: true,
      },
    ]);

    await db.insert(schema.cans).values({
      id: IDS.can,
      branchId: IDS.branch,
      dukuhId: IDS.dukuh,
      ownerName: 'Warga Bulk Cans',
      ownerWhatsapp: `6286601${TAG}`,
      rt: '001',
      rw: '001',
      condition: 'AKTIF',
      isActive: true,
    });

    token = app.jwt.sign({
      userId: IDS.adminUser,
      role: 'ADMIN_KECAMATAN',
      districtId: IDS.district,
      branchId: IDS.branch,
    });
  });

  afterAll(async () => {
    await db
      .delete(schema.activityLogs)
      .where(
        or(
          eq(schema.activityLogs.userId, IDS.adminUser),
          inArray(schema.activityLogs.officerId, [IDS.officer, IDS.otherOfficer])
        )
      );
    await db
      .delete(schema.assignments)
      .where(eq(schema.assignments.canId, IDS.can));
    await db.delete(schema.cans).where(eq(schema.cans.id, IDS.can));
    await db
      .delete(schema.officers)
      .where(inArray(schema.officers.id, [IDS.officer, IDS.otherOfficer]));
    await db
      .delete(schema.users)
      .where(inArray(schema.users.id, [IDS.adminUser, IDS.officerUser, IDS.otherOfficerUser]));
    await db.delete(schema.dukuhs).where(eq(schema.dukuhs.id, IDS.dukuh));
    await db
      .delete(schema.branches)
      .where(inArray(schema.branches.id, [IDS.branch, IDS.otherBranch]));
    await db
      .delete(schema.districts)
      .where(inArray(schema.districts.id, [IDS.district, IDS.otherDistrict]));
    await closeApp();
  });

  it('menugaskan pada periode terpilih, bukan bulan berjalan', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/assignments/bulk-cans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        officer_id: IDS.officer,
        can_ids: [IDS.can],
        period_year: 2027,
        period_month: 2,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      success: true,
      data: { assigned_count: 1, skipped_count: 0, period: '2/2027' },
    });

    const rows = await db
      .select({
        periodYear: schema.assignments.periodYear,
        periodMonth: schema.assignments.periodMonth,
      })
      .from(schema.assignments)
      .where(eq(schema.assignments.canId, IDS.can));

    expect(rows).toEqual([{ periodYear: 2027, periodMonth: 2 }]);
  });

  it('menolak kaleng yang sudah punya jadwal di periode yang sama', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/assignments/bulk-cans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        officer_id: IDS.officer,
        can_ids: [IDS.can],
        period_year: 2027,
        period_month: 2,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('ALREADY_ASSIGNED');
  });

  it('menolak petugas dari kecamatan lain', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/assignments/bulk-cans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        officer_id: IDS.otherOfficer,
        can_ids: [IDS.can],
        period_year: 2027,
        period_month: 3,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN_SCOPE');
  });
});
