/**
 * Integritas penulisan assignment di level route:
 *   - POST /assignments menolak kaleng yang sudah ditugaskan pada periode yang
 *     sama (check-then-insert dilakukan di dalam transaksi ber-lock kaleng);
 *   - hasil transfer (baris REASSIGNED + baris ACTIVE untuk kaleng yang sama)
 *     tidak bisa diubah PUT menjadi dua penugasan berjalan;
 *   - bulk-cans melewatikan kaleng yang sudah punya jadwal, termasuk yang
 *     baru dipindahkan lewat transfer.
 */
import { randomUUID } from 'crypto';
import { and, eq, inArray, or } from 'drizzle-orm';
import { getApp, closeApp } from './helpers/app-helper';
import { db } from '../../config/database';
import * as schema from '../../database/schema';

const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();

const IDS = {
  district: randomUUID(),
  branch: randomUUID(),
  dukuh: randomUUID(),
  adminUser: randomUUID(),
  officerUser: randomUUID(),
  officer2User: randomUUID(),
  officer: randomUUID(),
  officer2: randomUUID(),
  can: randomUUID(),
};

const PERIOD = { year: 2027, month: 3 };

let token = '';

describe('Integritas penulisan assignment', () => {
  beforeAll(async () => {
    const app = await getApp();

    await db.insert(schema.districts).values({
      id: IDS.district,
      code: `AID${TAG}`,
      name: 'Kecamatan Integritas',
      regionCode: '37',
    });

    await db.insert(schema.branches).values({
      id: IDS.branch,
      districtId: IDS.district,
      code: `AIB${TAG}`,
      name: 'Ranting Integritas',
    });

    await db.insert(schema.dukuhs).values({
      id: IDS.dukuh,
      branchId: IDS.branch,
      name: 'Dukuh Integritas',
    });

    await db.insert(schema.users).values([
      {
        id: IDS.adminUser,
        email: `ai.admin.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Admin Integritas',
        phone: `6287701${TAG}`,
        role: 'ADMIN_KECAMATAN',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
      {
        id: IDS.officerUser,
        email: `ai.officer.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Petugas Integritas',
        phone: `6287702${TAG}`,
        role: 'PETUGAS',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
      {
        id: IDS.officer2User,
        email: `ai.officer2.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Petugas Pengganti',
        phone: `6287703${TAG}`,
        role: 'PETUGAS',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
    ]);

    await db.insert(schema.officers).values([
      {
        id: IDS.officer,
        userId: IDS.officerUser,
        employeeCode: `AI${TAG}`,
        fullName: 'Petugas Integritas',
        phone: `6287702${TAG}`,
        districtId: IDS.district,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        isActive: true,
      },
      {
        id: IDS.officer2,
        userId: IDS.officer2User,
        employeeCode: `AJ${TAG}`,
        fullName: 'Petugas Pengganti',
        phone: `6287703${TAG}`,
        districtId: IDS.district,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        isActive: true,
      },
    ]);

    await db.insert(schema.cans).values({
      id: IDS.can,
      branchId: IDS.branch,
      dukuhId: IDS.dukuh,
      ownerName: 'Warga Integritas',
      ownerWhatsapp: `6288801${TAG}`,
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
    await db.delete(schema.activityLogs).where(
      or(
        inArray(schema.activityLogs.userId, [
          IDS.adminUser,
          IDS.officerUser,
          IDS.officer2User,
        ]),
        inArray(schema.activityLogs.officerId, [IDS.officer, IDS.officer2])
      )
    );
    await db.delete(schema.assignments).where(eq(schema.assignments.canId, IDS.can));
    await db.delete(schema.cans).where(eq(schema.cans.id, IDS.can));
    await db
      .delete(schema.officers)
      .where(inArray(schema.officers.id, [IDS.officer, IDS.officer2]));
    await db
      .delete(schema.users)
      .where(inArray(schema.users.id, [IDS.adminUser, IDS.officerUser, IDS.officer2User]));
    await db.delete(schema.dukuhs).where(eq(schema.dukuhs.id, IDS.dukuh));
    await db.delete(schema.branches).where(eq(schema.branches.id, IDS.branch));
    await db.delete(schema.districts).where(eq(schema.districts.id, IDS.district));
    await closeApp();
  });

  it('POST /assignments menolak kaleng yang sudah ditugaskan pada periode yang sama', async () => {
    const app = await getApp();
    const payload = {
      can_id: IDS.can,
      officer_id: IDS.officer,
      period_year: PERIOD.year,
      period_month: PERIOD.month,
    };

    const first = await app.inject({
      method: 'POST',
      url: '/v1/admin/assignments',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(first.statusCode).toBe(201);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/v1/admin/assignments',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('CONFLICT');
  });

  it('PUT tidak bisa menghidupkan baris REASSIGNED saat penugasan berjalan lain ada', async () => {
    const app = await getApp();

    const transfer = await app.inject({
      method: 'POST',
      url: `/v1/admin/assignments/${(await currentAssignmentId())}/transfer`,
      headers: { authorization: `Bearer ${token}` },
      payload: { officer_id: IDS.officer2 },
    });
    expect(transfer.statusCode).toBe(201);

    const reassignedId = await reassignedRowId();
    expect(reassignedId).toBeTruthy();

    const reactivate = await app.inject({
      method: 'PUT',
      url: `/v1/admin/assignments/${reassignedId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'ACTIVE' },
    });
    expect(reactivate.statusCode).toBe(409);
    expect(reactivate.json().error.code).toBe('CONFLICT');

    // Perubahan yang tidak menyentuh status tetap boleh.
    const notes = await app.inject({
      method: 'PUT',
      url: `/v1/admin/assignments/${reassignedId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { notes: 'catatan transfer' },
    });
    expect(notes.statusCode).toBe(200);

    // Kaleng kini dua baris (REASSIGNED + ACTIVE) pada periode yang sama —
    // assign massal tetap menolaknya.
    const bulk = await app.inject({
      method: 'POST',
      url: '/v1/admin/assignments/bulk-cans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        officer_id: IDS.officer,
        can_ids: [IDS.can],
        period_year: PERIOD.year,
        period_month: PERIOD.month,
      },
    });
    expect(bulk.statusCode).toBe(400);
    expect(bulk.json().error.code).toBe('ALREADY_ASSIGNED');
  });

  async function currentAssignmentId(): Promise<string> {
    const [row] = await db
      .select({ id: schema.assignments.id })
      .from(schema.assignments)
      .where(
        and(
          eq(schema.assignments.canId, IDS.can),
          eq(schema.assignments.periodYear, PERIOD.year),
          eq(schema.assignments.periodMonth, PERIOD.month)
        )
      );
    return row.id;
  }

  async function reassignedRowId(): Promise<string | null> {
    const [row] = await db
      .select({ id: schema.assignments.id })
      .from(schema.assignments)
      .where(
        and(
          eq(schema.assignments.canId, IDS.can),
          eq(schema.assignments.status, 'REASSIGNED')
        )
      );
    return row?.id ?? null;
  }
});
