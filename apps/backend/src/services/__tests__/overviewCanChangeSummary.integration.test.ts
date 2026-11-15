/**
 * Integrasi rekap perubahan kaleng per periode tugas.
 *
 * Mengunci:
 * - atribusi periode tugas (Oktober dikerjakan November tetap Oktober),
 * - distinct per kaleng/dimensi/periode + kategori nilai terakhir,
 * - scope pemilik kaleng saat ini (pindah ranting memindahkan rekap lama),
 * - resubmit: event menempel ke koleksi asal, bukan versi terbaru,
 * - kunjungan tanpa assignment memakai period_year/month tersimpan,
 * - kelengkapan: sebelum cutover tidak tersedia, melintasi cutover parsial,
 *   bulan berjalan sementara, dan event tanpa atribusi tidak ditebak.
 */
import { randomUUID } from 'crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { getCanChangeSummary } from '../overviewCanChangeSummary';

const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
const IDS = {
  district: randomUUID(),
  district2: randomUUID(),
  branchA: randomUUID(),
  branchB: randomUUID(),
  branchC: randomUUID(),
  user: randomUUID(),
  officer: randomUUID(),
  can1: randomUUID(),
  can2: randomUUID(),
  can3: randomUUID(),
  can4: randomUUID(),
  canMoved: randomUUID(),
  canCrossDistrict: randomUUID(),
  assignmentCan1Oct: randomUUID(),
  assignmentCan1Nov: randomUUID(),
  assignmentCan4Oct: randomUUID(),
  collectionCan1Oct: randomUUID(),
  collectionCan4Old: randomUUID(),
  collectionCan4Latest: randomUUID(),
  visitCan3Nov: randomUUID(),
};

const at = (iso: string) => new Date(iso);
const NOW = at('2026-11-15T03:00:00Z');

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
  const canIds = [IDS.can1, IDS.can2, IDS.can3, IDS.can4, IDS.canMoved, IDS.canCrossDistrict];
  await withImmutableRulesDisabled(async () => {
    await db.delete(schema.canStateHistory).where(inArray(schema.canStateHistory.canId, canIds));
    await db.delete(schema.collections).where(inArray(schema.collections.canId, canIds));
    await db.delete(schema.canVisits).where(inArray(schema.canVisits.canId, canIds));
    await db.delete(schema.assignments).where(inArray(schema.assignments.canId, canIds));
  });
  await db.delete(schema.canStateHistory).where(inArray(schema.canStateHistory.canId, canIds));
  await db.delete(schema.cans).where(inArray(schema.cans.id, canIds));
  await db.delete(schema.officers).where(eq(schema.officers.id, IDS.officer));
  await db.delete(schema.users).where(eq(schema.users.id, IDS.user));
  await db.delete(schema.branches).where(eq(schema.branches.districtId, IDS.district));
  await db.delete(schema.districts).where(eq(schema.districts.id, IDS.district));
  await db.delete(schema.branches).where(eq(schema.branches.districtId, IDS.district2));
  await db.delete(schema.districts).where(eq(schema.districts.id, IDS.district2));
}

