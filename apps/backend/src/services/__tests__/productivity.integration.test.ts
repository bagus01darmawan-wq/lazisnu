/**
 * Test integrasi productivityService.
 *
 * Mengunci definisi metrik produktivitas PPK:
 * - Tabel per-PPK: assigned (tugas periode), collected (COMPLETED terbaru),
 *   filled (nominal > 0), uncollected. Petugas tanpa tugas tidak tampil.
 * - Arus: new_cans (created_at periode), withdrawn (→ DIKEMBALIKAN periode),
 *   reactivated (proposal APPROVED → AKTIF periode).
 *
 * Tanggal fixture eksplisit (Agu/Sep 2026) agar tidak tergantung tanggal
 * jalan test, kecuali yang memang dihitung sebagai "baru".
 */
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import {
  getNewCansCount,
  getOfficerProductivity,
  getReactivatedCount,
  getWithdrawnCount,
} from '../productivityService';

const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
const IDS = {
  district: randomUUID(),
  branch: randomUUID(),
  user1: randomUUID(),
  user2: randomUUID(),
  officer1: randomUUID(),
  officer2: randomUUID(),
  canFilled: randomUUID(),
  canEmpty: randomUUID(),
  canMissed: randomUUID(),
  canWithdrawn: randomUUID(),
  canNew: randomUUID(),
  asg1: randomUUID(),
  asg2: randomUUID(),
  asg3: randomUUID(),
  col1: randomUUID(),
  col2: randomUUID(),
  proposal: randomUUID(),
};

const SCOPE = { districtId: IDS.district };
const SEP = (day: number) => new Date(2026, 8, day, 10, 0, 0);
const AUG = (day: number) => new Date(2026, 7, day, 10, 0, 0);

