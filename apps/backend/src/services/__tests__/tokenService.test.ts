/**
 * Unit test tokenService — 5 skenario wajib (04-A7).
 *
 * Redis menggunakan ioredis-mock secara otomatis
 * karena REDIS_URL tidak diset di .env.test.
 */
import {
  generateJti,
  storeDeviceSession,
  validateDeviceSession,
  revokeDeviceSession,
  revokeAllUserSessions,
} from '../tokenService';
import { getRedis } from '../../config/redis';

const TEST_USER = 'user-test-001';
const TEST_TTL = 365 * 24 * 60 * 60; // 365 hari

describe('tokenService — per-device session (04-A7)', () => {
  afterEach(async () => {
    // Bersihkan Redis mock setelah setiap test
    const redis = getRedis();
    if (redis) await redis.flushall();
  });

  // ─── Skenario 1 ───
  it('1. Login device baru — key Redis ada dengan jti dan TTL ~365 hari', async () => {
    const deviceId = 'device-abc';
    const jti = generateJti();

    await storeDeviceSession(TEST_USER, deviceId, jti, TEST_TTL);

    const redis = getRedis();
    const storedJti = await redis.get(`refresh:${TEST_USER}:${deviceId}`);
    expect(storedJti).toBe(jti);

    const ttl = await redis.ttl(`refresh:${TEST_USER}:${deviceId}`);
    // TTL harus sekitar 365 hari (31,536,000 detik), toleransi 5 detik
    expect(ttl).toBeGreaterThan(TEST_TTL - 5);
    expect(ttl).toBeLessThanOrEqual(TEST_TTL);
  });

  // ─── Skenario 2 ───
  it('2. Login ulang device sama — key tertimpa, jti lama invalid, jumlah key tetap 1', async () => {
    const deviceId = 'device-xyz';
    const jtiLama = generateJti();
    const jtiBaru = generateJti();

    // Login pertama
    await storeDeviceSession(TEST_USER, deviceId, jtiLama, TEST_TTL);

    // Login kedua (device sama)
    await storeDeviceSession(TEST_USER, deviceId, jtiBaru, TEST_TTL);

    const redis = getRedis();

    // Key hanya 1 untuk user+device ini
    const storedJti = await redis.get(`refresh:${TEST_USER}:${deviceId}`);
    expect(storedJti).toBe(jtiBaru);

    // jti lama harus invalid
    const validLama = await validateDeviceSession(TEST_USER, deviceId, jtiLama);
    expect(validLama).toBe(false);

    // jti baru harus valid
    const validBaru = await validateDeviceSession(TEST_USER, deviceId, jtiBaru);
    expect(validBaru).toBe(true);

    // Registry hanya berisi 1 device
    const devices = await redis.smembers(`refresh:devices:${TEST_USER}`);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toBe(deviceId);
  });

  // ─── Skenario 3 ───
  it('3. Rotasi refresh — value key = jti baru setelah rotasi', async () => {
    const deviceId = 'device-rotasi';
    const jtiAwal = generateJti();
    const jtiRotasi = generateJti();

    // Login awal
    await storeDeviceSession(TEST_USER, deviceId, jtiAwal, TEST_TTL);
    
    // Validasi jti awal
    const validAwal = await validateDeviceSession(TEST_USER, deviceId, jtiAwal);
    expect(validAwal).toBe(true);

    // Rotasi (simulasikan refresh token)
    await storeDeviceSession(TEST_USER, deviceId, jtiRotasi, TEST_TTL);

    // jti awal tidak valid lagi
    const validLama = await validateDeviceSession(TEST_USER, deviceId, jtiAwal);
    expect(validLama).toBe(false);

    // jti rotasi valid
    const validRotasi = await validateDeviceSession(TEST_USER, deviceId, jtiRotasi);
    expect(validRotasi).toBe(true);

    const redis = getRedis();
    const storedJti = await redis.get(`refresh:${TEST_USER}:${deviceId}`);
    expect(storedJti).toBe(jtiRotasi);
  });

  // ─── Skenario 4 ───
  it('4. Revoke 1 sesi — refresh sesi itu invalid, device lain tetap hidup', async () => {
    const deviceA = 'device-alpha';
    const deviceB = 'device-beta';
    const jtiA = generateJti();
    const jtiB = generateJti();
    const userMultiDevice = 'user-multi';

    // Login di 2 device berbeda
    await storeDeviceSession(userMultiDevice, deviceA, jtiA, TEST_TTL);
    await storeDeviceSession(userMultiDevice, deviceB, jtiB, TEST_TTL);

    // Verifikasi kedua device valid
    expect(await validateDeviceSession(userMultiDevice, deviceA, jtiA)).toBe(true);
    expect(await validateDeviceSession(userMultiDevice, deviceB, jtiB)).toBe(true);

    // Revoke device A
    await revokeDeviceSession(userMultiDevice, deviceA);

    // Device A invalid
    expect(await validateDeviceSession(userMultiDevice, deviceA, jtiA)).toBe(false);

    // Device B tetap valid
    expect(await validateDeviceSession(userMultiDevice, deviceB, jtiB)).toBe(true);

    // Registry: device A hilang, device B tetap
    const redis = getRedis();
    const devices = await redis.smembers(`refresh:devices:${userMultiDevice}`);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toBe(deviceB);
  });

  // ─── Skenario 5 ───
  it('5. Revoke-all — semua device mati, kecuali current (exceptDeviceId)', async () => {
    const deviceA = 'device-alpha';
    const deviceB = 'device-beta';
    const deviceC = 'device-charlie';
    const jtiA = generateJti();
    const jtiB = generateJti();
    const jtiC = generateJti();
    const userRevokeAll = 'user-revokeall';

    // Login di 3 device
    await storeDeviceSession(userRevokeAll, deviceA, jtiA, TEST_TTL);
    await storeDeviceSession(userRevokeAll, deviceB, jtiB, TEST_TTL);
    await storeDeviceSession(userRevokeAll, deviceC, jtiC, TEST_TTL);

    // Verifikasi semua valid
    expect(await validateDeviceSession(userRevokeAll, deviceA, jtiA)).toBe(true);
    expect(await validateDeviceSession(userRevokeAll, deviceB, jtiB)).toBe(true);
    expect(await validateDeviceSession(userRevokeAll, deviceC, jtiC)).toBe(true);

    // Revoke semua kecuali device B (current)
    const revoked = await revokeAllUserSessions(userRevokeAll, deviceB);

    expect(revoked).toHaveLength(2);
    expect(revoked).toContain(deviceA);
    expect(revoked).toContain(deviceC);
    expect(revoked).not.toContain(deviceB);

    // Device A & C invalid
    expect(await validateDeviceSession(userRevokeAll, deviceA, jtiA)).toBe(false);
    expect(await validateDeviceSession(userRevokeAll, deviceC, jtiC)).toBe(false);

    // Device B tetap valid
    expect(await validateDeviceSession(userRevokeAll, deviceB, jtiB)).toBe(true);

    // Registry hanya berisi device B
    const redis = getRedis();
    const devices = await redis.smembers(`refresh:devices:${userRevokeAll}`);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toBe(deviceB);
  });
});
