/**
 * Integrasi penulis ledger: atribusi periode tugas harus tersimpan pada event,
 * bukan disimpulkan dari tanggal tindakan.
 *
 * Mengunci:
 * - COLLECTION memakai periode assignment asal (Oktober walau dijemput November),
 * - AUTO_EMPTY_STREAK & AUTO_RESTORE_ACTIVE memakai koleksi pemicu + periodenya,
 * - ADMIN_UPDATE dan persetujuan proposal hanya masuk rekap bila periode eksplisit.
 */
import { randomUUID } from 'crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { submitCollection } from '../collectionSubmission';
import { updateCan } from '../canService';
import {
  approveConditionProposal,
  evaluateEmptyStreakForCan,
} from '../conditionProposalService';
import { CAN_STATE_SOURCE } from '../canStateHistory';

const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
const IDS = {
  district: randomUUID(),
  branch: randomUUID(),
  user: randomUUID(),
  officer: randomUUID(),
  canManual: randomUUID(),
  canProposal: randomUUID(),
  canAuto: randomUUID(),
  canCollection: randomUUID(),
  assignmentCollection: randomUUID(),
  proposal: randomUUID(),
};
const autoAssignmentIds = Array.from({ length: 7 }, () => randomUUID());
const autoCollectionIds = Array.from({ length: 7 }, () => randomUUID());

const at = (iso: string) => new Date(iso);

const ctx = {
  userId: IDS.user,
  role: 'ADMIN_RANTING' as const,
  branchId: IDS.branch,
  districtId: IDS.district,
};

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

async function cleanup() {
  const canIds = [IDS.canManual, IDS.canProposal, IDS.canAuto, IDS.canCollection];
  await withImmutableRulesDisabled(async () => {
    await db.delete(schema.canStateHistory).where(inArray(schema.canStateHistory.canId, canIds));
    await db.delete(schema.collections).where(inArray(schema.collections.canId, canIds));
    await db.delete(schema.assignments).where(inArray(schema.assignments.canId, canIds));
  });
  await db.delete(schema.canStateHistory).where(inArray(schema.canStateHistory.canId, canIds));
  await db.delete(schema.cans).where(inArray(schema.cans.id, canIds));
  await db.delete(schema.activityLogs).where(eq(schema.activityLogs.officerId, IDS.officer));
  await db.delete(schema.activityLogs).where(eq(schema.activityLogs.userId, IDS.user));
  await db.delete(schema.officers).where(eq(schema.officers.id, IDS.officer));
  await db.delete(schema.users).where(eq(schema.users.id, IDS.user));
  await db.delete(schema.branches).where(eq(schema.branches.id, IDS.branch));
  await db.delete(schema.districts).where(eq(schema.districts.id, IDS.district));
}

async function latestEvent(canId: string, sourceType: string) {
  const [row] = await db
    .select()
    .from(schema.canStateHistory)
    .where(and(
      eq(schema.canStateHistory.canId, canId),
      eq(schema.canStateHistory.sourceType, sourceType),
    ))
    .orderBy(desc(schema.canStateHistory.canVersion))
    .limit(1);
  return row;
}

