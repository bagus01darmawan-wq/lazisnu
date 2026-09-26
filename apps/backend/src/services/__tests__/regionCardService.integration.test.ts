/**
 * Test integrasi untuk regionCardService (layer kartu wilayah).
 *
 * Menguji aturan yang disepakati saat desain:
 *   - MWC/kecamatan -> layer kartu RANTING.
 *   - Admin ranting -> layer kartu DUKUH, dengan fallback ke kartu ranting
 *     bila rantingnya tidak punya record Dukuh sama sekali.
 *   - Petugas yang belum ter-mapping ke Dukuh TIDAK dipaksa ke Dukuh mana pun,
 *     dan dilaporkan di level respons, bukan ditempel ke kartu tertentu.
 */
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { getCanRegionCards, getAssignmentRegionCards } from '../regionCardService';

const IDS = {
  district: randomUUID(),
  branchWithDukuh: randomUUID(),
  branchNoDukuh: randomUUID(),
  dukuhA: randomUUID(),
  userMapped: randomUUID(),
  userUnmapped: randomUUID(),
  userFallback: randomUUID(),
  officerMapped: randomUUID(),
  officerUnmapped: randomUUID(),
  officerFallback: randomUUID(),
  canInDukuh: randomUUID(),
  canInBranchNoDukuh: randomUUID(),
};

// Prefix unik supaya tidak bentrok dengan sisa data test lain di DB ini.
const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();

const MWC = {
  id: randomUUID(),
  role: 'ADMIN_KECAMATAN',
  districtId: IDS.district,
  branchId: null,
} as any;

const rantingCtx = (branchId: string) =>
  ({ id: randomUUID(), role: 'ADMIN_RANTING', districtId: null, branchId } as any);

