/**
 * VERIF 06-P0-A5: Test CORS whitelist
 *
 * Latar belakang (Sub-bab 06 P0-A1..A5):
 *   app.ts:42 menggunakan origin: true di dev (allow ALL browser origins).
 *   Untuk production, harus pakai whitelist: origin: isProduction ? corsOrigins : true.
 *   corsOrigins di-parse dari env CORS_ORIGINS (env.ts:78).
 *   Vulnerability: jika lupa set CORS_ORIGINS di production, API menerima
 *   request dari origin mana pun (dengan credentials). Mobile tidak
 *   terdampak (bukan browser), tapi dashboard web rentan.
 *
 * Test ini mock env.ts untuk simulasi production mode dengan whitelist:
 *   - 2 whitelisted origins: https://dashboard.lazisnu.site, https://admin.lazisnu.site
 *   - isProduction = true (maka app.ts pakai corsOrigins, BUKAN true)
 *
 * Verifikasi CORS whitelist (mengikuti behavior @fastify/cors):
 *   1. Preflight dari whitelisted origin -> 204 + Access-Control-Allow-Origin header
 *   2. Preflight dari non-whitelisted origin -> 204 TANPA Access-Control-Allow-Origin
 *   3. Preflight dari "null" origin -> 204 TANPA Access-Control-Allow-Origin
 *   4. Actual request dari non-whitelisted -> response tanpa Access-Control-Allow-Origin
 *
 * CATATAN PENTING tentang ekspektasi 403:
 *   Analisis awal (06-temuan-perbaikan-kode.md P0-A5) menyebut "request dari
 *   origin asing -> ditolak 403". Namun @fastify/cors by default TIDAK return
 *   403 untuk non-whitelisted origin. Behavior server-side yang sebenarnya:
 *   - Status code: 204 (No Content) untuk preflight, route response untuk actual request
 *   - Header Access-Control-Allow-Origin: di-set HANYA untuk whitelisted origin
 *   - Browser-side: memblokir response yang tidak punya header Allow-Origin
 *   Untuk strict 403 server-side, butuh custom preHandler hook (tidak di-scope test ini).
 *
 * Catatan teknis:
 *   - @fastify/cors hook onRequest intercept OPTIONS (preflight) SEBELUM route
 *     handler — jadi test ini tidak butuh DB / Redis mock lengkap.
 *   - Mock env.ts di file ini tidak affect test lain (Jest module isolation).
 *     auth.integration.test.ts tetap pakai dev mode (origin: true).
 */

// Mock env.ts — simulasi production mode dengan CORS whitelist
// (hoisted oleh Jest, jalan sebelum import lain)
jest.mock('../../config/env', () => {
  const whitelist = 'https://dashboard.lazisnu.site,https://admin.lazisnu.site';
  return {
    config: {
      NODE_ENV: 'production',
      PORT: '3001',
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      JWT_SECRET: 'a'.repeat(32),
      JWT_EXPIRES_IN: '7d',
      JWT_ACCESS_SECRET: 'b'.repeat(32),
      JWT_REFRESH_SECRET: 'c'.repeat(32),
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '365d',
      JWT_REFRESH_TTL_PETUGAS: '365d',
      CORS_ORIGINS: whitelist,
      API_BASE_URL: 'http://localhost:3001',
      WA_PROVIDER: 'meta',
    },
    isProduction: true,
    isDevelopment: false,
    corsOrigins: whitelist.split(',').map(s => s.trim()),
  };
});

// Mock DB dengan chainable pattern (sama seperti auth.integration.test.ts).
// Beberapa service (collectionSubmission, dll) dipanggil saat route
// registration dengan pola db.select().from().where().chain() — mock harus
// support chain tersebut. Mock minimal di sini hanya untuk membuat buildApp()
// tidak crash; test CORS tidak pernah trigger DB karena @fastify/cors
// hook intercept OPTIONS sebelum route handler.
jest.mock('../../config/database', () => {
  const mockFindFirstUser = jest.fn();
  const mockFindFirstOfficer = jest.fn();

  const mockLimit = jest.fn().mockImplementation(async () => []);
  const mockWhere = jest.fn().mockImplementation(() => ({
    limit: mockLimit,
  }));
  const mockFrom = jest.fn().mockImplementation(() => ({
    where: mockWhere,
  }));
  const mockSelect = jest.fn().mockImplementation(() => ({
    from: mockFrom,
  }));

  const mockUpdateWhere = jest.fn().mockImplementation(async () => ({}));
  const mockSet = jest.fn().mockImplementation(() => ({
    where: mockUpdateWhere,
  }));
  const mockUpdate = jest.fn().mockImplementation(() => ({
    set: mockSet,
  }));

  const mockValues = jest.fn().mockImplementation(async () => ({}));
  const mockInsert = jest.fn().mockImplementation(() => ({
    values: mockValues,
  }));

  return {
    db: {
      query: {
        users: { findFirst: mockFindFirstUser },
        officers: { findFirst: mockFindFirstOfficer },
      },
      select: mockSelect,
      update: mockUpdate,
      insert: mockInsert,
    },
    closeDbConnection: jest.fn().mockResolvedValue(undefined),
    testConnection: jest.fn().mockResolvedValue(true),
  };
});

