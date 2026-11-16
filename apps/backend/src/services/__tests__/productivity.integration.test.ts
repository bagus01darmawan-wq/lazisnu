/**
 * Test integrasi productivityService.
 *
 * Mengunci definisi metrik produktivitas PPK per jenis tugas:
 * - Penjemputan memakai tugas PICKUP dan setoran terbaru saja.
 * - Kunjungan memakai tugas VISIT dan hasil verifikasi terbaru per kaleng-periode.
 * - Setoran VISIT ISI tidak tercampur ke angka penjemputan.
 * - Reaktivasi: proposal APPROVED → AKTIF periode.
 *   (Arus "baru disebar"/"ditarik" dihapus 2026-11-13 — bukan bagian kartu.)
 *
 * Tanggal fixture eksplisit (Agu/Sep 2026) agar tidak tergantung tanggal
 * jalan test.
 */
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import {
  getOfficerProductivity,
  getReactivatedCount,
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
  canVisitIsi: randomUUID(),
  canVisitEmpty: randomUUID(),
  canVisitReturned: randomUUID(),
  canVisitFailed: randomUUID(),
  canVisitOnly: randomUUID(),
  asg1: randomUUID(),
  asg2: randomUUID(),
  asg3: randomUUID(),
  asgVisitIsi: randomUUID(),
  asgVisitEmpty: randomUUID(),
  asgVisitReturned: randomUUID(),
  asgVisitFailed: randomUUID(),
  asgVisitOnly: randomUUID(),
  col1: randomUUID(),
  col2: randomUUID(),
  colVisitIsi: randomUUID(),
  visitIsi: randomUUID(),
  visitEmpty: randomUUID(),
  visitReturned: randomUUID(),
  visitFailed: randomUUID(),
  visitOnly: randomUUID(),
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
        fullName: 'PPK Kunjungan Saja', phone: `6281302${TAG}`, role: 'PETUGAS',
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
        fullName: 'PPK Kunjungan Saja', phone: `6281302${TAG}`,
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
      {
        id: IDS.canVisitIsi, branchId: IDS.branch, ownerName: 'Warga Kunjungan Isi',
        ownerWhatsapp: `6282306${TAG}`, condition: 'NON_AKTIF', isActive: false,
        createdAt: AUG(8), updatedAt: SEP(11),
      },
      {
        id: IDS.canVisitEmpty, branchId: IDS.branch, ownerName: 'Warga Kunjungan Kosong',
        ownerWhatsapp: `6282307${TAG}`, condition: 'NON_AKTIF', isActive: false,
        createdAt: AUG(9), updatedAt: SEP(11),
      },
      {
        id: IDS.canVisitReturned, branchId: IDS.branch, ownerName: 'Warga Kunjungan Kembali',
        ownerWhatsapp: `6282308${TAG}`, condition: 'NON_AKTIF', isActive: false,
        createdAt: AUG(10), updatedAt: SEP(11),
      },
      {
        id: IDS.canVisitFailed, branchId: IDS.branch, ownerName: 'Warga Tak Terkunjungi',
        ownerWhatsapp: `6282309${TAG}`, condition: 'NON_AKTIF', isActive: false,
        createdAt: AUG(11), updatedAt: SEP(11),
      },
      {
        id: IDS.canVisitOnly, branchId: IDS.branch, ownerName: 'Warga Kunjungan Saja',
        ownerWhatsapp: `6282310${TAG}`, condition: 'NON_AKTIF', isActive: false,
        createdAt: AUG(12), updatedAt: SEP(11),
      },
    ]);
    await db.insert(schema.assignments).values([
      { id: IDS.asg1, canId: IDS.canFilled, officerId: IDS.officer1, periodYear: 2026, periodMonth: 9, kind: 'PICKUP', status: 'COMPLETED' },
      { id: IDS.asg2, canId: IDS.canEmpty, officerId: IDS.officer1, periodYear: 2026, periodMonth: 9, kind: 'PICKUP', status: 'COMPLETED' },
      { id: IDS.asg3, canId: IDS.canMissed, officerId: IDS.officer1, periodYear: 2026, periodMonth: 9, kind: 'PICKUP', status: 'UNCOLLECTED' },
      { id: IDS.asgVisitIsi, canId: IDS.canVisitIsi, officerId: IDS.officer1, periodYear: 2026, periodMonth: 9, kind: 'VISIT', status: 'COMPLETED' },
      { id: IDS.asgVisitEmpty, canId: IDS.canVisitEmpty, officerId: IDS.officer1, periodYear: 2026, periodMonth: 9, kind: 'VISIT', status: 'COMPLETED' },
      { id: IDS.asgVisitReturned, canId: IDS.canVisitReturned, officerId: IDS.officer1, periodYear: 2026, periodMonth: 9, kind: 'VISIT', status: 'COMPLETED' },
      { id: IDS.asgVisitFailed, canId: IDS.canVisitFailed, officerId: IDS.officer1, periodYear: 2026, periodMonth: 9, kind: 'VISIT', status: 'UNCOLLECTED' },
      { id: IDS.asgVisitOnly, canId: IDS.canVisitOnly, officerId: IDS.officer2, periodYear: 2026, periodMonth: 9, kind: 'VISIT', status: 'COMPLETED' },
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
      {
        id: IDS.colVisitIsi, assignmentId: IDS.asgVisitIsi, canId: IDS.canVisitIsi, officerId: IDS.officer1,
        nominal: BigInt(75000), collectedAt: SEP(11), syncStatus: 'COMPLETED', submitSequence: 1,
      },
    ]);
    await db.insert(schema.canVisits).values([
      {
        id: IDS.visitIsi, canId: IDS.canVisitIsi, officerId: IDS.officer1,
        periodYear: 2026, periodMonth: 9, purpose: 'VERIFIKASI', outcome: 'ISI', visitedAt: SEP(11),
      },
      {
        id: IDS.visitEmpty, canId: IDS.canVisitEmpty, officerId: IDS.officer1,
        periodYear: 2026, periodMonth: 9, purpose: 'VERIFIKASI', outcome: 'KOSONG', visitedAt: SEP(11),
      },
      {
        id: IDS.visitReturned, canId: IDS.canVisitReturned, officerId: IDS.officer1,
        periodYear: 2026, periodMonth: 9, purpose: 'VERIFIKASI', outcome: 'DIKEMBALIKAN', visitedAt: SEP(11),
      },
      {
        id: IDS.visitFailed, canId: IDS.canVisitFailed, officerId: IDS.officer1,
        periodYear: 2026, periodMonth: 9, purpose: 'VERIFIKASI', outcome: 'TIDAK_DIKUNJUNGI', visitedAt: SEP(11),
      },
      {
        id: IDS.visitOnly, canId: IDS.canVisitOnly, officerId: IDS.officer2,
        periodYear: 2026, periodMonth: 9, purpose: 'VERIFIKASI', outcome: 'KOSONG', visitedAt: SEP(11),
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

  test('tabel per-PPK memisahkan Penjemputan dan Kunjungan termasuk PPK tanpa penjemputan', async () => {
    const rows = await getOfficerProductivity(SCOPE, 2026, [9]);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.officer_id === IDS.officer1)).toMatchObject({
      full_name: 'PPK Rajin',
      pickup: { assigned: 3, collected: 2, filled: 1, empty: 1, failed: 1 },
      visit: { assigned: 4, visited: 3, isi: 1, empty: 1, returned: 1, failed: 1 },
    });
    expect(rows.find((row) => row.officer_id === IDS.officer2)).toMatchObject({
      full_name: 'PPK Kunjungan Saja',
      pickup: { assigned: 0, collected: 0, filled: 0, empty: 0, failed: 0 },
      visit: { assigned: 1, visited: 1, isi: 0, empty: 1, returned: 0, failed: 0 },
    });
  });

  test('reaktivasi: proposal APPROVED → AKTIF pada periode', async () => {
    await expect(getReactivatedCount(SCOPE, 2026, [9])).resolves.toBe(1);
  });

  test('periode lain tidak ikut terhitung', async () => {
    const rows = await getOfficerProductivity(SCOPE, 2026, [8]);
    expect(rows).toHaveLength(0);
  });
});
