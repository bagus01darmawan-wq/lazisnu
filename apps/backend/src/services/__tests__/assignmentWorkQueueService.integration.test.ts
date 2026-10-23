/**
 * Test integrasi work queue halaman Penugasan.
 *
 * Mengunci aturan yang membuat angka di tab Kelola bisa dipercaya:
 *   - `unassignedAssignableCans` sama dengan total `unassignedCans` grup;
 *   - kaleng NON_AKTIF / DIKEMBALIKAN tidak masuk antrean;
 *   - scope dukuh mengembalikan grup berisi `canIds` agar bisa di-assign subset;
 *   - ADMIN_RANTING tidak bisa meminta work queue ranting lain.
 */
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { getAssignmentWorkQueue } from '../assignmentWorkQueueService';

const IDS = {
  district: randomUUID(),
  branch: randomUUID(),
  otherBranch: randomUUID(),
  dukuh: randomUUID(),
  user: randomUUID(),
  officerUser: randomUUID(),
  officer: randomUUID(),
  canAktif: randomUUID(),
  canRusak: randomUUID(),
  canHilang: randomUUID(),
  canNonAktif: randomUUID(),
  canDikembalikan: randomUUID(),
  canAssigned: randomUUID(),
  assignment: randomUUID(),
};

const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
const PERIOD = { year: 2026, month: 10 };

const rantingAdmin = {
  userId: randomUUID(),
  role: 'ADMIN_RANTING',
  districtId: IDS.district,
  branchId: IDS.branch,
} as any;

