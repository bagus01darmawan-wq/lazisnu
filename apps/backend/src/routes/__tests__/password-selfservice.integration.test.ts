/**
 * Integrasi kata sandi mandiri petugas (GET /auth/password/status,
 * POST /auth/password) plus efek pelonggaran minLength sandi login.
 *
 * Alur: petugas dibuat server dengan hash acak (password_set_at null) →
 * set sandi via OTP (diseed langsung lewat otpService.generateAndStore agar
 * tidak menyentuh gateway WhatsApp) → login jalur password dengan sandi
 * pendek pun harus berhasil, dan sesi perangkat lain tercabut.
 */
import { randomUUID } from 'crypto';
import { and, eq, or } from 'drizzle-orm';
import { getApp, closeApp } from './helpers/app-helper';
import { db } from '../../config/database';
import { otpService } from '../../services/otp';
import * as schema from '../../database/schema';

const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();

const IDS = {
  district: randomUUID(),
  branch: randomUUID(),
  user: randomUUID(),
  officer: randomUUID(),
};

// Nomor uji digits murni (13 digit): guard varian nomor membandingkan string
// DB dengan varian digits-only, jadi TAG hex tak boleh ikut masuk nomor.
const PHONE = `6287401${Math.floor(100000 + Math.random() * 900000)}`;
const DEVICE_A = 'device-A';
const DEVICE_B = 'device-B';

let token = '';

