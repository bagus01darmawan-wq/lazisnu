/**
 * POST /v1/mobile/assignments/:id/reopen — buka kembali tugas UNCOLLECTED
 * pada periode operasional berjalan (keputusan produk 2026-10-25):
 *   - happy path: UNCOLLECTED → ACTIVE, completedAt kosong, notes bertanda
 *     reopen, skipReasonCode dipertahankan sebagai riwayat;
 *   - tolak tugas milik petugas lain (403);
 *   - tolak status selain UNCOLLECTED (409);
 *   - tolak periode yang sudah lewat (409 PERIOD_CLOSED);
 *   - reopen kedua pada tugas yang sama ditolak (409).
 */
import { randomUUID } from 'crypto';
import { eq, inArray, or } from 'drizzle-orm';
import { getApp, closeApp } from './helpers/app-helper';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { currentOperationalPeriod } from '../../utils/operationalTimeZone';

const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();

const OP = currentOperationalPeriod();
// Periode lampau yang pasti sudah lewat — untuk uji guard periode.
const PAST = { year: 2020, month: 1 };

const IDS = {
  district: randomUUID(),
  branch: randomUUID(),
  dukuh: randomUUID(),
  officerUser: randomUUID(),
  otherUser: randomUUID(),
  officer: randomUUID(),
  officerOther: randomUUID(),
  canCurrent: randomUUID(),
  canOtherOfficer: randomUUID(),
  canActive: randomUUID(),
  canPast: randomUUID(),
};

let token = '';
let otherToken = '';

async function insertUncollectedAssignment(canId: string, officerId: string, period: { year: number; month: number }) {
  await db.insert(schema.assignments).values({
    canId,
    officerId,
    periodYear: period.year,
    periodMonth: period.month,
    status: 'UNCOLLECTED',
    skipReasonCode: 'OWNER_ABSENT',
    notes: null,
    completedAt: new Date(),
  });
}

