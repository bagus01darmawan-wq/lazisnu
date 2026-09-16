import Fastify from 'fastify';
import request from 'supertest';
import {FastifyInstance} from 'fastify';
import {versionRoutes, mobileReleaseSchema} from '../mobile/version';
import rawRelease from '../mobile/mobileRelease.json';

/**
 * Endpoint versi PUBLIK & self-contained (tanpa DB/Redis) — diuji dengan
 * instance Fastify minimal, sehingga bisa jalan di mesin mana pun.
 *
 * Kontrak yang dijaga: apa yang disajikan endpoint HARUS persis sama
 * dengan sumbernya (mobileRelease.json) — termasuk transformasi
 * camelCase → snake_case oleh serializeOutput. Angka versi TIDAK ditulis
 * keras di sini: naik versi cukup dengan mengedit mobileRelease.json.
 */
let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  await app.register(versionRoutes, {prefix: '/v1/mobile'});
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Mobile Version Endpoint (fitur update-in-app Tingkat 1)', () => {
  it('menyajikan info rilis persis sesuai mobileRelease.json (snake_case)', async () => {
    const response = await request(app.server).get('/v1/mobile/version');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const data = response.body.data;
    expect(data.version).toBe(rawRelease.version);
    expect(data.version_code).toBe(rawRelease.versionCode);
    expect(data.apk_url).toBe(rawRelease.apkUrl);
    expect(data.apk_urls).toEqual(rawRelease.apkUrls);
    expect(data.changelog).toBe(rawRelease.changelog);
    expect(data.minimum_version_code).toBe(rawRelease.minimumVersionCode);
  });

  it('bentuk data valid (semver, URL https, ambang non-negatif)', async () => {
    const response = await request(app.server).get('/v1/mobile/version');
    const data = response.body.data;

    expect(data.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(data.apk_url).toMatch(/^https:\/\/.+\/(.+\.apk)$/);
    expect(data.minimum_version_code).toBeGreaterThanOrEqual(0);
    expect(data.version_code).toBeGreaterThan(0);
  });

  it('kontrak rilis ≥ v1.2.0: universal BOLEH hilang (hanya 2 APK per-ABI)', () => {
    // Sebelum perubahan ini, schema zod mewajibkan tiga kunci apkUrls —
    // rilis tanpa universal membuat server menolak start (fail-fast).
    // Sekarang universal opsional: arm64 + armeabi wajib, universal tidak.
    const twoApkRelease = {
      ...rawRelease,
      apkUrls: {
        arm64_v8a: 'https://apk.lazisnu.site/lazisnu-9.9.9-arm64-v8a.apk',
        armeabi_v7a: 'https://apk.lazisnu.site/lazisnu-9.9.9-armeabi-v7a.apk',
      },
    };
    expect(twoApkRelease.apkUrls).not.toHaveProperty('universal');
    expect(() => mobileReleaseSchema.parse(twoApkRelease)).not.toThrow();
  });

  it('arm64 + armeabi tetap wajib (fail-fast jika salah satu hilang)', () => {
    const {arm64_v8a, ...rest} = rawRelease.apkUrls;
    expect(() =>
      mobileReleaseSchema.parse({...rawRelease, apkUrls: rest}),
    ).toThrow();
  });
});
