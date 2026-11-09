/**
 * Test integrasi work queue halaman Penugasan.
 *
 * Mengunci aturan yang membuat angka di tab Kelola bisa dipercaya:
 *   - `unassignedAssignableCans` sama dengan total `unassignedCans` grup;
 *   - kaleng NON_AKTIF / DIKEMBALIKAN tidak masuk antrean;
 *   - scope dukuh mengembalikan grup berisi `canIds` agar bisa di-assign subset;
 *   - kaleng yang sudah disetor lewat tugas VISIT tidak muncul lagi pada periode
 *     yang sama (tetap muncul di periode berikutnya);
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
  officer2User: randomUUID(),
  officer: randomUUID(),
  officer2: randomUUID(),
  canAktif: randomUUID(),
  canRusak: randomUUID(),
  canHilang: randomUUID(),
  canNonAktif: randomUUID(),
  canDikembalikan: randomUUID(),
  canAssigned: randomUUID(),
  canTransferred: randomUUID(),
  assignment: randomUUID(),
  assignmentTransferredOld: randomUUID(),
  assignmentTransferredNew: randomUUID(),
  // Fixture terpisah di ranting kedua: menguji setoran lewat tugas VISIT tanpa
  // mengubah angka-angka yang sudah dikunci tes lain di ranting utama.
  dukuhCollected: randomUUID(),
  canSudahSetor: randomUUID(),
  canBelumSetor: randomUUID(),
  canSetorPending: randomUUID(),
  assignmentVisit: randomUUID(),
  assignmentVisitPending: randomUUID(),
  collectionCompleted: randomUUID(),
  collectionPending: randomUUID(),
};

const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
const PERIOD = { year: 2026, month: 10 };

const rantingAdmin = {
  userId: randomUUID(),
  role: 'ADMIN_RANTING',
  districtId: IDS.district,
  branchId: IDS.branch,
} as any;

// ADMIN_KECAMATAN boleh membaca ranting kedua yang masih satu kecamatan.
const kecamatanAdmin = {
  userId: randomUUID(),
  role: 'ADMIN_KECAMATAN',
  districtId: IDS.district,
  branchId: null,
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
      {
        id: IDS.officer2User,
        email: `wq.officer2.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Petugas Transfer',
        phone: `6283303${TAG}`,
        role: 'PETUGAS',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
    ]);

    await db.insert(schema.officers).values([
      {
        id: IDS.officer,
        userId: IDS.officerUser,
        employeeCode: `WQ${TAG}`,
        fullName: 'Petugas Work Queue',
        phone: `6283302${TAG}`,
        districtId: IDS.district,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        isActive: true,
      },
      {
        id: IDS.officer2,
        userId: IDS.officer2User,
        employeeCode: `WR${TAG}`,
        fullName: 'Petugas Transfer',
        phone: `6283303${TAG}`,
        districtId: IDS.district,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        isActive: true,
      },
    ]);

    await db.insert(schema.cans).values([
      {
        id: IDS.canAktif,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        qrCode: `QWQAKTIF${TAG}`,
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
        qrCode: `QWQRUSAK${TAG}`,
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
        qrCode: `QWQHILANG${TAG}`,
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
      {
        id: IDS.canTransferred,
        branchId: IDS.branch,
        dukuhId: IDS.dukuh,
        ownerName: 'Warga Pernah Transfer',
        ownerWhatsapp: `6284407${TAG}`,
        rt: '004',
        rw: '001',
        condition: 'AKTIF',
        isActive: true,
      },
    ]);

    await db.insert(schema.assignments).values([
      {
        id: IDS.assignment,
        canId: IDS.canAssigned,
        officerId: IDS.officer,
        periodYear: PERIOD.year,
        periodMonth: PERIOD.month,
        status: 'COMPLETED',
      },
      // Satu kaleng, dua baris pada periode yang sama — kondisi yang sah
      // dihasilkan endpoint transfer: baris lama REASSIGNED, baris baru ACTIVE.
      {
        id: IDS.assignmentTransferredOld,
        canId: IDS.canTransferred,
        officerId: IDS.officer,
        periodYear: PERIOD.year,
        periodMonth: PERIOD.month,
        status: 'REASSIGNED',
      },
      {
        id: IDS.assignmentTransferredNew,
        canId: IDS.canTransferred,
        officerId: IDS.officer2,
        periodYear: PERIOD.year,
        periodMonth: PERIOD.month,
        status: 'ACTIVE',
      },
    ]);

    // Kasus nyata 8 November 2026: kaleng NON_AKTIF dikunjungi (VISIT),
    // dinyatakan ISI, nominal 20.000 tersimpan, kondisi berubah jadi RUSAK.
    // Tidak ada baris assignment PICKUP yang pernah dibuat untuk periode itu.
    await db.insert(schema.dukuhs).values({
      id: IDS.dukuhCollected,
      branchId: IDS.otherBranch,
      name: 'Dukuh Sudah Setor',
    });

    await db.insert(schema.cans).values([
      {
        id: IDS.canSudahSetor,
        branchId: IDS.otherBranch,
        dukuhId: IDS.dukuhCollected,
        qrCode: `QWQSETOR${TAG}`,
        ownerName: 'Warga Sudah Disetor',
        ownerWhatsapp: `6284408${TAG}`,
        rt: '001',
        rw: '001',
        condition: 'RUSAK',
        isActive: true,
      },
      {
        id: IDS.canBelumSetor,
        branchId: IDS.otherBranch,
        dukuhId: IDS.dukuhCollected,
        qrCode: `QWQBELUM${TAG}`,
        ownerName: 'Warga Belum Disetor',
        ownerWhatsapp: `6284409${TAG}`,
        rt: '001',
        rw: '001',
        condition: 'RUSAK',
        isActive: true,
      },
      {
        id: IDS.canSetorPending,
        branchId: IDS.otherBranch,
        dukuhId: IDS.dukuhCollected,
        qrCode: `QWQPENDING${TAG}`,
        ownerName: 'Warga Setor Pending',
        ownerWhatsapp: `6284410${TAG}`,
        rt: '002',
        rw: '001',
        condition: 'RUSAK',
        isActive: true,
      },
    ]);

    await db.insert(schema.assignments).values([
      {
        id: IDS.assignmentVisit,
        canId: IDS.canSudahSetor,
        officerId: IDS.officer,
        periodYear: PERIOD.year,
        periodMonth: PERIOD.month,
        kind: 'VISIT',
        status: 'COMPLETED',
      },
      {
        // Sengaja VISIT (bukan PICKUP) agar satu-satunya pembeda dengan kaleng
        // di atas adalah sync_status setorannya: PENDING belum dianggap sah.
        id: IDS.assignmentVisitPending,
        canId: IDS.canSetorPending,
        officerId: IDS.officer,
        periodYear: PERIOD.year,
        periodMonth: PERIOD.month,
        kind: 'VISIT',
        status: 'ACTIVE',
      },
    ]);

    await db.insert(schema.collections).values([
      {
        id: IDS.collectionCompleted,
        assignmentId: IDS.assignmentVisit,
        canId: IDS.canSudahSetor,
        officerId: IDS.officer,
        nominal: BigInt(20000),
        // SENGAJA di luar bulan periode: setoran lewat jendela toleransi bisa
        // bertanggal bulan berikutnya. Periode harus dibaca dari assignment,
        // bukan dari collected_at, atau kaleng ini tetap muncul di antrean.
        collectedAt: new Date('2026-11-08T14:18:32.961Z'),
        submittedAt: new Date('2026-11-08T14:18:36.410Z'),
        syncedAt: new Date('2026-11-08T14:18:36.410Z'),
        syncStatus: 'COMPLETED',
        serverTimestamp: new Date('2026-11-08T14:18:36.410Z'),
        submitSequence: 1,
      },
      {
        id: IDS.collectionPending,
        assignmentId: IDS.assignmentVisitPending,
        canId: IDS.canSetorPending,
        officerId: IDS.officer,
        nominal: BigInt(15000),
        collectedAt: new Date('2026-10-20T03:00:00.000Z'),
        syncStatus: 'PENDING',
        submitSequence: 1,
      },
    ]);
  });

  afterAll(async () => {
    await db
      .delete(schema.collections)
      .where(inArray(schema.collections.id, [IDS.collectionCompleted, IDS.collectionPending]));
    await db
      .delete(schema.assignments)
      .where(
        inArray(schema.assignments.id, [
          IDS.assignment,
          IDS.assignmentTransferredOld,
          IDS.assignmentTransferredNew,
          IDS.assignmentVisit,
          IDS.assignmentVisitPending,
        ])
      );
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
          IDS.canTransferred,
          IDS.canSudahSetor,
          IDS.canBelumSetor,
          IDS.canSetorPending,
        ])
      );
    await db.delete(schema.officers).where(inArray(schema.officers.id, [IDS.officer, IDS.officer2]));
    await db
      .delete(schema.users)
      .where(inArray(schema.users.id, [IDS.user, IDS.officerUser, IDS.officer2User]));
    await db
      .delete(schema.dukuhs)
      .where(inArray(schema.dukuhs.id, [IDS.dukuh, IDS.dukuhCollected]));
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
    expect(result.summary.totalCans).toBe(7);
    expect(result.summary.assignableCans).toBe(5);
    expect(result.summary.assignedAssignableCans).toBe(2);
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
    expect(result.groups[0].totalCans).toBe(5);
    expect(result.groups[0].assignedCans).toBe(2);
  });

  it('kaleng yang pernah di-transfer tidak dihitung ganda oleh LEFT JOIN', async () => {
    const result = await getAssignmentWorkQueue(rantingAdmin, {
      year: String(PERIOD.year),
      month: String(PERIOD.month),
      branch_id: IDS.branch,
    });

    // canTransferred punya dua baris assignment pada periode yang sama
    // (REASSIGNED + ACTIVE, persis hasil endpoint transfer), tetap dihitung
    // satu kaleng: kalau count(*) dipakai, angka di bawah akan menggelembung
    // dan kalengnya muncul phantom sebagai "belum ditugaskan".
    expect(result.summary.assignableCans).toBe(5);
    expect(result.summary.assignedAssignableCans).toBe(2);
    expect(result.summary.unassignedAssignableCans).toBe(3);

    const dukuhGroup = result.groups.find((group) => group.kind === 'dukuh');
    expect(dukuhGroup?.totalCans).toBe(5);
    expect(dukuhGroup?.assignedCans).toBe(2);
    expect(dukuhGroup?.unassignedCans).toBe(3);
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

  it('scope dukuh mengirim detail kaleng yang sepadan dengan canIds', async () => {
    const result = await getAssignmentWorkQueue(rantingAdmin, {
      year: String(PERIOD.year),
      month: String(PERIOD.month),
      dukuh_id: IDS.dukuh,
    });

    const rtGroups = result.groups.filter((group) => group.kind === 'rt');
    expect(rtGroups).toHaveLength(2);
    for (const group of rtGroups) {
      expect(group.cans).toBeDefined();
      expect(group.cans).toHaveLength(group.unassignedCans);
      expect(group.cans!.map((can) => can.id)).toEqual(group.canIds);
    }

    const details = result.groups.flatMap((group) => group.cans ?? []);
    expect(details.map((can) => can.id).sort()).toEqual(
      [IDS.canAktif, IDS.canRusak, IDS.canHilang].sort()
    );
    expect(details.find((can) => can.id === IDS.canAktif)).toMatchObject({
      qrCode: `QWQAKTIF${TAG}`,
      ownerName: 'Warga Aktif',
      rt: '001',
      rw: '001',
      condition: 'AKTIF',
    });
    // Kaleng yang sudah punya assignment, non-aktif, atau DIKEMBALIKAN tidak
    // boleh ikut tampil di rincian.
    expect(details.some((can) => can.id === IDS.canAssigned)).toBe(false);
    expect(details.some((can) => can.id === IDS.canTransferred)).toBe(false);
    expect(details.some((can) => can.id === IDS.canNonAktif)).toBe(false);
    expect(details.some((can) => can.id === IDS.canDikembalikan)).toBe(false);
  });

  it('scope ranting tidak membawa detail cans', async () => {
    const result = await getAssignmentWorkQueue(rantingAdmin, {
      year: String(PERIOD.year),
      month: String(PERIOD.month),
      branch_id: IDS.branch,
    });

    expect(result.groups.every((group) => group.cans === undefined)).toBe(true);
  });

  it('petugas aktif membawa beban kerja periode berjalan', async () => {
    const result = await getAssignmentWorkQueue(rantingAdmin, {
      year: String(PERIOD.year),
      month: String(PERIOD.month),
      branch_id: IDS.branch,
    });

    expect(result.officers).toHaveLength(2);
    const officer = result.officers.find((row) => row.id === IDS.officer);
    // Baris REASSIGNED milik petugas ini tidak dihitung sebagai beban.
    expect(officer?.assignedCount).toBe(1);
    expect(officer?.completedCount).toBe(1);
    expect(officer?.dukuhName).toBe('Dukuh Queue');
    const officer2 = result.officers.find((row) => row.id === IDS.officer2);
    expect(officer2?.assignedCount).toBe(1);
  });

  it('kaleng bersetoran VISIT tidak masuk antrean scope dukuh pada periode itu', async () => {
    const result = await getAssignmentWorkQueue(kecamatanAdmin, {
      year: String(PERIOD.year),
      month: String(PERIOD.month),
      dukuh_id: IDS.dukuhCollected,
    });

    // collected_at fixture bertanggal 8 November, sedangkan periode tugasnya
    // Oktober. Kalau filter memakai tanggal setoran, kaleng ini akan lolos
    // kembali dan tes ini gagal.
    const listed = result.groups.flatMap((group) => group.canIds ?? []);
    expect(listed).not.toContain(IDS.canSudahSetor);
    // Setoran PENDING belum sah, jadi kalengnya tetap boleh ditugaskan.
    expect(listed.sort()).toEqual([IDS.canBelumSetor, IDS.canSetorPending].sort());

    expect(result.summary.unassignedAssignableCans).toBe(2);
    expect(result.groups.reduce((sum, group) => sum + group.unassignedCans, 0)).toBe(
      result.summary.unassignedAssignableCans
    );
    for (const group of result.groups) {
      expect(group.cans).toHaveLength(group.unassignedCans);
      expect(group.cans!.map((can) => can.id)).toEqual(group.canIds);
    }
  });

  it('scope ranting ikut menghitung setoran VISIT sebagai sudah ditugaskan', async () => {
    const result = await getAssignmentWorkQueue(kecamatanAdmin, {
      year: String(PERIOD.year),
      month: String(PERIOD.month),
      branch_id: IDS.otherBranch,
    });

    expect(result.summary.totalCans).toBe(3);
    expect(result.summary.assignableCans).toBe(3);
    expect(result.summary.assignedAssignableCans).toBe(1);
    expect(result.summary.unassignedAssignableCans).toBe(2);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].totalCans).toBe(3);
    expect(result.groups[0].assignedCans).toBe(1);
    expect(result.groups[0].unassignedCans).toBe(2);
    expect(result.groups.reduce((sum, group) => sum + group.unassignedCans, 0)).toBe(
      result.summary.unassignedAssignableCans
    );
  });

  it('setoran periode Oktober tidak menghilangkan kaleng di periode November', async () => {
    const result = await getAssignmentWorkQueue(kecamatanAdmin, {
      year: String(PERIOD.year),
      month: '11',
      dukuh_id: IDS.dukuhCollected,
    });

    const listed = result.groups.flatMap((group) => group.canIds ?? []);
    expect(listed.sort()).toEqual(
      [IDS.canSudahSetor, IDS.canBelumSetor, IDS.canSetorPending].sort()
    );
    expect(result.summary.unassignedAssignableCans).toBe(3);
  });

  it('ADMIN_RANTING dipaksa memakai ranting dari JWT', async () => {
    const result = await getAssignmentWorkQueue(rantingAdmin, {
      year: String(PERIOD.year),
      month: String(PERIOD.month),
      branch_id: IDS.otherBranch,
    });

    expect(result.region.branchId).toBe(IDS.branch);
    expect(result.summary.totalCans).toBe(7);
  });
});
