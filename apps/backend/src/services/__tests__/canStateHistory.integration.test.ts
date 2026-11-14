/**
 * Integrasi ledger: idempotensi source id + konkurensi dua mutasi dimensi
 * berbeda pada satu kaleng. Membuktikan lock baris mencegah lost update dan
 * kedua event tercatat.
 */
import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import {
  appendCanStateEvent,
  lockCanRow,
  recordCanStateChange,
  CAN_STATE_SOURCE,
} from '../canStateHistory';
import type { CanState } from '../canState';

const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
const IDS = {
  district: randomUUID(),
  branchA: randomUUID(),
  branchB: randomUUID(),
  can: randomUUID(),
};

const stateOf = (row: {
  lifecycleStatus: CanState['lifecycleStatus'];
  physicalCondition: CanState['physicalCondition'];
  physicalConditionSource: CanState['physicalConditionSource'] | null;
}): CanState => ({
  lifecycleStatus: row.lifecycleStatus,
  physicalCondition: row.physicalCondition,
  physicalConditionSource: row.physicalConditionSource ?? 'OBSERVED',
});

describe('canStateHistory — idempotensi & konkurensi', () => {
  beforeAll(async () => {
    await db.insert(schema.districts).values({
      id: IDS.district, code: `LGR${TAG}`, name: 'Kecamatan Ledger', regionCode: '33',
    });
    await db.insert(schema.branches).values([
      { id: IDS.branchA, districtId: IDS.district, code: `LGA${TAG}`, name: 'Ranting A' },
      { id: IDS.branchB, districtId: IDS.district, code: `LGB${TAG}`, name: 'Ranting B' },
    ]);
    await db.insert(schema.cans).values({
      id: IDS.can,
      branchId: IDS.branchA,
      ownerName: 'Warga Ledger',
      ownerWhatsapp: `6283201${TAG}`,
    });
    await db.insert(schema.canStateHistory).values({
      canId: IDS.can,
      lifecycleStatus: 'AKTIF',
      physicalCondition: 'BAIK',
      physicalConditionSource: 'CUTOVER_BASELINE',
      branchId: IDS.branchA,
      effectiveAt: new Date('2026-10-01T00:00:00Z'),
      canVersion: 0,
      sourceType: CAN_STATE_SOURCE.CUTOVER_BASELINE,
      sourceId: IDS.can,
    });
  });

  afterAll(async () => {
    await db.delete(schema.cans).where(eq(schema.cans.id, IDS.can));
    await db.delete(schema.branches).where(inArray(schema.branches.id, [IDS.branchA, IDS.branchB]));
    await db.delete(schema.districts).where(eq(schema.districts.id, IDS.district));
  });

  it('event dengan source id sama hanya tercatat sekali', async () => {
    const sourceId = `idem-${TAG}`;
    await db.transaction(async (tx) => {
      const row = await lockCanRow(tx, IDS.can);
      const before = stateOf(row);
      const after = { ...before, physicalCondition: 'RUSAK' as const };
      for (let i = 0; i < 2; i += 1) {
        await recordCanStateChange(tx, {
          canId: IDS.can,
          before: { ...before, branchId: row.branchId },
          after: { ...after, branchId: row.branchId },
          effectiveAt: new Date('2026-10-05T00:00:00Z'),
          sourceType: CAN_STATE_SOURCE.COLLECTION,
          sourceId,
        });
      }
    });

    const rows = await db
      .select({ id: schema.canStateHistory.id })
      .from(schema.canStateHistory)
      .where(eq(schema.canStateHistory.sourceId, sourceId));
    expect(rows).toHaveLength(1);
  });

  it('dua mutasi bersamaan (ranting vs kondisi) tidak saling menimpa', async () => {
    const branchEventId = randomUUID();
    const conditionEventId = randomUUID();

    await Promise.all([
      db.transaction(async (tx) => {
        const row = await lockCanRow(tx, IDS.can);
        const before = stateOf(row);
        await tx.update(schema.cans)
          .set({ branchId: IDS.branchB })
          .where(eq(schema.cans.id, IDS.can));
        await recordCanStateChange(tx, {
          canId: IDS.can,
          before: { ...before, branchId: row.branchId },
          after: { ...before, branchId: IDS.branchB },
          effectiveAt: new Date('2026-10-10T00:00:00Z'),
          sourceType: CAN_STATE_SOURCE.ADMIN_UPDATE,
          sourceId: branchEventId,
        });
      }),
      db.transaction(async (tx) => {
        const row = await lockCanRow(tx, IDS.can);
        const before = stateOf(row);
        await tx.update(schema.cans)
          .set({ physicalCondition: 'HILANG', condition: 'HILANG' })
          .where(eq(schema.cans.id, IDS.can));
        await recordCanStateChange(tx, {
          canId: IDS.can,
          before: { ...before, branchId: row.branchId },
          after: { ...before, physicalCondition: 'HILANG', branchId: row.branchId },
          effectiveAt: new Date('2026-10-11T00:00:00Z'),
          sourceType: CAN_STATE_SOURCE.ADMIN_UPDATE,
          sourceId: conditionEventId,
        });
      }),
    ]);

    const can = await db.query.cans.findFirst({ where: eq(schema.cans.id, IDS.can) });
    expect(can?.branchId).toBe(IDS.branchB);
    expect(can?.physicalCondition).toBe('HILANG');
    expect(can?.condition).toBe('HILANG');

    const events = await db
      .select({ sourceId: schema.canStateHistory.sourceId })
      .from(schema.canStateHistory)
      .where(inArray(schema.canStateHistory.sourceId, [branchEventId, conditionEventId]));
    expect(events.map((event) => event.sourceId).sort()).toEqual(
      [branchEventId, conditionEventId].sort(),
    );
  });

  it('append event baru mengalokasikan can_version monotonik', async () => {
    await db.transaction(async (tx) => {
      await appendCanStateEvent(tx, {
        canId: IDS.can,
        lifecycleStatus: 'NON_AKTIF',
        effectiveAt: new Date('2026-10-12T00:00:00Z'),
        sourceType: CAN_STATE_SOURCE.CONDITION_PROPOSAL,
        sourceId: `mono-${TAG}`,
      });
    });

    const versions = await db
      .select({ version: schema.canStateHistory.canVersion })
      .from(schema.canStateHistory)
      .where(eq(schema.canStateHistory.canId, IDS.can));
    const sorted = versions.map((row) => row.version).sort((a, b) => a - b);
    expect(new Set(sorted).size).toBe(sorted.length);
  });
});