describe('regionCardService', () => {
  beforeAll(async () => {
    await db.insert(schema.districts).values({
      id: IDS.district,
      code: `FKD${TAG}`,
      name: 'Kabupaten Fixture Kartu',
      regionCode: '33',
    });

    await db.insert(schema.branches).values([
      {
        id: IDS.branchWithDukuh,
        districtId: IDS.district,
        code: `FBA${TAG}`,
        name: 'Ranting Punya Dukuh',
      },
      {
        id: IDS.branchNoDukuh,
        districtId: IDS.district,
        code: `FBB${TAG}`,
        name: 'Ranting Tanpa Dukuh',
      },
    ]);

    await db.insert(schema.dukuhs).values({
      id: IDS.dukuhA,
      branchId: IDS.branchWithDukuh,
      name: 'Dukuh Alpha',
    });

    // officers.userId menunjuk users, jadi tiap officer butuh baris user dulu.
    await db.insert(schema.users).values([
      {
        id: IDS.userMapped,
        email: `fx1.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Petugas Terpetakan',
        phone: `6281101${TAG}`,
        role: 'PETUGAS',
        districtId: IDS.district,
        branchId: IDS.branchWithDukuh,
      },
      {
        id: IDS.userUnmapped,
        email: `fx2.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Petugas Belum Terpetakan',
        phone: `6281102${TAG}`,
        role: 'PETUGAS',
        districtId: IDS.district,
        branchId: IDS.branchWithDukuh,
      },
      {
        id: IDS.userFallback,
        email: `fx3.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Petugas Ranting Polos',
        phone: `6281103${TAG}`,
        role: 'PETUGAS',
        districtId: IDS.district,
        branchId: IDS.branchNoDukuh,
      },
    ]);

    await db.insert(schema.officers).values([
      {
        id: IDS.officerMapped,
        userId: IDS.userMapped,
        employeeCode: `FX1${TAG}`,
        fullName: 'Petugas Terpetakan',
        phone: `6281101${TAG}`,
        districtId: IDS.district,
        branchId: IDS.branchWithDukuh,
        dukuhId: IDS.dukuhA,
        assignedZone: 'krajan',
        isActive: true,
      },
      {
        id: IDS.officerUnmapped,
        userId: IDS.userUnmapped,
        employeeCode: `FX2${TAG}`,
        fullName: 'Petugas Belum Terpetakan',
        phone: `6281102${TAG}`,
        districtId: IDS.district,
        branchId: IDS.branchWithDukuh,
        dukuhId: null,
        assignedZone: 'kajen',
        isActive: true,
      },
      {
        id: IDS.officerFallback,
        userId: IDS.userFallback,
        employeeCode: `FX3${TAG}`,
        fullName: 'Petugas Ranting Polos',
        phone: `6281103${TAG}`,
        districtId: IDS.district,
        branchId: IDS.branchNoDukuh,
        dukuhId: null,
        assignedZone: null,
        isActive: true,
      },
    ]);

    await db.insert(schema.cans).values([
      {
        id: IDS.canInDukuh,
        branchId: IDS.branchWithDukuh,
        dukuhId: IDS.dukuhA,
        rt: '001',
        rw: '001',
        ownerName: 'Warga Alpha',
        ownerWhatsapp: `6282201${TAG}`,
        isActive: true,
      },
      {
        id: IDS.canInBranchNoDukuh,
        branchId: IDS.branchNoDukuh,
        dukuhId: null,
        rt: '002',
        rw: '002',
        ownerName: 'Warga Beta',
        ownerWhatsapp: `6282202${TAG}`,
        isActive: true,
      },
    ]);
  });

  afterAll(async () => {
    await db
      .delete(schema.cans)
      .where(inArray(schema.cans.id, [IDS.canInDukuh, IDS.canInBranchNoDukuh]));
    await db
      .delete(schema.officers)
      .where(
        inArray(schema.officers.id, [
          IDS.officerMapped,
          IDS.officerUnmapped,
          IDS.officerFallback,
        ])
      );
    await db
      .delete(schema.users)
      .where(inArray(schema.users.id, [IDS.userMapped, IDS.userUnmapped, IDS.userFallback]));
    await db.delete(schema.dukuhs).where(eq(schema.dukuhs.id, IDS.dukuhA));
    await db
      .delete(schema.branches)
      .where(inArray(schema.branches.id, [IDS.branchWithDukuh, IDS.branchNoDukuh]));
    await db.delete(schema.districts).where(eq(schema.districts.id, IDS.district));
  });

  it('MWC melihat satu kartu per ranting, bukan per dukuh', async () => {
    const res = await getCanRegionCards(MWC, { year: '2026', month: '9' });

    expect(res.scope).toBe('branch');
    // Hanya 2 ranting di district fixture ini, meski ada 1 dukuh di antaranya.
    expect(res.regions).toHaveLength(2);
    expect(res.regions.every((r) => r.kind === 'branch')).toBe(true);

    const withDukuh = res.regions.find((r) => r.id === IDS.branchWithDukuh)!;
    expect(withDukuh.total).toBe(1);
    expect(withDukuh.nonActive).toBe(0);
    expect(withDukuh.officerCount).toBe(2);
    expect(withDukuh.activeOfficerCount).toBe(2);
    // Scope branch: semua petugas sudah tercakup filter ranting.
    expect(res.unmappedOfficerCount).toBe(0);
  });

  it('admin ranting melihat layer DUKUH', async () => {
    const res = await getCanRegionCards(rantingCtx(IDS.branchWithDukuh), {
      year: '2026',
      month: '9',
    });

    expect(res.scope).toBe('dukuh');
    expect(res.regions).toHaveLength(1);
    const card = res.regions[0];
    expect(card.kind).toBe('dukuh');
    expect(card.id).toBe(IDS.dukuhA);
    expect(card.branchId).toBe(IDS.branchWithDukuh);
    expect(card.total).toBe(1);
    expect(card.isFallback).toBe(false);
  });

  it('petugas tanpa dukuh dilaporkan di level respons, tidak dipaksa ke kartu', async () => {
    const res = await getCanRegionCards(rantingCtx(IDS.branchWithDukuh), {
      year: '2026',
      month: '9',
    });

    expect(res.unmappedOfficerCount).toBe(1);
    const card = res.regions[0];
    // Hanya petugas yang benar-benar ter-mapping yang jadi anggota kartu.
    expect(card.officers).toHaveLength(1);
    expect(card.officers[0].id).toBe(IDS.officerMapped);
    expect(card.unmappedOfficerCount).toBe(0);
  });

  it('ranting tanpa record dukuh dapat fallback: kartu ranting tunggal', async () => {
    const res = await getCanRegionCards(rantingCtx(IDS.branchNoDukuh), {
      year: '2026',
      month: '9',
    });

    // Halaman tidak boleh kosong.
    expect(res.regions).toHaveLength(1);
    expect(res.regions[0].kind).toBe('branch');
    expect(res.regions[0].isFallback).toBe(true);
    expect(res.regions[0].id).toBe(IDS.branchNoDukuh);
    expect(res.regions[0].total).toBe(1);
    expect(res.regions[0].officers).toHaveLength(1);
  });

  it('kartu penugasan menampilkan nama petugas di wilayahnya', async () => {
    const res = await getAssignmentRegionCards(MWC, { year: '2026', month: '9' });

    const card = res.regions.find((r) => r.id === IDS.branchWithDukuh)!;
    expect(card.officers).toHaveLength(2);
    expect(card.officers.map((o) => o.name).sort()).toEqual([
      'Petugas Belum Terpetakan',
      'Petugas Terpetakan',
    ]);
    // Nama pada kartu penugasan berasal dari officers.full_name, bukan dari
    // parsing assigned_zone (yang isinya hanya krajan/kajen).
    expect(card.officers.every((o) => o.employeeCode.startsWith('FX'))).toBe(true);
  });

  it('periode menentukan apa yang dihitung, dan tanpa periode kartu tetap terbentuk', async () => {
    const withPeriod = await getCanRegionCards(MWC, { year: '2026', month: '9' });
    const withoutPeriod = await getCanRegionCards(MWC);

    expect(withPeriod.period).toEqual({ year: 2026, month: 9 });
    expect(withoutPeriod.period).toBeNull();
    expect(withoutPeriod.regions).toHaveLength(2);
  });
});