// Mock Redis — sama, opsional untuk CORS test tapi hindari error
jest.mock('../../config/redis', () => ({
  getRedis: jest.fn().mockReturnValue(null),
  disconnectRedis: jest.fn(),
}));

import request from 'supertest';
import { getApp, closeApp } from './helpers/app-helper';

describe('CORS Whitelist (VERIF 06-P0-A5)', () => {
  afterAll(async () => {
    await closeApp();
  });

  describe('Preflight (OPTIONS) dari origin', () => {
    it('harus allow preflight dari whitelisted origin (https://dashboard.lazisnu.site)', async () => {
      const app = await getApp();

      const res = await request(app.server)
        .options('/v1/auth/login')
        .set('Origin', 'https://dashboard.lazisnu.site')
        .set('Access-Control-Request-Method', 'POST');

      // 204 = No Content, status standar untuk preflight sukses
      expect(res.status).toBe(204);
      // Header harus echo origin (atau '*' jika credentials=false)
      expect(res.headers['access-control-allow-origin']).toBe('https://dashboard.lazisnu.site');
    });

    it('harus allow preflight dari whitelisted origin kedua (https://admin.lazisnu.site)', async () => {
      const app = await getApp();

      const res = await request(app.server)
        .options('/v1/auth/login')
        .set('Origin', 'https://admin.lazisnu.site')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('https://admin.lazisnu.site');
    });

    it('harus REJECT preflight dari non-whitelisted origin (https://evil.example.com) — tanpa Allow-Origin', async () => {
      // VERIF 06-P0-A5: "Test CORS: request dari origin asing -> ditolak".
      // @fastify/cors tidak return 403 — ia omit Access-Control-Allow-Origin
      // header sehingga browser block response client-side. Test verifikasi
      // absence of header adalah indikator server-side rejection yang valid.
      const app = await getApp();

      const res = await request(app.server)
        .options('/v1/auth/login')
        .set('Origin', 'https://evil.example.com')
        .set('Access-Control-Request-Method', 'POST');

      // Status: 204 (preflight sukses dari HTTP perspective)
      expect(res.status).toBe(204);
      // TAPI: tidak ada Allow-Origin header → browser akan block
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('harus REJECT preflight dari "null" origin (sering dipakai untuk exploit iframe/sandbox)', async () => {
      const app = await getApp();

      const res = await request(app.server)
        .options('/v1/auth/login')
        .set('Origin', 'null')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('harus REJECT preflight dari origin mirip tapi tidak sama (https://dashboard.lazisnu.site.evil.com)', async () => {
      // Subdomain spoofing attempt — string match, bukan domain match
      const app = await getApp();

      const res = await request(app.server)
        .options('/v1/auth/login')
        .set('Origin', 'https://dashboard.lazisnu.site.evil.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Actual request (POST) dari non-whitelisted origin', () => {
    it('tidak boleh kirim Access-Control-Allow-Origin header untuk origin asing', async () => {
      // Untuk non-preflight request, @fastify/cors tidak return 403 tapi
      // omit Access-Control-Allow-Origin header. Browser akan block
      // response client-side. Test verifikasi server behavior.
      const app = await getApp();

      const res = await request(app.server)
        .post('/v1/auth/login')
        .set('Origin', 'https://evil.example.com')
        .send({ phone: '081234567890', password: 'x' });

      // Response tidak punya Access-Control-Allow-Origin
      // (meskipun request mungkin tetap diproses, browser tidak akan izinkan JS baca response)
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
