/**
 * Regresi edit petugas (PUT /v1/admin/officers/:id) — nomor HP.
 *
 * Kasus nyata 2026-10-27: petugas "hara" sudah diganti nomornya, tetapi layar
 * Profil tetap menampilkan nomor lama dan nomor baru tidak bisa dipakai.
 * Sebabnya tiga lapis:
 *   1. `users.phone` (yang tampil di Profil) tidak ikut diperbarui — sudah
 *      ditutup oleh commit 3b68a0a, diuji di sini agar tidak balik lagi.
 *   2. `users.email` dibentuk dari nomor HP saat petugas dibuat, jadi nomor
 *      lama tetap terkunci oleh UNIQUE users.email walau phone sudah berubah.
 *   3. Bentrok nomor di jalur edit dilaporkan sebagai "kesalahan server" (500),
 *      bukan pesan bahwa nomornya sudah dipakai akun lain.
 *
 * Urutan tes di berkas ini disengaja: tes "nomor lama bisa dipakai lagi"
 * bergantung pada tes pertama yang sudah memindahkan nomor petugas A.
 */
import { randomUUID } from 'crypto';
import { eq, inArray, or } from 'drizzle-orm';
import { getApp, closeApp } from '../../__tests__/helpers/app-helper';
import { db } from '../../../config/database';
import * as schema from '../../../database/schema';

const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
const BRANCH_CODE = `EN${TAG}`;

const NOMOR = {
  petugasA: `6287401${TAG}`,
  petugasB: `6287402${TAG}`,
  petugasANew: `6287409${TAG}`,
  petugasBaru: `6287411${TAG}`,
};

const IDS = {
  district: randomUUID(),
  branch: randomUUID(),
  adminUser: randomUUID(),
  userA: randomUUID(),
  userB: randomUUID(),
  officerA: randomUUID(),
  officerB: randomUUID(),
};

let token = '';

describe('Edit nomor HP petugas — sinkronisasi users & pesan bentrok', () => {
  beforeAll(async () => {
    const app = await getApp();

    await db.insert(schema.districts).values({
      id: IDS.district,
      code: `END${TAG}`,
      name: 'Kecamatan Edit Nomor',
      regionCode: '33',
    });

    await db.insert(schema.branches).values({
      id: IDS.branch,
      districtId: IDS.district,
      code: BRANCH_CODE,
      name: 'Ranting Edit Nomor',
    });

    await db.insert(schema.users).values([
      {
        id: IDS.adminUser,
        email: `en.admin.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Admin Edit Nomor',
        phone: `6287400${TAG}`,
        role: 'ADMIN_KECAMATAN',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
      {
        id: IDS.userA,
        // Email sengaja mengikuti pola hasil generate seperti data sungguhan —
        // bukan email bebas — supaya sinkronisasi email ikut teruji.
        email: `${NOMOR.petugasA}@petugas.lazisnu.id`,
        passwordHash: 'x',
        fullName: 'Petugas A',
        phone: NOMOR.petugasA,
        role: 'PETUGAS',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
      {
        id: IDS.userB,
        email: `${NOMOR.petugasB}@petugas.lazisnu.id`,
        passwordHash: 'x',
        fullName: 'Petugas B',
        phone: NOMOR.petugasB,
        role: 'PETUGAS',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
    ]);

    await db.insert(schema.officers).values([
      {
        id: IDS.officerA,
        userId: IDS.userA,
        employeeCode: `${BRANCH_CODE}-0001`,
        fullName: 'Petugas A',
        phone: NOMOR.petugasA,
        districtId: IDS.district,
        branchId: IDS.branch,
        isActive: true,
      },
      {
        id: IDS.officerB,
        userId: IDS.userB,
        employeeCode: `${BRANCH_CODE}-0002`,
        fullName: 'Petugas B',
        phone: NOMOR.petugasB,
        districtId: IDS.district,
        branchId: IDS.branch,
        isActive: true,
      },
    ]);

    token = app.jwt.sign({
      userId: IDS.adminUser,
      role: 'ADMIN_KECAMATAN',
      districtId: IDS.district,
      branchId: IDS.branch,
    });
  });

  afterAll(async () => {
    const remaining = await db
      .select({ id: schema.officers.id, userId: schema.officers.userId })
      .from(schema.officers)
      .where(eq(schema.officers.branchId, IDS.branch));
    const officerIds = remaining.map(row => row.id);
    const userIds = [IDS.adminUser, ...remaining.map(row => row.userId)];

    if (officerIds.length > 0) {
      await db.delete(schema.activityLogs).where(
        or(
          inArray(schema.activityLogs.userId, userIds),
          inArray(schema.activityLogs.officerId, officerIds),
        ),
      );
    }
    await db.delete(schema.officers).where(eq(schema.officers.branchId, IDS.branch));
    await db.delete(schema.users).where(eq(schema.users.branchId, IDS.branch));
    await db.delete(schema.branches).where(eq(schema.branches.id, IDS.branch));
    await db.delete(schema.districts).where(eq(schema.districts.id, IDS.district));
    await closeApp();
  });

  it('mengganti nomor HP ikut memperbarui users.phone dan users.email', async () => {
    const app = await getApp();

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/officers/${IDS.officerA}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { phone: NOMOR.petugasANew },
    });

    expect(res.statusCode).toBe(200);

    const officer = await db.query.officers.findFirst({
      where: eq(schema.officers.id, IDS.officerA),
    });
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, IDS.userA),
    });

    expect(officer?.phone).toBe(NOMOR.petugasANew);
    expect(user?.phone).toBe(NOMOR.petugasANew);
    // Email harus ikut pindah; kalau tidak, nomor lama tetap terkunci UNIQUE.
    expect(user?.email).toBe(`${NOMOR.petugasANew}@petugas.lazisnu.id`);
  });

  it('menolak nomor yang sudah dipakai akun lain dengan pesan jelas, bukan 500', async () => {
    const app = await getApp();

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/officers/${IDS.officerB}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { phone: NOMOR.petugasANew },
    });

    // Sebelum perbaikan: 500 "kesalahan server" — pengguna tidak tahu sebabnya.
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('DUPLICATE');
    expect(res.json().error.message).toContain('Nomor HP sudah dipakai akun lain');

    // Transaksi harus utuh: tidak ada yang berubah setengah jalan.
    const officer = await db.query.officers.findFirst({
      where: eq(schema.officers.id, IDS.officerB),
    });
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, IDS.userB),
    });
    expect(officer?.phone).toBe(NOMOR.petugasB);
    expect(user?.phone).toBe(NOMOR.petugasB);
    expect(user?.email).toBe(`${NOMOR.petugasB}@petugas.lazisnu.id`);
  });

  it('nomor lama bekas petugas bisa dipakai petugas baru setelah diganti', async () => {
    const app = await getApp();

    // NOMOR.petugasA sudah dilepas petugas A pada tes pertama. Sebelum email
    // ikut tersinkron, nomor ini masih "tertahan" users.email lama sehingga
    // pembuatan petugas baru gagal dengan pesan email sudah terdaftar.
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/officers',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        full_name: 'Petugas Pemakai Nomor Lama',
        phone: NOMOR.petugasA,
        branch_id: IDS.branch,
      },
    });

    expect(res.statusCode).toBe(201);
  });

  it('input tidak valid dijawab 400, bukan kesalahan server', async () => {
    const app = await getApp();

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/officers/${IDS.officerB}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { phone: '123' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