describe('getCanChangeSummary — rekap kaleng unik per periode tugas', () => {
  beforeAll(async () => {
    await cleanup();

    await db.insert(schema.districts).values([
      {
        id: IDS.district,
        code: `CCS${TAG}`,
        name: 'Kecamatan Change Summary',
        regionCode: '33',
      },
      {
        id: IDS.district2,
        code: `CCT${TAG}`,
        name: 'Kecamatan Tujuan Pindah',
        regionCode: '33',
      },
    ]);
    await db.insert(schema.branches).values([
      { id: IDS.branchA, districtId: IDS.district, code: `CSA${TAG}`, name: 'Ranting A' },
      { id: IDS.branchB, districtId: IDS.district, code: `CSB${TAG}`, name: 'Ranting B' },
      { id: IDS.branchC, districtId: IDS.district2, code: `CSC${TAG}`, name: 'Ranting C' },
    ]);
    await db.insert(schema.users).values({
      id: IDS.user,
      email: `change-summary-${TAG.toLowerCase()}@test.local`,
      passwordHash: 'x',
      fullName: 'Petugas Change Summary',
      phone: `08411${TAG}`,
      role: 'PETUGAS',
      districtId: IDS.district,
      branchId: IDS.branchA,
    });
    await db.insert(schema.officers).values({
      id: IDS.officer,
      userId: IDS.user,
      employeeCode: `CS${TAG}`,
      fullName: 'Petugas Change Summary',
      phone: `08412${TAG}`,
      districtId: IDS.district,
      branchId: IDS.branchA,
    });

    await db.insert(schema.cans).values([
      { id: IDS.can1, branchId: IDS.branchA, ownerName: 'Can 1', ownerWhatsapp: `6284101${TAG}` },
      { id: IDS.can2, branchId: IDS.branchA, ownerName: 'Can 2', ownerWhatsapp: `6284102${TAG}` },
      { id: IDS.can3, branchId: IDS.branchB, ownerName: 'Can 3', ownerWhatsapp: `6284103${TAG}` },
      { id: IDS.can4, branchId: IDS.branchA, ownerName: 'Can 4', ownerWhatsapp: `6284104${TAG}` },
      { id: IDS.canMoved, branchId: IDS.branchA, ownerName: 'Can Moved', ownerWhatsapp: `6284105${TAG}` },
      { id: IDS.canCrossDistrict, branchId: IDS.branchA, ownerName: 'Can Cross', ownerWhatsapp: `6284106${TAG}` },
    ]);

    await db.insert(schema.assignments).values([
      {
        id: IDS.assignmentCan1Oct, canId: IDS.can1, officerId: IDS.officer,
        periodYear: 2026, periodMonth: 10, kind: 'PICKUP',
      },
      {
        id: IDS.assignmentCan1Nov, canId: IDS.can1, officerId: IDS.officer,
        periodYear: 2026, periodMonth: 11, kind: 'PICKUP',
      },
      {
        id: IDS.assignmentCan4Oct, canId: IDS.can4, officerId: IDS.officer,
        periodYear: 2026, periodMonth: 10, kind: 'PICKUP',
      },
    ]);

    await db.insert(schema.collections).values([
      {
        id: IDS.collectionCan1Oct,
        assignmentId: IDS.assignmentCan1Oct,
        canId: IDS.can1,
        officerId: IDS.officer,
        nominal: 10000n,
        collectedAt: at('2026-11-05T00:00:00Z'),
        syncStatus: 'COMPLETED',
        submitSequence: 1,
      },
      {
        id: IDS.collectionCan4Old,
        assignmentId: IDS.assignmentCan4Oct,
        canId: IDS.can4,
        officerId: IDS.officer,
        nominal: 5000n,
        collectedAt: at('2026-11-07T00:00:00Z'),
        syncStatus: 'COMPLETED',
        submitSequence: 1,
      },
      {
        // Versi koreksi terbaru. Event kondisi tetap menempel ke koleksi asal.
        id: IDS.collectionCan4Latest,
        assignmentId: IDS.assignmentCan4Oct,
        canId: IDS.can4,
        officerId: IDS.officer,
        nominal: 7000n,
        collectedAt: at('2026-11-07T00:00:00Z'),
        syncStatus: 'COMPLETED',
        submitSequence: 2,
      },
    ]);

    // Kunjungan tanpa assignment: periode tugas tersimpan di can_visits.
    await db.insert(schema.canVisits).values({
      id: IDS.visitCan3Nov,
      canId: IDS.can3,
      officerId: IDS.officer,
      periodYear: 2026,
      periodMonth: 11,
      purpose: 'VERIFIKASI',
      outcome: 'KOSONG',
      visitedAt: at('2026-11-12T00:00:00Z'),
    });

    await db.insert(schema.canStateHistory).values([
      // Anchor/baseline cakupan: 15 September 2026.
      ...([IDS.can1, IDS.can2, IDS.can3, IDS.can4, IDS.canMoved, IDS.canCrossDistrict].map((canId) => ({
        canId,
        lifecycleStatus: 'AKTIF' as const,
        physicalCondition: 'BAIK' as const,
        physicalConditionSource: 'CUTOVER_BASELINE' as const,
        branchId: canId === IDS.can3 ? IDS.branchB : IDS.branchA,
        effectiveAt: at('2026-09-15T00:00:00Z'),
        canVersion: 0,
        sourceType: 'CUTOVER_BASELINE',
        sourceId: canId,
      }))),

      // can1: event koleksi November untuk tugas Oktober → tetap Oktober.
      // Periode sengaja NULL agar jalur fallback source_id/collection berjalan.
      {
        canId: IDS.can1,
        physicalCondition: 'RUSAK',
        physicalConditionSource: 'OBSERVED',
        effectiveAt: at('2026-11-05T00:00:00Z'),
        canVersion: 1,
        sourceType: 'COLLECTION',
        sourceId: IDS.collectionCan1Oct,
        triggerCollectionId: IDS.collectionCan1Oct,
      },
      // Nilai terakhir pada dimensi yang sama (timestamp identik, versi lebih tinggi).
      {
        canId: IDS.can1,
        physicalCondition: 'BAIK',
        physicalConditionSource: 'OBSERVED',
        effectiveAt: at('2026-11-05T00:00:00Z'),
        canVersion: 2,
        sourceType: 'COLLECTION',
        sourceId: `can1-baik-${TAG}`,
        periodYear: 2026,
        periodMonth: 10,
      },
      // Pindah ranting saja: bukan perubahan status/kondisi.
      {
        canId: IDS.can1,
        branchId: IDS.branchA,
        effectiveAt: at('2026-10-10T00:00:00Z'),
        canVersion: 3,
        sourceType: 'ADMIN_UPDATE',
        sourceId: `move-only-${TAG}`,
        periodYear: 2026,
        periodMonth: 10,
      },
      // can1 berubah lagi pada periode tugas November.
      {
        canId: IDS.can1,
        lifecycleStatus: 'NON_AKTIF',
        effectiveAt: at('2026-11-10T00:00:00Z'),
        canVersion: 4,
        sourceType: 'ADMIN_UPDATE',
        sourceId: `can1-nov-${TAG}`,
        periodYear: 2026,
        periodMonth: 11,
      },

      // can2: September (untuk uji bulan tidak berurutan) + dua dimensi Oktober.
      {
        canId: IDS.can2,
        physicalCondition: 'HILANG',
        physicalConditionSource: 'OBSERVED',
        effectiveAt: at('2026-09-20T00:00:00Z'),
        canVersion: 1,
        sourceType: 'COLLECTION',
        sourceId: `can2-sep-${TAG}`,
        periodYear: 2026,
        periodMonth: 9,
      },
      {
        canId: IDS.can2,
        lifecycleStatus: 'NON_AKTIF',
        effectiveAt: at('2026-10-05T00:00:00Z'),
        canVersion: 2,
        sourceType: 'ADMIN_UPDATE',
        sourceId: `can2-status-${TAG}`,
        periodYear: 2026,
        periodMonth: 10,
      },
      {
        canId: IDS.can2,
        physicalCondition: 'RUSAK',
        physicalConditionSource: 'OBSERVED',
        effectiveAt: at('2026-10-06T00:00:00Z'),
        canVersion: 3,
        sourceType: 'COLLECTION',
        sourceId: `can2-rusak-${TAG}`,
        periodYear: 2026,
        periodMonth: 10,
      },

      // can4: event menempel ke koleksi ASAL (submit_sequence 1), bukan versi
      // koreksi terbaru (2). Harus tetap dihitung Oktober.
      {
        canId: IDS.can4,
        physicalCondition: 'RUSAK',
        physicalConditionSource: 'OBSERVED',
        effectiveAt: at('2026-11-07T00:00:00Z'),
        canVersion: 1,
        sourceType: 'COLLECTION',
        sourceId: IDS.collectionCan4Old,
        triggerCollectionId: IDS.collectionCan4Old,
      },

      // can3: kunjungan tanpa assignment → periode dari can_visits (November).
      {
        canId: IDS.can3,
        lifecycleStatus: 'NON_AKTIF',
        effectiveAt: at('2026-11-12T00:00:00Z'),
        canVersion: 1,
        sourceType: 'CAN_VISIT',
        sourceId: IDS.visitCan3Nov,
      },
      // Event manual lama tanpa atribusi: tidak boleh ditebak dari tanggal.
      {
        canId: IDS.can3,
        physicalCondition: 'HILANG',
        physicalConditionSource: 'OBSERVED',
        effectiveAt: at('2026-10-20T00:00:00Z'),
        canVersion: 2,
        sourceType: 'ADMIN_UPDATE',
        sourceId: `can3-unattributed-${TAG}`,
      },

      // canMoved: perubahan Oktober, lalu kaleng dipindah ke ranting B.
      {
        canId: IDS.canMoved,
        physicalCondition: 'HILANG',
        physicalConditionSource: 'OBSERVED',
        effectiveAt: at('2026-10-15T00:00:00Z'),
        canVersion: 1,
        sourceType: 'COLLECTION',
        sourceId: `moved-oct-${TAG}`,
        periodYear: 2026,
        periodMonth: 10,
      },

      // canCrossDistrict: pindah antarkecamatan memindahkan kontribusi rekap.
      {
        canId: IDS.canCrossDistrict,
        physicalCondition: 'RUSAK',
        physicalConditionSource: 'OBSERVED',
        effectiveAt: at('2026-10-16T00:00:00Z'),
        canVersion: 1,
        sourceType: 'COLLECTION',
        sourceId: `cross-oct-${TAG}`,
        periodYear: 2026,
        periodMonth: 10,
      },
    ]);

    // Scope rekap memakai pemilik kaleng SAAT INI.
    await db.update(schema.cans)
      .set({ branchId: IDS.branchB })
      .where(eq(schema.cans.id, IDS.canMoved));
    await db.update(schema.cans)
      .set({ branchId: IDS.branchC })
      .where(eq(schema.cans.id, IDS.canCrossDistrict));
  });

  afterAll(cleanup);

  const summary = (branchId?: string) => getCanChangeSummary(
    branchId ? { districtId: IDS.district, branchId } : { districtId: IDS.district },
    { year: 2026, month: 10, months: [10] },
    NOW,
  );

  it('Oktober: unik per kaleng/dimensi, kategori nilai terakhir, dan scope pemilik saat ini', async () => {
    const result = await summary();

    expect(result.lifecycle.total).toBe(1);
    expect(result.lifecycle.by_category).toEqual({ AKTIF: 0, NON_AKTIF: 1, DIKEMBALIKAN: 0 });
    // can1 BAIK, can2 RUSAK, can4 RUSAK, canMoved HILANG. can3 tanpa atribusi diabaikan.
    expect(result.physical_condition.total).toBe(4);
    expect(result.physical_condition.by_category).toEqual({ BAIK: 1, RUSAK: 2, HILANG: 1 });
    expect(result.periods).toHaveLength(1);
    expect(result.periods[0].period).toBe('2026-10');
    // Ada event tak teratribusi pada scope → kelengkapan parsial.
    expect(result.unattributed_events).toBe(1);
    expect(result.completeness).toBe('partial');
  });

  it('perubahan Oktober yang dikerjakan November tetap masuk Oktober; November tidak', async () => {
    const october = await summary();
    const november = await getCanChangeSummary(
      { districtId: IDS.district },
      { year: 2026, month: 11, months: [11] },
      NOW,
    );

    // can1 (koleksi 5 Nov) + can4 (koleksi 7 Nov) masuk Oktober, bukan November.
    expect(october.lifecycle.total).toBe(1);
    expect(november.lifecycle.by_category.NON_AKTIF).toBe(2); // can1 + can3 (visit tanpa assignment)
    expect(november.physical_condition.total).toBe(0);
  });

  it('scope ranting mengikuti pemilik saat ini, bukan ranting saat event', async () => {
    const branchA = await summary(IDS.branchA);
    const branchB = await summary(IDS.branchB);

    // A: can1 BAIK, can2 RUSAK, can4 RUSAK. canMoved sudah pindah ke B.
    expect(branchA.lifecycle.total).toBe(1);
    expect(branchA.physical_condition.total).toBe(3);
    expect(branchA.physical_condition.by_category).toEqual({ BAIK: 1, RUSAK: 2, HILANG: 0 });
    expect(branchA.completeness).toBe('complete');

    // B: canMoved HILANG; event can3 tanpa atribusi tidak dihitung.
    expect(branchB.lifecycle.total).toBe(0);
    expect(branchB.physical_condition.total).toBe(1);
    expect(branchB.physical_condition.by_category).toEqual({ BAIK: 0, RUSAK: 0, HILANG: 1 });
    expect(branchB.completeness).toBe('partial');
  });

  it('bulan tidak berurutan dijumlahkan per periode, bukan seluruh rentang', async () => {
    const result = await getCanChangeSummary(
      { districtId: IDS.district, branchId: IDS.branchA },
      { year: 2026, month: 11, months: [9, 11] },
      NOW,
    );

    expect(result.periods.map((p) => p.period)).toEqual(['2026-09', '2026-11']);
    expect(result.lifecycle.total).toBe(1); // can1 NON_AKTIF pada November
    expect(result.physical_condition.total).toBe(1); // can2 HILANG pada September
    expect(result.periods[0].completeness).toBe('partial'); // melintasi cutover 15 Sep
    expect(result.periods[1].completeness).toBe('provisional'); // bulan berjalan
  });

  it('kelengkapan membedakan tidak tersedia, parsial, sementara, dan lengkap', async () => {
    const august = await getCanChangeSummary(
      { districtId: IDS.district, branchId: IDS.branchA },
      { year: 2026, month: 8, months: [8] },
      NOW,
    );
    const september = await getCanChangeSummary(
      { districtId: IDS.district, branchId: IDS.branchA },
      { year: 2026, month: 9, months: [9] },
      NOW,
    );
    const november = await getCanChangeSummary(
      { districtId: IDS.district, branchId: IDS.branchA },
      { year: 2026, month: 11, months: [11] },
      NOW,
    );

    expect(august.completeness).toBe('unavailable');
    expect(august.periods[0].completeness).toBe('unavailable');
    expect(august.periods[0].lifecycle.total).toBe(0);
    expect(september.periods[0].completeness).toBe('partial');
    expect(november.periods[0].completeness).toBe('provisional');
  });

  it('perpindahan antarkecamatan memindahkan kontribusi ke kecamatan pemilik baru', async () => {
    const destination = await getCanChangeSummary(
      { districtId: IDS.district2 },
      { year: 2026, month: 10, months: [10] },
      NOW,
    );

    expect(destination.lifecycle.total).toBe(0);
    expect(destination.physical_condition.total).toBe(1);
    expect(destination.physical_condition.by_category).toEqual({ BAIK: 0, RUSAK: 1, HILANG: 0 });
    expect(destination.completeness).toBe('complete');
  });

  it('scope ranting kosong menghasilkan nol tanpa kebocoran scope', async () => {
    const empty = await getCanChangeSummary(
      { districtId: IDS.district, branchId: randomUUID() },
      { year: 2026, month: 10, months: [10] },
      NOW,
    );

    expect(empty.lifecycle.total).toBe(0);
    expect(empty.physical_condition.total).toBe(0);
    expect(empty.periods[0].lifecycle.total).toBe(0);
    expect(empty.periods[0].physical_condition.total).toBe(0);
    expect(empty.coverage_start).toBeNull();
    expect(empty.unattributed_events).toBe(0);
  });
});
