/**
 * Unit test tokenService — model Sesi Permanen Sliding
 * (RENCANA-SESI-PERMANEN-SLIDING-2026-08-26 §4.A/§4.F).
 *
 * Redis menggunakan ioredis-mock secara otomatis
 * karena REDIS_URL tidak diset di .env.test.
 */
import {
  generateJti,
  storeDeviceSession,
  isDeviceRevoked,
  revokeDeviceSession,
  clearDeviceRevocation,
  revokeAllUserSessions,
} from '../tokenService';
import { getRedis } from '../../config/redis';

const TEST_USER = 'user-sliding-001';
const TEST_TTL = 365 * 24 * 60 * 60; // 365 hari

describe('tokenService — sesi permanen sliding', () => {
  afterEach(async () => {
    const redis = getRedis();
    if (redis) await redis.flushall();
  });

  it('1. storeDeviceSession — jti terakhir tercatat informatif dengan TTL', async () => {
    const deviceId = 'device-abc';
    const jti = generateJti();

    await storeDeviceSession(TEST_USER, deviceId, jti, TEST_TTL);

    const redis = getRedis();
    expect(await redis.get(`refresh:${TEST_USER}:${deviceId}`)).toBe(jti);
    const ttl = await redis.ttl(`refresh:${TEST_USER}:${deviceId}`);
    expect(ttl).toBeGreaterThan(TEST_TTL - 5);
    expect(ttl).toBeLessThanOrEqual(TEST_TTL);
  });

  it('2. Device yang belum dicabut TIDAK diblokir (default denylist kosong)', async () => {
    await storeDeviceSession(TEST_USER, 'device-x', generateJti(), TEST_TTL);
    expect(await isDeviceRevoked(TEST_USER, 'device-x')).toBe(false);
  });

  it('3. revokeDeviceSession — denylist aktif, catatan refresh dihapus, keluar dari registry', async () => {
    const deviceId = 'device-revoked';
    await storeDeviceSession(TEST_USER, deviceId, generateJti(), TEST_TTL);

    const denyTtl = 60 * 60; // 1 jam sisa umur token saat dicabut
    await revokeDeviceSession(TEST_USER, deviceId, denyTtl);

    const redis = getRedis();
    expect(await isDeviceRevoked(TEST_USER, deviceId)).toBe(true);

    // Catatan jti terakhir dibersihkan
    expect(await redis.get(`refresh:${TEST_USER}:${deviceId}`)).toBeNull();

    // Denylist self-cleaning: TTL mengikuti sisa umur token (± toleransi 5s)
    const ttl = await redis.ttl(`revoked:${TEST_USER}:${deviceId}`);
    expect(ttl).toBeGreaterThan(denyTtl - 5);
    expect(ttl).toBeLessThanOrEqual(denyTtl);

    // Keluar dari registry perangkat aktif
    const devices = await redis.smembers(`refresh:devices:${TEST_USER}`);
    expect(devices).not.toContain(deviceId);
  });

  it('4. clearDeviceRevocation — login ulang kredensial membuka blokir device sama', async () => {
    const deviceId = 'device-relapse';
    await storeDeviceSession(TEST_USER, deviceId, generateJti(), TEST_TTL);
    await revokeDeviceSession(TEST_USER, deviceId, TEST_TTL);
    expect(await isDeviceRevoked(TEST_USER, deviceId)).toBe(true);

    await clearDeviceRevocation(TEST_USER, deviceId);
    expect(await isDeviceRevoked(TEST_USER, deviceId)).toBe(false);
  });

  it('5. revokeAllUserSessions — semua kecuali current kena denylist', async () => {
    const deviceA = 'device-alpha';
    const deviceB = 'device-beta';
    const deviceC = 'device-charlie';

    await storeDeviceSession(TEST_USER, deviceA, generateJti(), TEST_TTL);
    await storeDeviceSession(TEST_USER, deviceB, generateJti(), TEST_TTL);
    await storeDeviceSession(TEST_USER, deviceC, generateJti(), TEST_TTL);

    const revoked = await revokeAllUserSessions(TEST_USER, deviceB);
    expect(revoked.sort()).toEqual([deviceA, deviceC].sort());

    expect(await isDeviceRevoked(TEST_USER, deviceA)).toBe(true);
    expect(await isDeviceRevoked(TEST_USER, deviceC)).toBe(true);
    expect(await isDeviceRevoked(TEST_USER, deviceB)).toBe(false);
  });

  it('6. Fail-open: Redis tidak tersedia → tidak throw dan device dianggap tidak diblokir', async () => {
    const redisModule = require('../../config/redis');
    const spy = jest.spyOn(redisModule, 'getRedis').mockReturnValue(null);

    try {
      await expect(
        storeDeviceSession(TEST_USER, 'd1', generateJti(), TEST_TTL),
      ).resolves.toBeUndefined();
      await expect(isDeviceRevoked(TEST_USER, 'd1')).resolves.toBe(false);
      await expect(
        revokeDeviceSession(TEST_USER, 'd1', TEST_TTL),
      ).resolves.toBeUndefined();
      await expect(
        revokeAllUserSessions(TEST_USER),
      ).resolves.toEqual([]);
      await expect(
        clearDeviceRevocation(TEST_USER, 'd1'),
      ).resolves.toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
});
