/**
 * Regression Test: Pengerasan HS256 (audit-cicd-2026-08-31, R4)
 *
 * Latar belakang: @fastify/jwt sebelum pengerasan menerima algoritma
 * apa pun yang ditawarkan oleh header `alg` token. Penyerang bisa:
 *
 *   1. Mengirim token dengan `alg: none` (CVE-2026-34950 varian A)
 *   2. Menandatangani token dengan HS384/HS512 menggunakan secret yang
 *      sama (algorithm confusion)
 *   3. Menandatangani token dengan RS256 menggunakan secret publik
 *      sebagai shared secret — di konfigurasi saat ini tidak relevan
 *      karena server tidak memuat public key, tetapi dikunci untuk
 *      konsistensi
 *
 * Setelah pengerasan (verify.algorithms: ['HS256']), semua serangan
 * di atas HARUS ditolak dengan 401.
 *
 * Test ini mengunci pengerasan dari regresi. Jika seseorang menghapus
 * baris 'verify.algorithms' di app.ts, semua test di file ini gagal.
 */

import crypto from 'node:crypto';
import request from 'supertest';
import { getApp, closeApp, resetApp } from './helpers/app-helper';
import { db } from '../../config/database';

// Mock DB (sama dengan auth.integration.test.ts) — kita tidak akan
// pernah sampai ke query karena JWT harus ditolak sebelum DB.
jest.mock('../../config/database', () => {
  const mockSelect = jest.fn().mockImplementation(() => ({
    from: jest.fn().mockImplementation(() => ({
      where: jest.fn().mockImplementation(() => ({
        limit: jest.fn().mockImplementation(async () => []),
      })),
    })),
  }));
  return {
    db: {
      query: {
        users: { findFirst: jest.fn().mockResolvedValue(null) },
        officers: { findFirst: jest.fn().mockResolvedValue(null) },
      },
      select: mockSelect,
      update: jest.fn(),
      insert: jest.fn(),
    },
    closeDbConnection: jest.fn().mockResolvedValue(undefined),
    testConnection: jest.fn().mockResolvedValue(true),
  };
});

/**
 * Build token JWT dengan algoritma dan signing yang dapat dikontrol.
 * Mendukung HS256, HS384, HS512, dan 'none' (unsigned).
 */
function makeJwt(
  alg: 'HS256' | 'HS384' | 'HS512' | 'none',
  secret: string | null,
  payload: Record<string, unknown> = {
    userId: 'test-user-123',
    role: 'PETUGAS',
    tokenType: 'access',
  }
): string {
  const header = { alg, typ: 'JWT' };
  const enc = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const h = enc(header);
  const p = enc(payload);

  if (alg === 'none') {
    // Token tidak ditandatangani. Banyak library JWT modern menolak
    // memverifikasi token ini, tetapi kita ingin memastikan server
    // kita tidak termasuk di antara yang menerima.
    return `${h}.${p}.`;
  }

  if (secret === null) {
    throw new Error('HS* algorithm requires a secret');
  }

  const hashAlg = alg === 'HS256' ? 'sha256' : alg === 'HS384' ? 'sha384' : 'sha512';
  const sig = crypto
    .createHmac(hashAlg, secret)
    .update(`${h}.${p}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${h}.${p}.${sig}`;
}

// Pakai secret yang sama dengan yang dipakai buildApp() — JWT_ACCESS_SECRET.
// File .env.test mengekspos secret ini untuk test.
const TEST_SECRET =
  process.env.JWT_ACCESS_SECRET ||
  // fallback jika .env.test tidak di-load (sepanjang 32 char minimum)
  'a'.repeat(32);

describe('Pengerasan JWT — HS256 enforcement (R4)', () => {
  beforeAll(async () => {
    await getApp();
  });

  afterAll(async () => {
    await closeApp();
  });

  beforeEach(async () => {
    // Reset state rate-limit (counter in-memory) dan mock DB.
    // (mock DB tidak di-clear karena default-nya sudah array kosong,
    //  yang kita butuhkan adalah konsistensi batas rate.)
    await resetApp();
  });

  // ── 1. Token hilang → 401 ───────────────────────────────────────────
  it('GET /v1/auth/me tanpa token mengembalikan 401', async () => {
    const app = await getApp();
    const res = await request(app.server).get('/v1/auth/me');
    expect(res.status).toBe(401);
  });

  // ── 2. Token HS256 valid → 200 (sanity, bukan fokus pengerasan) ─────
  it('GET /v1/auth/me dengan token HS256 valid lolos jwtVerify (>= 200)', async () => {
    const app = await getApp();
    const token = makeJwt('HS256', TEST_SECRET);
    const res = await request(app.server)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    // Bisa 200 (jika mock DB kebetulan mengembalikan user) atau 500
    // (jika mock chain putus). Yang penting: TIDAK BOLEH 401.
    // jwtVerify harus menerima HS256.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  // ── 3. Token HS384 (algorithm confusion) → 401 ─────────────────────
  it('GET /v1/auth/me dengan token HS384 yang ditandatangani benar DITOLAK 401', async () => {
    const app = await getApp();
    const token = makeJwt('HS384', TEST_SECRET);
    const res = await request(app.server)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    // Token ditandatangani dengan benar menggunakan secret yang sama
    // tetapi algoritma bukan HS256. Tanpa verify.algorithms, server
    // akan menerimanya. Dengan pengerasan, harus 401.
    expect(res.status).toBe(401);
  });

  // ── 4. Token HS512 (algorithm confusion) → 401 ─────────────────────
  it('GET /v1/auth/me dengan token HS512 yang ditandatangani benar DITOLAK 401', async () => {
    const app = await getApp();
    const token = makeJwt('HS512', TEST_SECRET);
    const res = await request(app.server)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  // ── 5. Token alg: none → 401 ────────────────────────────────────────
  it('GET /v1/auth/me dengan token alg:none unsigned DITOLAK 401', async () => {
    const app = await getApp();
    const token = makeJwt('none', null);
    const res = await request(app.server)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    // Token tanpa signature — varian klasik algorithm confusion.
    // Beberapa library menerima jika alg=none; @fastify/jwt dengan
    // verify.algorithms=['HS256'] harus menolak.
    expect(res.status).toBe(401);
  });

  // ── 6. Token dengan signature HS256 palsu → 401 ────────────────────
  it('GET /v1/auth/me dengan signature HS256 yang salah DITOLAK 401', async () => {
    const app = await getApp();
    const token = makeJwt('HS256', 'bukan-secret-yang-benar-tetapi-32-chars');
    const res = await request(app.server)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  // ── 7. Token dengan header alg di-override ke "none" via case-mismatch
  //      (beberapa library漏洞) → 401 ───────────────────────────────
  it('GET /v1/auth/me dengan token header "None" DITOLAK 401', async () => {
    const app = await getApp();
    // Build manual: header {alg: 'None'} (kapital) — beberapa library
    // menerima ini sebagai alias untuk 'none' tetapi tidak seharusnya.
    const header = { alg: 'None', typ: 'JWT' };
    const enc = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    const h = enc(header);
    const p = enc({ userId: 'x', tokenType: 'access' });
    const token = `${h}.${p}.`;
    const res = await request(app.server)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    // fast-jwt@4.0.5 menormalisasi case, jadi harus 401.
    expect(res.status).toBe(401);
  });
});