describe('assignmentWorkQueueService', () => {
  beforeAll(async () => {
    await db.insert(schema.districts).values({
      id: IDS.district,
      code: `WQD${TAG}`,
      name: 'Kecamatan Fixture Work Queue',
      regionCode: '34',
    });

    await db.insert(schema.branches).values([
      {
        id: IDS.branch,
        districtId: IDS.district,
        code: `WQB${TAG}`,
        name: 'Ranting Work Queue',
      },
      {
        id: IDS.otherBranch,
        districtId: IDS.district,
        code: `WQC${TAG}`,
        name: 'Ranting Lain',
      },
    ]);

    await db.insert(schema.dukuhs).values({
      id: IDS.dukuh,
      branchId: IDS.branch,
      name: 'Dukuh Queue',
    });

    await db.insert(schema.users).values([
      {
        id: IDS.user,
        email: `wq.admin.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Admin Work Queue',
        phone: `6283301${TAG}`,
        role: 'ADMIN_RANTING',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
      {
        id: IDS.officerUser,
        email: `wq.officer.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Petugas Work Queue',
        phone: `6283302${TAG}`,
        role: 'PETUGAS',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
    ]);

    await db.insert(schema.officers).values({
      id: IDS.officer,
      userId: IDS.officerUser,
      employeeCode: `WQ${TAG}`,
      fullName: 'Petugas Work Queue',
      phone: `6283302${TAG}`,
      districtId: IDS.district,
      branchId: IDS.branch,
      dukuhId: IDS.dukuh,
      isActive: true,
    });

    await db.insert(schema.cans).values([
      {
        id: IDS.canAktif,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        ownerName: 'Warga Aktif',
        ownerWhatsapp: `6284401${TAG}`,
        rt: '001',
        rw: '001',
        condition: 'AKTIF',
        isActive: true,
      },
      {
        id: IDS.canRusak,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        ownerName: 'Warga Rusak',
        ownerWhatsapp: `6284402${TAG}`,
        rt: '001',
        rw: '001',
        condition: 'RUSAK',
        isActive: true,
      },
      {
        id: IDS.canHilang,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        ownerName: 'Warga Hilang',
        ownerWhatsapp: `6284403${TAG}`,
        rt: '002',
        rw: '001',
        condition: 'HILANG',
        isActive: true,
      },
      {
        id: IDS.canNonAktif,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        ownerName: 'Warga Non Aktif',
        ownerWhatsapp: `6284404${TAG}`,
        rt: '002',
        rw: '001',
        condition: 'NON_AKTIF',
        isActive: true,
      },
      {
        id: IDS.canDikembalikan,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        ownerName: 'Warga Dikembalikan',
        ownerWhatsapp: `6284405${TAG}`,
        rt: '003',
        rw: '001',
        condition: 'DIKEMBALIKAN',
        isActive: false,
      },
      {
        id: IDS.canAssigned,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        ownerName: 'Warga Sudah Ditugaskan',
        ownerWhatsapp: `6284406${TAG}`,
        rt: '003',
        rw: '001',
        condition: 'AKTIF',
        isActive: true,
      },
    ]);

    await db.insert(schema.assignments).values({
      id: IDS.assignment,
      canId: IDS.canAssigned,
      officerId: IDS.officer,
      periodYear: PERIOD.year,
      periodMonth: PERIOD.month,
      status: 'COMPLETED',
    });
  });

  afterAll(async () => {
    await db.delete(schema.assignments).where(eq(schema.assignments.id, IDS.assignment));
    await db
      .delete(schema.cans)
      .where(
        inArray(schema.cans.id, [
          IDS.canAktif,
          IDS.canRusak,
          IDS.canHilang,
          IDS.canNonAktif,
          IDS.canDikembalikan,
          IDS.canAssigned,
        ])
      );
    await db.delete(schema.officers).where(eq(schema.officers.id, IDS.officer));
    await db
      .delete(schema.users)
      .where(inArray(schema.users.id, [IDS.user, IDS.officerUser]));
    await db.delete(schema.dukuhs).where(eq(schema.dukuhs.id, IDS.dukuh));
    await db
      .delete(schema.branches)
      .where(inArray(schema.branches.id, [IDS.branch, IDS.otherBranch]));
    await db.delete(schema.districts).where(eq(schema.districts.id, IDS.district));
  });

  it('menghitung coverage hanya dari kaleng assignable', async () => {
    const result = await getAssignmentWorkQueue(rantingAdmin, {
      year: String(PERIOD.year),
      month: String(PERIOD.month),
      branch_id: IDS.branch,
    });

    expect(result.region.kind).toBe('branch');
    expect(result.summary.totalCans).toBe(6);
    expect(result.summary.assignableCans).toBe(4);
    expect(result.summary.assignedAssignableCans).toBe(1);
    expect(result.summary.unassignedAssignableCans).toBe(3);
    expect(result.summary.nonAssignableCans).toBe(2);
    expect(result.summary.completed).toBe(1);
  });

  it('total unassigned grup sama dengan ringkasan', async () => {
    const result = await getAssignmentWorkQueue(rantingAdmin, {
      year: String(PERIOD.year),
      month: String(PERIOD.month),
      branch_id: IDS.branch,
    });

    const groupTotal = result.groups.reduce((sum, group) => sum + group.unassignedCans, 0);
    expect(groupTotal).toBe(result.summary.unassignedAssignableCans);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].kind).toBe('dukuh');
    expect(result.groups[0].totalCans).toBe(4);
    expect(result.groups[0].assignedCans).toBe(1);
  });

  it('scope dukuh mengembalikan grup RT dengan canIds untuk bulk-cans', async () => {
    const result = await getAssignmentWorkQueue(rantingAdmin, {
      year: String(PERIOD.year),
      month: String(PERIOD.month),
      dukuh_id: IDS.dukuh,
    });

    expect(result.region.kind).toBe('dukuh');
    expect(result.summary.unassignedAssignableCans).toBe(3);
    const rtGroups = result.groups.filter((group) => group.kind === 'rt');
    expect(rtGroups).toHaveLength(2);
    expect(rtGroups.every((group) => (group.canIds?.length ?? 0) > 0)).toBe(true);
    expect(result.groups.flatMap((group) => group.canIds ?? []).sort()).toEqual(
      [IDS.canAktif, IDS.canRusak, IDS.canHilang].sort()
    );
  });

  it('petugas aktif membawa beban kerja periode berjalan', async () => {
    const result = await getAssignmentWorkQueue(rantingAdmin, {
      year: String(PERIOD.year),
      month: String(PERIOD.month),
      branch_id: IDS.branch,
    });

    expect(result.officers).toHaveLength(1);
    expect(result.officers[0].assignedCount).toBe(1);
    expect(result.officers[0].completedCount).toBe(1);
    expect(result.officers[0].dukuhName).toBe('Dukuh Queue');
  });

  it('ADMIN_RANTING dipaksa memakai ranting dari JWT', async () => {
    const result = await getAssignmentWorkQueue(rantingAdmin, {
      year: String(PERIOD.year),
      month: String(PERIOD.month),
      branch_id: IDS.otherBranch,
    });

    expect(result.region.branchId).toBe(IDS.branch);
    expect(result.summary.totalCans).toBe(6);
  });
});