describe('Kata sandi mandiri petugas', () => {
  beforeAll(async () => {
    const app = await getApp();

    await db.insert(schema.districts).values({
      id: IDS.district,
      code: `PW${TAG}`,
      name: 'Kecamatan Kata Sandi',
      regionCode: '33',
    });

    await db.insert(schema.branches).values({
      id: IDS.branch,
      districtId: IDS.district,
      code: `EWB${TAG}`,
      name: 'Ranting Kata Sandi',
    });

    await db.insert(schema.users).values({
      id: IDS.user,
      email: `pw.petugas.${TAG}@example.test`,
      passwordHash: 'x', // hash acak placeholder ala pembuatan petugas
      fullName: 'Petugas Kata Sandi',
      phone: PHONE,
      role: 'PETUGAS',
      districtId: IDS.district,
      branchId: IDS.branch,
    });

    await db.insert(schema.officers).values({
      id: IDS.officer,
      userId: IDS.user,
      employeeCode: `PW${TAG}`,
      fullName: 'Petugas Kata Sandi',
      phone: PHONE,
      districtId: IDS.district,
      branchId: IDS.branch,
      isActive: true,
    });

    // Dua sesi aktif: perangkat A (yang akan memakai fitur) dan B (yang lain).
    await db.insert(schema.userSessions).values([
      {
        userId: IDS.user,
        jti: `jti-a-${TAG}`,
        deviceId: DEVICE_A,
        deviceLabel: 'HP Petugas',
      },
      {
        userId: IDS.user,
        jti: `jti-b-${TAG}`,
        deviceId: DEVICE_B,
        deviceLabel: 'HP Cadangan',
      },
    ]);

    token = app.jwt.sign({
      userId: IDS.user,
      role: 'PETUGAS',
      officerId: IDS.officer,
      branchId: IDS.branch,
      districtId: IDS.district,
      did: DEVICE_A,
    });
  });

  afterAll(async () => {
    await db
      .delete(schema.activityLogs)
      .where(or(eq(schema.activityLogs.userId, IDS.user), eq(schema.activityLogs.officerId, IDS.officer)));
    await db.delete(schema.userSessions).where(eq(schema.userSessions.userId, IDS.user));
    await db.delete(schema.officers).where(eq(schema.officers.id, IDS.officer));
    await db.delete(schema.users).where(eq(schema.users.id, IDS.user));
    await db.delete(schema.branches).where(eq(schema.branches.id, IDS.branch));
    await db.delete(schema.districts).where(eq(schema.districts.id, IDS.district));
    await closeApp();
  });

  it('awalnya password_set=false (hash masih acak buatan server)', async () => {
    const app = await getApp();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/password/status',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ password_set: false, password_set_at: null });
  });

  it('menolak OTP salah tanpa mengubah sandi', async () => {
    const app = await getApp();
    await otpService.generateAndStore(PHONE);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/password',
      headers: { authorization: `Bearer ${token}` },
      payload: { phone: PHONE, otp: '000000', new_password: 'abc' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_OTP');

    const user = await db.query.users.findFirst({ where: eq(schema.users.id, IDS.user) });
    expect(user?.passwordSetAt).toBeNull();
  });

  it('membuat sandi pendek via OTP, mencabut sesi perangkat lain, lalu sandi itu bisa dipakai login', async () => {
    const app = await getApp();
    const { otp } = await otpService.generateAndStore(PHONE);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/password',
      headers: { authorization: `Bearer ${token}` },
      payload: { phone: PHONE, otp, new_password: 'abc' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.password_set_at).toBeTruthy();

    // Sesi perangkat lain dicabut; sesi perangkat saat ini tetap.
    const sessions = await db
      .select()
      .from(schema.userSessions)
      .where(eq(schema.userSessions.userId, IDS.user));
    const byDevice = Object.fromEntries(sessions.map(s => [s.deviceId, s.revokedAt]));
    expect(byDevice[DEVICE_A]).toBeNull();
    expect(byDevice[DEVICE_B]).not.toBeNull();

    // Status kini password_set=true.
    const status = await app.inject({
      method: 'GET',
      url: '/v1/auth/password/status',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(status.json().data.password_set).toBe(true);

    // OTP sudah terkonsumsi — dipakai ulang harus gagal.
    const replay = await app.inject({
      method: 'POST',
      url: '/v1/auth/password',
      headers: { authorization: `Bearer ${token}` },
      payload: { phone: PHONE, otp, new_password: 'lain' },
    });
    expect(replay.statusCode).toBe(401);

    // Login jalur password dengan sandi pendek (regresi minLength lama = 6).
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { identifier: PHONE, password: 'abc' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().data.access_token).toBeTruthy();
  });

  it('OTP yang diminta dengan varian format nomor (08xx) tetap cocok — regresi kunci Redis', async () => {
    // Kasus nyata 2026-10-27: aplikasi menyimpan nomor persis seperti yang
    // diketik petugas saat login (mis. 08xx), sedangkan users.phone 62xx.
    // Verifikasi harus memakai string yang sama dengan request-otp.
    const app = await getApp();
    const phoneVarian = `0${PHONE.slice(2)}`;
    const { otp } = await otpService.generateAndStore(phoneVarian);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/password',
      headers: { authorization: `Bearer ${token}` },
      payload: { phone: phoneVarian, otp, new_password: 'sandi-varian' },
    });

    expect(res.statusCode).toBe(200);
  });

  it('nomor yang diubah admin (hanya officers.phone) tetap diterima — regresi users.phone menyimpang', async () => {
    // Kasus nyata 2026-10-27: PUT /officers memperbarui officers.phone saja,
    // users.phone tetap nomor lama. Guard harus mengacu ke officers.phone —
    // target pengiriman OTP — bukan users.phone.
    const app = await getApp();
    const phoneBaru = `6288500${Math.floor(100000 + Math.random() * 900000)}`;
    await db
      .update(schema.officers)
      .set({ phone: phoneBaru })
      .where(eq(schema.officers.id, IDS.officer));

    const { otp } = await otpService.generateAndStore(phoneBaru);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/password',
      headers: { authorization: `Bearer ${token}` },
      payload: { phone: phoneBaru, otp, new_password: 'sandi-nomor-baru' },
    });

    expect(res.statusCode).toBe(200);
  });

  it('login password tetap berhasil saat users.phone basi dan officers.phone sudah baru', async () => {
    // Kasus nyata 2026-10-27 (akun PPK hara): nomor petugas diedit sebelum
    // sinkronisasi ada → officers.phone nomor baru (OTP jalan), users.phone
    // nomor lama (login password gagal "email/nomor hp atau password salah").
    // Login harus mencocokkan lewat officers.phone juga.
    const app = await getApp();
    const phoneBaru = `6288600${Math.floor(100000 + Math.random() * 900000)}`;

    // Siapkan kondisi: officers.phone = nomor baru, users.phone = nomor lama.
    await db
      .update(schema.officers)
      .set({ phone: phoneBaru })
      .where(eq(schema.officers.id, IDS.officer));

    const { otp } = await otpService.generateAndStore(phoneBaru);
    const setRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/password',
      headers: { authorization: `Bearer ${token}` },
      payload: { phone: phoneBaru, otp, new_password: 'sandi-hara' },
    });
    expect(setRes.statusCode).toBe(200);

    const userRow = await db.query.users.findFirst({ where: eq(schema.users.id, IDS.user) });
    expect(userRow?.phone).not.toBe(phoneBaru);

    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { identifier: phoneBaru, password: 'sandi-hara' },
    });

    expect(login.statusCode).toBe(200);
    expect(login.json().data.access_token).toBeTruthy();
  });

  it('menolak nomor HP milik akun lain', async () => {
    const app = await getApp();
    await otpService.generateAndStore('628999999999');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/password',
      headers: { authorization: `Bearer ${token}` },
      payload: { phone: '628999999999', otp: '123456', new_password: 'x' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('PHONE_MISMATCH');
  });
});
