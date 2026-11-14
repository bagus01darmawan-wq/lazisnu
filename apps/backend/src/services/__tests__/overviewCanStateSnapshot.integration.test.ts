/**
 * Snapshot dua kelompok pada akhir periode — integrasi ledger.
 *
 * Mengunci:
 * - replay per dimensi (pindah ranting tidak mengubah kondisi fisik);
 * - event kondisi terlambat (5 Okt) masuk sebelum event pindah ranting (10 Okt);
 * - event sebelum baseline cutover tidak menimpa baseline;
 * - scope ranting memakai branch pada cutoff, bukan branch saat ini;
 * - batas historis setengah terbuka: event tepat 1 Nov tidak masuk snapshot Oktober;
 * - kaleng yang dibuat setelah cutoff tidak dihitung.
 */
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { getCanStateSnapshot } from '../overviewService';

const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
const IDS = {
  district: randomUUID(),
  branchA: randomUUID(),
  branchB: randomUUID(),
  canA: randomUUID(),
  canB: randomUUID(),
  canC: randomUUID(),
};

const at = (iso: string) => new Date(iso);

describe('getCanStateSnapshot — replay periode', () => {
  beforeAll(async () => {
    await db.insert(schema.districts).values({
      id: IDS.district,
      code: `SND${TAG}`,
      name: 'Kecamatan Snapshot',
      regionCode: '33',
    });
    await db.insert(schema.branches).values([
      { id: IDS.branchA, districtId: IDS.district, code: `SNA${TAG}`, name: 'Ranting A' },
      { id: IDS.branchB, districtId: IDS.district, code: `SNB${TAG}`, name: 'Ranting B' },
    ]);
    await db.insert(schema.cans).values([
      {
        id: IDS.canA, branchId: IDS.branchA, ownerName: 'Warga A',
        ownerWhatsapp: `6283101${TAG}`, createdAt: at('2026-09-01T00:00:00Z'),
      },
      {
        id: IDS.canB, branchId: IDS.branchB, ownerName: 'Warga B',
        ownerWhatsapp: `6283102${TAG}`, createdAt: at('2026-09-02T00:00:00Z'),
      },
      {
        id: IDS.canC, branchId: IDS.branchB, ownerName: 'Warga C',
        ownerWhatsapp: `6283103${TAG}`, createdAt: at('2026-11-05T00:00:00Z'),
      },
    ]);

    await db.insert(schema.canStateHistory).values([
      // Baseline cutover: A di ranting A, B di ranting B.
      {
        canId: IDS.canA, lifecycleStatus: 'AKTIF', physicalCondition: 'BAIK',
        physicalConditionSource: 'CUTOVER_BASELINE', branchId: IDS.branchA,
        effectiveAt: at('2026-10-01T00:00:00Z'), canVersion: 0,
        sourceType: 'CUTOVER_BASELINE', sourceId: IDS.canA,
      },
      {
        canId: IDS.canB, lifecycleStatus: 'AKTIF', physicalCondition: 'BAIK',
        physicalConditionSource: 'CUTOVER_BASELINE', branchId: IDS.branchB,
        effectiveAt: at('2026-10-01T00:00:00Z'), canVersion: 0,
        sourceType: 'CUTOVER_BASELINE', sourceId: IDS.canB,
      },
      // Event pindah ranting 10 Okt (hanya branch).
      {
        canId: IDS.canA, branchId: IDS.branchB,
        effectiveAt: at('2026-10-10T00:00:00Z'), canVersion: 2,
        sourceType: 'ADMIN_UPDATE', sourceId: `move-${TAG}`,
      },
      // Event RUSAK terlambat: waktu kejadian 5 Okt, dicatat belakangan.
      {
        canId: IDS.canA, physicalCondition: 'RUSAK', physicalConditionSource: 'OBSERVED',
        effectiveAt: at('2026-10-05T00:00:00Z'), canVersion: 3,
        sourceType: 'COLLECTION', sourceId: `late-${TAG}`,
      },
      // Event sebelum baseline: tidak boleh menimpa baseline terverifikasi.
      {
        canId: IDS.canA, physicalCondition: 'HILANG', physicalConditionSource: 'OBSERVED',
        effectiveAt: at('2026-09-20T00:00:00Z'), canVersion: 5,
        sourceType: 'COLLECTION', sourceId: `pre-${TAG}`,
      },
      // Tepat awal November: TIDAK masuk snapshot Oktober.
      {
        canId: IDS.canA, physicalCondition: 'BAIK', physicalConditionSource: 'OBSERVED',
        effectiveAt: at('2026-11-01T00:00:00Z'), canVersion: 4,
        sourceType: 'COLLECTION', sourceId: `nov-${TAG}`,
      },
      // B menjadi HILANG 20 Okt.
      {
        canId: IDS.canB, physicalCondition: 'HILANG', physicalConditionSource: 'OBSERVED',
        effectiveAt: at('2026-10-20T00:00:00Z'), canVersion: 1,
        sourceType: 'COLLECTION', sourceId: `lost-${TAG}`,
      },
      // C dibuat setelah cutoff: anchor CAN_CREATED dan tidak dihitung Oktober.
      {
        canId: IDS.canC, lifecycleStatus: 'AKTIF', physicalCondition: 'BAIK',
        physicalConditionSource: 'OBSERVED', branchId: IDS.branchB,
        effectiveAt: at('2026-11-05T00:00:00Z'), canVersion: 1,
        sourceType: 'CAN_CREATED', sourceId: IDS.canC,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(schema.cans).where(eq(schema.cans.branchId, IDS.branchA));
    await db.delete(schema.cans).where(eq(schema.cans.branchId, IDS.branchB));
    await db.delete(schema.branches).where(eq(schema.branches.districtId, IDS.district));
    await db.delete(schema.districts).where(eq(schema.districts.id, IDS.district));
  });

  const now = new Date('2026-11-14T03:00:00Z');

  it('Oktober memakai replay per dimensi dan event terlambat', async () => {
    const snapshot = await getCanStateSnapshot(
      { districtId: IDS.district },
      { year: 2026, month: 10, months: [10] },
      now,
    );

    expect(snapshot.history_complete).toBe(true);
    expect(snapshot.status).toEqual({ AKTIF: 2, NON_AKTIF: 0, DIKEMBALIKAN: 0 });
    expect(snapshot.physical_condition).toEqual({ BAIK: 0, RUSAK: 1, HILANG: 1 });
    expect(snapshot.assumption_baik).toBe(0);
    expect(snapshot.legacy_breakdown).toEqual([
      { condition: 'AKTIF', count: 0 },
      { condition: 'NON_AKTIF', count: 0 },
      { condition: 'RUSAK', count: 1 },
      { condition: 'HILANG', count: 1 },
      { condition: 'DIKEMBALIKAN', count: 0 },
    ]);
  });

  it('scope ranting memakai branch pada cutoff, bukan branch saat ini', async () => {
    const branchA = await getCanStateSnapshot(
      { districtId: IDS.district, branchId: IDS.branchA },
      { year: 2026, month: 10, months: [10] },
      now,
    );
    // A sudah pindah ke B pada 10 Okt → tidak lagi di ranting A pada cutoff.
    expect(branchA.status).toEqual({ AKTIF: 0, NON_AKTIF: 0, DIKEMBALIKAN: 0 });

    const branchB = await getCanStateSnapshot(
      { districtId: IDS.district, branchId: IDS.branchB },
      { year: 2026, month: 10, months: [10] },
      now,
    );
    expect(branchB.status.AKTIF).toBe(2);
    expect(branchB.physical_condition).toEqual({ BAIK: 0, RUSAK: 1, HILANG: 1 });
  });

  it('bulan berjalan memakai cutoff now dan memuat event 1 Nov', async () => {
    const snapshot = await getCanStateSnapshot(
      { districtId: IDS.district },
      { year: 2026, month: 11, months: [11] },
      now,
    );

    // A kembali BAIK pada 1 Nov; B tetap HILANG; C (dibuat 5 Nov) ikut.
    expect(snapshot.status).toEqual({ AKTIF: 3, NON_AKTIF: 0, DIKEMBALIKAN: 0 });
    expect(snapshot.physical_condition).toEqual({ BAIK: 2, RUSAK: 0, HILANG: 1 });
  });

  it('riwayat sebelum ledger ditandai tidak lengkap, bukan dipalsukan', async () => {
    const snapshot = await getCanStateSnapshot(
      { districtId: IDS.district },
      { year: 2026, month: 9, months: [9] },
      now,
    );
    expect(snapshot.history_complete).toBe(false);
  });
});
