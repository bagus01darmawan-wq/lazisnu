/**
 * POST /v1/mobile/cans/:canId/visits untuk tugas VISIT.
 *
 * Kontrak baru (2026-11-08):
 * - KOSONG  → visit tercatat, kaleng tetap NON_AKTIF, tugas VISIT COMPLETED.
 * - DIKEMBALIKAN → kaleng DIKEMBALIKAN/is_active=false, tugas COMPLETED.
 * - assignment_id milik petugas lain / bukan VISIT → 403.
 */
import { randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { getApp, closeApp } from '../../__tests__/helpers/app-helper';
import { db } from '../../../config/database';
import * as schema from '../../../database/schema';
import { currentOperationalPeriod } from '../../../utils/operationalTimeZone';

const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
const OP = currentOperationalPeriod();

const IDS = {
  district: randomUUID(),
  branch: randomUUID(),
  dukuh: randomUUID(),
  officerUser: randomUUID(),
  otherUser: randomUUID(),
  officer: randomUUID(),
  officerOther: randomUUID(),
  canKosong: randomUUID(),
  canReturned: randomUUID(),
  canOther: randomUUID(),
  assignmentKosong: randomUUID(),
  assignmentReturned: randomUUID(),
  assignmentOther: randomUUID(),
};

let token = '';

describe('POST /mobile/cans/:canId/visits — tugas VISIT', () => {
  beforeAll(async () => {
    const app = await getApp();

    await db.insert(schema.districts).values({
      id: IDS.district,
      code: `NVD${TAG}`,
      name: 'Kecamatan Visit',
      regionCode: '38',
    });
    await db.insert(schema.branches).values({
      id: IDS.branch,
      districtId: IDS.district,
      code: `NVB${TAG}`,
      name: 'Ranting Visit',
    });
    await db.insert(schema.dukuhs).values({
      id: IDS.dukuh,
      branchId: IDS.branch,
      name: 'Dukuh Visit',
    });
    await db.insert(schema.users).values([
      {
        id: IDS.officerUser,
        email: `nv.officer.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Petugas Visit',
        phone: `6288901${TAG}`,
        role: 'PETUGAS',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
      {
        id: IDS.otherUser,
        email: `nv.other.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Petugas Visit Lain',
        phone: `6288902${TAG}`,
        role: 'PETUGAS',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
    ]);
    await db.insert(schema.officers).values([
      {
        id: IDS.officer,
        userId: IDS.officerUser,
        employeeCode: `NV${TAG}-01`,
        fullName: 'Petugas Visit',
        phone: `6288901${TAG}`,
        districtId: IDS.district,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        isActive: true,
      },
      {
        id: IDS.officerOther,
        userId: IDS.otherUser,
        employeeCode: `NV${TAG}-02`,
        fullName: 'Petugas Visit Lain',
        phone: `6288902${TAG}`,
        districtId: IDS.district,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        isActive: true,
      },
    ]);
    await db.insert(schema.cans).values([
      {
        id: IDS.canKosong,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        ownerName: 'Warga Kosong',
        ownerWhatsapp: `6289901${TAG}`,
        rt: '001',
        rw: '001',
        condition: 'NON_AKTIF',
        isActive: true,
      },
      {
        id: IDS.canReturned,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        ownerName: 'Warga Kembali',
        ownerWhatsapp: `6289902${TAG}`,
        rt: '001',
        rw: '001',
        condition: 'NON_AKTIF',
        isActive: true,
      },
      {
        id: IDS.canOther,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        ownerName: 'Warga Lain',
        ownerWhatsapp: `6289903${TAG}`,
        rt: '001',
        rw: '001',
        condition: 'NON_AKTIF',
        isActive: true,
      },
    ]);
    await db.insert(schema.assignments).values([
      {
        id: IDS.assignmentKosong,
        canId: IDS.canKosong,
        officerId: IDS.officer,
        periodYear: OP.year,
        periodMonth: OP.month,
        kind: 'VISIT',
        status: 'ACTIVE',
      },
      {
        id: IDS.assignmentReturned,
        canId: IDS.canReturned,
        officerId: IDS.officer,
        periodYear: OP.year,
        periodMonth: OP.month,
        kind: 'VISIT',
        status: 'ACTIVE',
      },
      {
        id: IDS.assignmentOther,
        canId: IDS.canOther,
        officerId: IDS.officerOther,
        periodYear: OP.year,
        periodMonth: OP.month,
        kind: 'VISIT',
        status: 'ACTIVE',
      },
    ]);

    token = app.jwt.sign({
      userId: IDS.officerUser,
      role: 'PETUGAS',
      branchId: IDS.branch,
      districtId: IDS.district,
      officerId: IDS.officer,
    });
  });

  afterAll(async () => {
    await db.delete(schema.activityLogs).where(
      inArray(schema.activityLogs.officerId, [IDS.officer, IDS.officerOther]),
    );
    await db.delete(schema.canVisits).where(
      inArray(schema.canVisits.canId, [IDS.canKosong, IDS.canReturned, IDS.canOther]),
    );
    await db.delete(schema.assignments).where(
      inArray(schema.assignments.id, [
        IDS.assignmentKosong,
        IDS.assignmentReturned,
        IDS.assignmentOther,
      ]),
    );
    await db.delete(schema.cans).where(
      inArray(schema.cans.id, [IDS.canKosong, IDS.canReturned, IDS.canOther]),
    );
    await db.delete(schema.officers).where(
      inArray(schema.officers.id, [IDS.officer, IDS.officerOther]),
    );
    await db.delete(schema.users).where(
      inArray(schema.users.id, [IDS.officerUser, IDS.otherUser]),
    );
    await db.delete(schema.dukuhs).where(eq(schema.dukuhs.id, IDS.dukuh));
    await db.delete(schema.branches).where(eq(schema.branches.id, IDS.branch));
    await db.delete(schema.districts).where(eq(schema.districts.id, IDS.district));
    await closeApp();
  });

  it('KOSONG menyelesaikan tugas VISIT tetapi kaleng tetap NON_AKTIF', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/mobile/cans/${IDS.canKosong}/visits`,
      headers: { authorization: `Bearer ${token}` },
      payload: { outcome: 'KOSONG', assignment_id: IDS.assignmentKosong },
    });

    expect(res.statusCode).toBe(201);

    const [can] = await db.select().from(schema.cans).where(eq(schema.cans.id, IDS.canKosong));
    const [assignment] = await db
      .select()
      .from(schema.assignments)
      .where(eq(schema.assignments.id, IDS.assignmentKosong));
    const visits = await db
      .select()
      .from(schema.canVisits)
      .where(eq(schema.canVisits.canId, IDS.canKosong));

    expect(can?.condition).toBe('NON_AKTIF');
    expect(can?.isActive).toBe(true);
    expect(assignment?.status).toBe('COMPLETED');
    expect(assignment?.completedAt).not.toBeNull();
    expect(visits).toHaveLength(1);
    expect(visits[0]?.outcome).toBe('KOSONG');
  });

  it('DIKEMBALIKAN mengeluarkan kaleng dan menyelesaikan tugas VISIT', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/mobile/cans/${IDS.canReturned}/visits`,
      headers: { authorization: `Bearer ${token}` },
      payload: { outcome: 'DIKEMBALIKAN', assignment_id: IDS.assignmentReturned },
    });

    expect(res.statusCode).toBe(201);

    const [can] = await db.select().from(schema.cans).where(eq(schema.cans.id, IDS.canReturned));
    const [assignment] = await db
      .select()
      .from(schema.assignments)
      .where(eq(schema.assignments.id, IDS.assignmentReturned));

    expect(can?.condition).toBe('DIKEMBALIKAN');
    expect(can?.isActive).toBe(false);
    expect(assignment?.status).toBe('COMPLETED');
  });

  it('menolak assignment_id milik petugas lain', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/mobile/cans/${IDS.canOther}/visits`,
      headers: { authorization: `Bearer ${token}` },
      payload: { outcome: 'KOSONG', assignment_id: IDS.assignmentOther },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ASSIGNMENT_INVALID');

    const [can] = await db.select().from(schema.cans).where(eq(schema.cans.id, IDS.canOther));
    const visits = await db
      .select()
      .from(schema.canVisits)
      .where(and(
        eq(schema.canVisits.canId, IDS.canOther),
        eq(schema.canVisits.officerId, IDS.officer),
      ));
    expect(can?.condition).toBe('NON_AKTIF');
    expect(visits).toHaveLength(0);
  });
});
