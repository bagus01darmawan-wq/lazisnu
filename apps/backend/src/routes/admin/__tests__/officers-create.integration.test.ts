/**
 * Regresi pembuatan petugas (POST /v1/admin/officers).
 *
 * Kasus nyata di staging: ranting punya kode ...-0002 dan ...-0003 karena
 * petugas ...-0001 pernah dihapus. Pola lama memakai `count(*) + 1` → kembali
 * menghasilkan ...-0003 → unique constraint `officers.employee_code` → simpan
 * selalu gagal dengan pesan "Kode petugas sudah terdaftar. Silakan coba simpan
 * kembali." yang mustahil diikuti.
 */
import { randomUUID } from 'crypto';
import { eq, inArray, or } from 'drizzle-orm';
import { getApp, closeApp } from '../../__tests__/helpers/app-helper';
import { db } from '../../../config/database';
import * as schema from '../../../database/schema';

const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
const BRANCH_CODE = `EK${TAG}`;

const IDS = {
  district: randomUUID(),
  branch: randomUUID(),
  adminUser: randomUUID(),
  officerUser1: randomUUID(),
  officerUser2: randomUUID(),
  officer1: randomUUID(),
  officer2: randomUUID(),
};

let token = '';

describe('Pembuatan petugas baru — kode otomatis', () => {
  beforeAll(async () => {
    const app = await getApp();

    await db.insert(schema.districts).values({
      id: IDS.district,
      code: `EKD${TAG}`,
      name: 'Kecamatan Kode Petugas',
      regionCode: '33',
    });

    await db.insert(schema.branches).values({
      id: IDS.branch,
      districtId: IDS.district,
      code: BRANCH_CODE,
      name: 'Ranting Kode Petugas',
    });

    await db.insert(schema.users).values([
      {
        id: IDS.adminUser,
        email: `ek.admin.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Admin Kode Petugas',
        phone: `6287101${TAG}`,
        role: 'ADMIN_KECAMATAN',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
      {
        id: IDS.officerUser1,
        email: `ek.petugas2.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Petugas Dua',
        phone: `6287201${TAG}`,
        role: 'PETUGAS',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
      {
        id: IDS.officerUser2,
        email: `ek.petugas3.${TAG}@example.test`,
        passwordHash: 'x',
        fullName: 'Petugas Tiga',
        phone: `6287202${TAG}`,
        role: 'PETUGAS',
        districtId: IDS.district,
        branchId: IDS.branch,
      },
    ]);

    // Celah nomor: 0001 tidak ada (pernah dihapus), hanya 0002 dan 0003.
    await db.insert(schema.officers).values([
      {
        id: IDS.officer1,
        userId: IDS.officerUser1,
        employeeCode: `${BRANCH_CODE}-0002`,
        fullName: 'Petugas Dua',
        phone: `6287201${TAG}`,
        districtId: IDS.district,
        branchId: IDS.branch,
        isActive: true,
      },
      {
        id: IDS.officer2,
        userId: IDS.officerUser2,
        employeeCode: `${BRANCH_CODE}-0003`,
        fullName: 'Petugas Tiga',
        phone: `6287202${TAG}`,
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
    // Log audit ditulis atas nama admin yang menekan simpan, jadi user admin
    // ikut harus dibersihkan sebelum baris users dihapus.
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

  it('melanjutkan nomor terakhir dan tidak mengulang kode yang sudah ada', async () => {
    const app = await getApp();

    const first = await app.inject({
      method: 'POST',
      url: '/v1/admin/officers',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        full_name: 'Petugas Baru Satu',
        phone: `6287301${TAG}`,
        branch_id: IDS.branch,
      },
    });

    expect(first.statusCode).toBe(201);
    expect(first.json().data.employee_code).toBe(`${BRANCH_CODE}-0004`);

    // Penambahan berikutnya harus lanjut ke 0005 — inilah yang dulu gagal
    // berulang karena kode dihitung ulang dari jumlah petugas.
    const second = await app.inject({
      method: 'POST',
      url: '/v1/admin/officers',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        full_name: 'Petugas Baru Dua',
        phone: `6287302${TAG}`,
        branch_id: IDS.branch,
      },
    });

    expect(second.statusCode).toBe(201);
    expect(second.json().data.employee_code).toBe(`${BRANCH_CODE}-0005`);
  });

  it('tetap memberi pesan yang jelas saat nomor HP duplikat', async () => {
    const app = await getApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/officers',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        full_name: 'Petugas Nomor Kembar',
        phone: `6287201${TAG}`,
        branch_id: IDS.branch,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('DUPLICATE_ERROR');
    expect(response.json().error.message).toContain('Nomor HP sudah terdaftar');
  });

  it('mengubah nomor HP petugas ikut menyinkronkan users.phone', async () => {
    // Nomor HP adalah kunci login password (users.phone) sekaligus target OTP
    // (officers.phone). Sebelumnya PUT /officers hanya memperbarui tabel
    // officers, membuat login password memakai nomor lama selamanya.
    const app = await getApp();
    const phoneBaru = `6287309${TAG}`;

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/officers/${IDS.officer1}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { phone: phoneBaru },
    });

    expect(res.statusCode).toBe(200);

    const officer = await db.query.officers.findFirst({
      where: eq(schema.officers.id, IDS.officer1),
    });
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, IDS.officerUser1),
    });
    expect(officer?.phone).toBe(phoneBaru);
    expect(user?.phone).toBe(phoneBaru);
  });
});
