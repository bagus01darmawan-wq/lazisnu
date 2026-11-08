/**
 * Sinkronisasi jenis tugas ACTIVE saat kondisi kaleng berubah.
 * - NON_AKTIF: PICKUP ACTIVE → VISIT
 * - AKTIF/RUSAK/HILANG: VISIT ACTIVE → PICKUP
 * - DIKEMBALIKAN: semua ACTIVE → COMPLETED + completedAt
 */
import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { syncActiveAssignmentKindForCan } from '../assignmentKindService';

const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();

const IDS = {
  district: randomUUID(),
  branch: randomUUID(),
  user: randomUUID(),
  officer: randomUUID(),
  canPickup: randomUUID(),
  canVisit: randomUUID(),
  canReturned: randomUUID(),
};

describe('syncActiveAssignmentKindForCan', () => {
  beforeAll(async () => {
    await db.insert(schema.districts).values({
      id: IDS.district,
      code: `AKD${TAG}`,
      name: 'Kecamatan Assignment Kind',
      regionCode: '39',
    });
    await db.insert(schema.branches).values({
      id: IDS.branch,
      districtId: IDS.district,
      code: `AKB${TAG}`,
      name: 'Ranting Assignment Kind',
    });
    await db.insert(schema.users).values({
      id: IDS.user,
      email: `ak.officer.${TAG}@example.test`,
      passwordHash: 'x',
      fullName: 'Petugas Assignment Kind',
      phone: `6287701${TAG}`,
      role: 'PETUGAS',
      districtId: IDS.district,
      branchId: IDS.branch,
    });
    await db.insert(schema.officers).values({
      id: IDS.officer,
      userId: IDS.user,
      employeeCode: `AK${TAG}`,
      fullName: 'Petugas Assignment Kind',
      phone: `6287701${TAG}`,
      districtId: IDS.district,
      branchId: IDS.branch,
      isActive: true,
    });
    await db.insert(schema.cans).values([
      {
        id: IDS.canPickup,
        branchId: IDS.branch,
        ownerName: 'Warga Pickup',
        ownerWhatsapp: `6288801${TAG}`,
        condition: 'AKTIF',
        isActive: true,
      },
      {
        id: IDS.canVisit,
        branchId: IDS.branch,
        ownerName: 'Warga Visit',
        ownerWhatsapp: `6288802${TAG}`,
        condition: 'NON_AKTIF',
        isActive: true,
      },
      {
        id: IDS.canReturned,
        branchId: IDS.branch,
        ownerName: 'Warga Returned',
        ownerWhatsapp: `6288803${TAG}`,
        condition: 'NON_AKTIF',
        isActive: true,
      },
    ]);
  });

  afterAll(async () => {
    await db
      .delete(schema.assignments)
      .where(inArray(schema.assignments.canId, [IDS.canPickup, IDS.canVisit, IDS.canReturned]));
    await db
      .delete(schema.cans)
      .where(inArray(schema.cans.id, [IDS.canPickup, IDS.canVisit, IDS.canReturned]));
    await db.delete(schema.officers).where(eq(schema.officers.id, IDS.officer));
    await db.delete(schema.users).where(eq(schema.users.id, IDS.user));
    await db.delete(schema.branches).where(eq(schema.branches.id, IDS.branch));
    await db.delete(schema.districts).where(eq(schema.districts.id, IDS.district));
  });

  it('mengubah PICKUP ACTIVE menjadi VISIT saat kaleng NON_AKTIF', async () => {
    const [assignment] = await db.insert(schema.assignments).values({
      canId: IDS.canPickup,
      officerId: IDS.officer,
      periodYear: 2026,
      periodMonth: 11,
      kind: 'PICKUP',
      status: 'ACTIVE',
    }).returning();

    await db.transaction(async (tx) => {
      await syncActiveAssignmentKindForCan(tx, IDS.canPickup, 'NON_AKTIF');
    });

    const [row] = await db
      .select({ kind: schema.assignments.kind, status: schema.assignments.status })
      .from(schema.assignments)
      .where(eq(schema.assignments.id, assignment.id));
    expect(row).toMatchObject({ kind: 'VISIT', status: 'ACTIVE' });
  });

  it('mengubah VISIT ACTIVE menjadi PICKUP saat kaleng kembali aktif', async () => {
    const [assignment] = await db.insert(schema.assignments).values({
      canId: IDS.canVisit,
      officerId: IDS.officer,
      periodYear: 2026,
      periodMonth: 11,
      kind: 'VISIT',
      status: 'ACTIVE',
    }).returning();

    await db.transaction(async (tx) => {
      await syncActiveAssignmentKindForCan(tx, IDS.canVisit, 'AKTIF');
    });

    const [row] = await db
      .select({ kind: schema.assignments.kind, status: schema.assignments.status })
      .from(schema.assignments)
      .where(eq(schema.assignments.id, assignment.id));
    expect(row).toMatchObject({ kind: 'PICKUP', status: 'ACTIVE' });
  });

  it('menutup semua tugas ACTIVE saat kaleng DIKEMBALIKAN', async () => {
    const [assignment] = await db.insert(schema.assignments).values({
      canId: IDS.canReturned,
      officerId: IDS.officer,
      periodYear: 2026,
      periodMonth: 11,
      kind: 'VISIT',
      status: 'ACTIVE',
    }).returning();

    await db.transaction(async (tx) => {
      await syncActiveAssignmentKindForCan(tx, IDS.canReturned, 'DIKEMBALIKAN');
    });

    const [row] = await db
      .select({
        status: schema.assignments.status,
        completedAt: schema.assignments.completedAt,
      })
      .from(schema.assignments)
      .where(eq(schema.assignments.id, assignment.id));
    expect(row?.status).toBe('COMPLETED');
    expect(row?.completedAt).not.toBeNull();
  });
});