describe('POST /mobile/assignments/:id/reopen', () => {
  beforeAll(async () => {
    const app = await getApp();

    await db.insert(schema.districts).values({
      id: IDS.district,
      code: `ROR${TAG}`,
      name: 'Kecamatan Reopen',
      regionCode: '37',
    });
    await db.insert(schema.branches).values({
      id: IDS.branch,
      districtId: IDS.district,
      code: `ROB${TAG}`,
      name: 'Ranting Reopen',
    });
    await db.insert(schema.dukuhs).values({
      id: IDS.dukuh,
      branchId: IDS.branch,
      name: 'Dukuh Reopen',
    });
    await db.insert(schema.users).values([
      {
        id: IDS.officerUser,
        email: `ro.officer.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Petugas Reopen',
        phone: `6288801${TAG}`,
        role: 'PETUGAS',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
      {
        id: IDS.otherUser,
        email: `ro.other.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Petugas Lain',
        phone: `6288802${TAG}`,
        role: 'PETUGAS',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
    ]);
    await db.insert(schema.officers).values([
      {
        id: IDS.officer,
        userId: IDS.officerUser,
        employeeCode: `RO${TAG}`,
        fullName: 'Petugas Reopen',
        phone: `6288801${TAG}`,
        districtId: IDS.district,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        isActive: true,
      },
      {
        id: IDS.officerOther,
        userId: IDS.otherUser,
        employeeCode: `RP${TAG}`,
        fullName: 'Petugas Lain',
        phone: `6288802${TAG}`,
        districtId: IDS.district,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        isActive: true,
      },
    ]);
    await db.insert(schema.cans).values([
      {
        id: IDS.canCurrent,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        ownerName: 'Warga Reopen 1',
        ownerWhatsapp: `6289901${TAG}`,
        rt: '001',
        rw: '001',
        condition: 'AKTIF',
        isActive: true,
      },
      {
        id: IDS.canOtherOfficer,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        ownerName: 'Warga Reopen 2',
        ownerWhatsapp: `6289902${TAG}`,
        rt: '001',
        rw: '001',
        condition: 'AKTIF',
        isActive: true,
      },
      {
        id: IDS.canActive,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        ownerName: 'Warga Reopen 3',
        ownerWhatsapp: `6289903${TAG}`,
        rt: '001',
        rw: '001',
        condition: 'AKTIF',
        isActive: true,
      },
      {
        id: IDS.canPast,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        ownerName: 'Warga Reopen 4',
        ownerWhatsapp: `6289904${TAG}`,
        rt: '001',
        rw: '001',
        condition: 'AKTIF',
        isActive: true,
      },
    ]);

    // Tugas UNCOLLECTED milik petugas utama pada periode berjalan.
    await insertUncollectedAssignment(IDS.canCurrent, IDS.officer, OP);
    // Tugas UNCOLLECTED milik petugas lain (uji kepemilikan).
    await insertUncollectedAssignment(IDS.canOtherOfficer, IDS.officerOther, OP);
    // Tugas masih ACTIVE (uji penolakan status).
    await db.insert(schema.assignments).values({
      canId: IDS.canActive,
      officerId: IDS.officer,
      periodYear: OP.year,
      periodMonth: OP.month,
      status: 'ACTIVE',
    });
    // Tugas UNCOLLECTED periode lampau (uji guard periode).
    await insertUncollectedAssignment(IDS.canPast, IDS.officer, PAST);

    const jwtPayload = {
      userId: IDS.officerUser,
      role: 'PETUGAS',
      branchId: IDS.branch,
      districtId: IDS.district,
      officerId: IDS.officer,
    };
    token = app.jwt.sign(jwtPayload);
    otherToken = app.jwt.sign({ ...jwtPayload, userId: IDS.otherUser, officerId: IDS.officerOther });
  });

  afterAll(async () => {
    await db.delete(schema.activityLogs).where(
      or(
        inArray(schema.activityLogs.userId, [IDS.officerUser, IDS.otherUser]),
        inArray(schema.activityLogs.officerId, [IDS.officer, IDS.officerOther]),
      ),
    );
    await db.delete(schema.assignments).where(
      inArray(schema.assignments.canId, [
        IDS.canCurrent,
        IDS.canOtherOfficer,
        IDS.canActive,
        IDS.canPast,
      ]),
    );
    await db.delete(schema.cans).where(
      inArray(schema.cans.id, [IDS.canCurrent, IDS.canOtherOfficer, IDS.canActive, IDS.canPast]),
    );
    // Hapus ulang log audit tepat sebelum officers: hook onResponse bisa
    // mendarat sesudah pembersihan pertama dan mengunci delete officers
    // (FK activity_logs_officer_id — Flake CI 2026-10-27).
    await db.delete(schema.activityLogs).where(
      or(
        inArray(schema.activityLogs.userId, [IDS.officerUser, IDS.otherUser]),
        inArray(schema.activityLogs.officerId, [IDS.officer, IDS.officerOther]),
      ),
    );
    await db.delete(schema.officers).where(inArray(schema.officers.id, [IDS.officer, IDS.officerOther]));
    await db.delete(schema.users).where(inArray(schema.users.id, [IDS.officerUser, IDS.otherUser]));
    await db.delete(schema.dukuhs).where(eq(schema.dukuhs.id, IDS.dukuh));
    await db.delete(schema.branches).where(eq(schema.branches.id, IDS.branch));
    await db.delete(schema.districts).where(eq(schema.districts.id, IDS.district));
    await closeApp();
  });

  it('happy path: UNCOLLECTED periode berjalan → ACTIVE, completedAt kosong, notes bertanda, alasan dipertahankan', async () => {
    const app = await getApp();
    let assignmentId: string | undefined;
    const row = await db.query.assignments.findFirst({ where: eq(schema.assignments.canId, IDS.canCurrent) });
    assignmentId = row?.id;
    expect(assignmentId).toBeDefined();

    const res = await app.inject({
      method: 'POST',
      url: `/v1/mobile/assignments/${assignmentId}/reopen`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('ACTIVE');

    const after = await db.query.assignments.findFirst({ where: eq(schema.assignments.id, assignmentId!) });
    expect(after?.status).toBe('ACTIVE');
    expect(after?.completedAt).toBeNull();
    expect(after?.skipReasonCode).toBe('OWNER_ABSENT');
    expect(after?.notes).toContain('Diaktifkan kembali oleh petugas');
  });

  it('tolak tugas milik petugas lain (403)', async () => {
    const app = await getApp();
    const row = await db.query.assignments.findFirst({
      where: eq(schema.assignments.canId, IDS.canOtherOfficer),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/v1/mobile/assignments/${row?.id}/reopen`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ASSIGNMENT_INVALID');
  });

  it('tolak tugas yang masih ACTIVE (409)', async () => {
    const app = await getApp();
    const row = await db.query.assignments.findFirst({
      where: eq(schema.assignments.canId, IDS.canActive),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/v1/mobile/assignments/${row?.id}/reopen`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ASSIGNMENT_NOT_REOPENABLE');
  });

  it('tolak tugas periode yang sudah lewat (409 PERIOD_CLOSED)', async () => {
    const app = await getApp();
    const row = await db.query.assignments.findFirst({
      where: eq(schema.assignments.canId, IDS.canPast),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/v1/mobile/assignments/${row?.id}/reopen`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('PERIOD_CLOSED');
  });

  it('reopen kedua pada tugas yang sama ditolak (409)', async () => {
    const app = await getApp();
    const row = await db.query.assignments.findFirst({
      where: eq(schema.assignments.canId, IDS.canCurrent),
    });
    expect(row?.status).toBe('ACTIVE');

    const res = await app.inject({
      method: 'POST',
      url: `/v1/mobile/assignments/${row?.id}/reopen`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ASSIGNMENT_NOT_REOPENABLE');
  });
});