describe('atribusi periode tugas pada penulis ledger', () => {
  beforeAll(async () => {
    await cleanup();

    await db.insert(schema.districts).values({
      id: IDS.district,
      code: `CWA${TAG}`,
      name: 'Kecamatan Writer Attribution',
      regionCode: '33',
    });
    await db.insert(schema.branches).values({
      id: IDS.branch,
      districtId: IDS.district,
      code: `CWB${TAG}`,
      name: 'Ranting Writer',
    });
    await db.insert(schema.users).values({
      id: IDS.user,
      email: `writer-attr-${TAG.toLowerCase()}@test.local`,
      passwordHash: 'x',
      fullName: 'Admin Writer',
      phone: `08421${TAG}`,
      role: 'ADMIN_RANTING',
      districtId: IDS.district,
      branchId: IDS.branch,
    });
    await db.insert(schema.officers).values({
      id: IDS.officer,
      userId: IDS.user,
      employeeCode: `CW${TAG}`,
      fullName: 'Petugas Writer',
      phone: `08422${TAG}`,
      districtId: IDS.district,
      branchId: IDS.branch,
    });

    await db.insert(schema.cans).values([
      { id: IDS.canManual, branchId: IDS.branch, ownerName: 'Manual', ownerWhatsapp: `6284301${TAG}` },
      { id: IDS.canProposal, branchId: IDS.branch, ownerName: 'Proposal', ownerWhatsapp: `6284302${TAG}` },
      { id: IDS.canAuto, branchId: IDS.branch, ownerName: 'Auto', ownerWhatsapp: `6284303${TAG}` },
      { id: IDS.canCollection, branchId: IDS.branch, ownerName: 'Collection', ownerWhatsapp: `6284304${TAG}` },
    ]);

    await db.insert(schema.assignments).values([
      {
        id: IDS.assignmentCollection,
        canId: IDS.canCollection,
        officerId: IDS.officer,
        periodYear: 2026,
        periodMonth: 9,
        kind: 'PICKUP',
      },
      ...autoAssignmentIds.map((id, index) => ({
        id,
        canId: IDS.canAuto,
        officerId: IDS.officer,
        periodYear: 2026,
        periodMonth: index + 1,
        kind: 'PICKUP' as const,
      })),
    ]);

    // Enam penjemputan kosong berturut-turut (Jan–Jun) → AUTO_EMPTY_STREAK.
    await db.insert(schema.collections).values(autoCollectionIds.slice(0, 6).map((id, index) => ({
      id,
      assignmentId: autoAssignmentIds[index],
      canId: IDS.canAuto,
      officerId: IDS.officer,
      nominal: 0n,
      collectedAt: at(`2026-${String(index + 1).padStart(2, '0')}-05T00:00:00Z`),
      syncStatus: 'COMPLETED' as const,
      submitSequence: 1,
    })));

    await db.insert(schema.canConditionProposals).values({
      id: IDS.proposal,
      canId: IDS.canProposal,
      fromCondition: 'AKTIF',
      toCondition: 'NON_AKTIF',
      triggerSource: 'MANUAL',
      reasonCode: 'OTHER',
      status: 'PENDING',
    });
  });

  afterAll(cleanup);

  it('COLLECTION memakai periode assignment, bukan bulan collected_at', async () => {
    const collection = await db.transaction(async (tx) => {
      return submitCollection(tx, {
        assignmentId: IDS.assignmentCollection,
        canId: IDS.canCollection,
        officerId: IDS.officer,
        actorUserId: IDS.user,
        nominal: 10000,
        collectedAt: at('2026-10-05T00:00:00Z'),
        condition: 'RUSAK',
      });
    });

    const event = await latestEvent(IDS.canCollection, CAN_STATE_SOURCE.COLLECTION);
    expect(event).toBeDefined();
    expect(event.periodYear).toBe(2026);
    expect(event.periodMonth).toBe(9);
    expect(event.triggerCollectionId).toBe(collection.id);
    expect(event.triggerAssignmentId).toBe(IDS.assignmentCollection);

    // Bersihkan koleksi buatan helper ini agar teardown mudah.
    await withImmutableRulesDisabled(async () => {
      await db.delete(schema.collections).where(eq(schema.collections.id, collection.id));
    });
  });

  it('ADMIN_UPDATE menyimpan periode eksplisit; tanpa periode tetap NULL', async () => {
    await updateCan(IDS.canManual, {
      condition: 'NON_AKTIF',
      period_year: 2026,
      period_month: 10,
    }, ctx);

    const withPeriod = await latestEvent(IDS.canManual, CAN_STATE_SOURCE.ADMIN_UPDATE);
    expect(withPeriod.periodYear).toBe(2026);
    expect(withPeriod.periodMonth).toBe(10);

    await updateCan(IDS.canManual, { physical_condition: 'RUSAK' }, ctx);

    const withoutPeriod = await latestEvent(IDS.canManual, CAN_STATE_SOURCE.ADMIN_UPDATE);
    expect(withoutPeriod.periodYear).toBeNull();
    expect(withoutPeriod.periodMonth).toBeNull();
  });

  it('persetujuan proposal mengikuti periode eksplisit admin', async () => {
    await approveConditionProposal(IDS.proposal, ctx, null, {
      periodYear: 2026,
      periodMonth: 9,
    });

    const event = await latestEvent(IDS.canProposal, CAN_STATE_SOURCE.CONDITION_PROPOSAL);
    expect(event).toBeDefined();
    expect(event.periodYear).toBe(2026);
    expect(event.periodMonth).toBe(9);
    expect(event.sourceId).toBe(IDS.proposal);
  });

  it('AUTO_EMPTY_STREAK dan AUTO_RESTORE_ACTIVE memakai koleksi pemicu', async () => {
    const first = await evaluateEmptyStreakForCan(IDS.canAuto);
    expect(first.action).toBe('AUTO_NON_AKTIF');

    const nonActive = await latestEvent(IDS.canAuto, CAN_STATE_SOURCE.AUTO_EMPTY_STREAK);
    expect(nonActive).toBeDefined();
    expect(nonActive.periodYear).toBe(2026);
    expect(nonActive.periodMonth).toBe(6);
    expect(nonActive.triggerCollectionId).toBe(autoCollectionIds[5]);
    expect(nonActive.triggerAssignmentId).toBe(autoAssignmentIds[5]);

    // Koleksi positif pada tugas Juli memicu pemulihan; sumbernya idempoten.
    await db.insert(schema.collections).values({
      id: autoCollectionIds[6],
      assignmentId: autoAssignmentIds[6],
      canId: IDS.canAuto,
      officerId: IDS.officer,
      nominal: 5000n,
      collectedAt: at('2026-07-05T00:00:00Z'),
      syncStatus: 'COMPLETED',
      submitSequence: 1,
    });

    const second = await evaluateEmptyStreakForCan(IDS.canAuto);
    expect(second.action).toBe('RESTORED_ACTIVE');

    const restored = await latestEvent(IDS.canAuto, CAN_STATE_SOURCE.AUTO_RESTORE_ACTIVE);
    expect(restored).toBeDefined();
    expect(restored.periodYear).toBe(2026);
    expect(restored.periodMonth).toBe(7);
    expect(restored.triggerCollectionId).toBe(autoCollectionIds[6]);
    expect(restored.sourceId).toBe(autoCollectionIds[6]);
  });
});