describe('productivityService', () => {
  beforeAll(async () => {
    await db.insert(schema.districts).values({
      id: IDS.district,
      code: `FPD${TAG}`,
      name: 'Kabupaten Fixture Produktif',
      regionCode: '33',
    });
    await db.insert(schema.branches).values({
      id: IDS.branch,
      districtId: IDS.district,
      code: `FPB${TAG}`,
      name: 'Ranting Produktif',
    });
    await db.insert(schema.users).values([
      {
        id: IDS.user1, email: `fp1.${TAG}@example.test`, passwordHash: 'x',
        fullName: 'PPK Rajin', phone: `6281301${TAG}`, role: 'PETUGAS',
        districtId: IDS.district, branchId: IDS.branch,
      },
      {
        id: IDS.user2, email: `fp2.${TAG}@example.test`, passwordHash: 'x',
        fullName: 'PPK Tanpa Tugas', phone: `6281302${TAG}`, role: 'PETUGAS',
        districtId: IDS.district, branchId: IDS.branch,
      },
    ]);
    await db.insert(schema.officers).values([
      {
        id: IDS.officer1, userId: IDS.user1, employeeCode: `FP1${TAG}`,
        fullName: 'PPK Rajin', phone: `6281301${TAG}`,
        districtId: IDS.district, branchId: IDS.branch, isActive: true,
      },
      {
        id: IDS.officer2, userId: IDS.user2, employeeCode: `FP2${TAG}`,
        fullName: 'PPK Tanpa Tugas', phone: `6281302${TAG}`,
        districtId: IDS.district, branchId: IDS.branch, isActive: true,
      },
    ]);
    await db.insert(schema.cans).values([
      {
        id: IDS.canFilled, branchId: IDS.branch, ownerName: 'Warga Isi',
        ownerWhatsapp: `6282301${TAG}`, condition: 'AKTIF', isActive: true,
        createdAt: AUG(5), updatedAt: SEP(11),
      },
      {
        id: IDS.canEmpty, branchId: IDS.branch, ownerName: 'Warga Kosong',
        ownerWhatsapp: `6282302${TAG}`, condition: 'AKTIF', isActive: true,
        createdAt: AUG(6), updatedAt: SEP(11),
      },
      {
        id: IDS.canMissed, branchId: IDS.branch, ownerName: 'Warga Terlewat',
        ownerWhatsapp: `6282303${TAG}`, condition: 'AKTIF', isActive: true,
        createdAt: AUG(7), updatedAt: SEP(11),
      },
      {
        id: IDS.canWithdrawn, branchId: IDS.branch, ownerName: 'Warga Tarik',
        ownerWhatsapp: `6282304${TAG}`, condition: 'DIKEMBALIKAN', isActive: false,
        createdAt: AUG(1), updatedAt: SEP(12),
      },
      {
        id: IDS.canNew, branchId: IDS.branch, ownerName: 'Warga Baru',
        ownerWhatsapp: `6282305${TAG}`, condition: 'AKTIF', isActive: true,
        createdAt: SEP(10), updatedAt: SEP(10),
      },
    ]);
    await db.insert(schema.assignments).values([
      { id: IDS.asg1, canId: IDS.canFilled, officerId: IDS.officer1, periodYear: 2026, periodMonth: 9, status: 'COMPLETED' },
      { id: IDS.asg2, canId: IDS.canEmpty, officerId: IDS.officer1, periodYear: 2026, periodMonth: 9, status: 'COMPLETED' },
      { id: IDS.asg3, canId: IDS.canMissed, officerId: IDS.officer1, periodYear: 2026, periodMonth: 9, status: 'UNCOLLECTED' },
    ]);
    await db.insert(schema.collections).values([
      {
        id: IDS.col1, assignmentId: IDS.asg1, canId: IDS.canFilled, officerId: IDS.officer1,
        nominal: BigInt(50000), collectedAt: SEP(11), syncStatus: 'COMPLETED', submitSequence: 1,
      },
      {
        id: IDS.col2, assignmentId: IDS.asg2, canId: IDS.canEmpty, officerId: IDS.officer1,
        nominal: BigInt(0), collectedAt: SEP(11), syncStatus: 'COMPLETED', submitSequence: 1,
      },
    ]);
    await db.insert(schema.canConditionProposals).values({
      id: IDS.proposal, canId: IDS.canMissed,
      fromCondition: 'NON_AKTIF', toCondition: 'AKTIF',
      triggerSource: 'MANUAL', reasonCode: 'OWNER_REQUEST',
      status: 'APPROVED', approvedAt: SEP(15), createdAt: SEP(14),
    });
  });

  afterAll(async () => {
    // Collections TIDAK dihapus: migrasi 0004_immutable_rule.sql melarang
    // DELETE (DO INSTEAD NOTHING) di semua environment — koreksi finansial
    // hanya via resubmit. Karena collections menahan FK ke assignments, cans,
    // officers, users, branches, districts, seluruh rantai fixture dibiarkan
    // (terisolasi per-run via UUID + TAG, semua assertion ter-scope distrik).
    // Yang bisa dibersihkan hanya proposals (tak ada rule di tabel itu).
    await db.delete(schema.canConditionProposals).where(eq(schema.canConditionProposals.id, IDS.proposal));
  });

  test('tabel per-PPK: angka O1 benar, O2 tanpa tugas tidak tampil', async () => {
    const rows = await getOfficerProductivity(SCOPE, 2026, [9]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      officer_id: IDS.officer1,
      full_name: 'PPK Rajin',
      assigned: 3,
      collected: 2,
      filled: 1,
      uncollected: 1,
    });
  });

  test('arus: baru=1, ditarik=1, aktif-kembali=1', async () => {
    await expect(getNewCansCount(SCOPE, 2026, [9])).resolves.toBe(1);
    await expect(getWithdrawnCount(SCOPE, 2026, [9])).resolves.toBe(1);
    await expect(getReactivatedCount(SCOPE, 2026, [9])).resolves.toBe(1);
  });

  test('periode lain tidak ikut terhitung', async () => {
    // Empat kaleng fixture dibuat Agustus → hanya mereka di bulan 8.
    await expect(getNewCansCount(SCOPE, 2026, [8])).resolves.toBe(4);
    await expect(getWithdrawnCount(SCOPE, 2026, [10])).resolves.toBe(0);
    const rows = await getOfficerProductivity(SCOPE, 2026, [8]);
    expect(rows).toHaveLength(0);
  });
});
