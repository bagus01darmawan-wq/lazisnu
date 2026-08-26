/**
 * Integration Test: POST /v1/auth/refresh — Sesi Permanen Sliding
 * (RENCANA-SESI-PERMANEN-SLIDING-2026-08-26 §4.F, Gate G1)
 *
 * Kasus yang dijaga:
 *   1. F0 tumbang: refresh ke-2 dengan token hasil rotasi → 200 (dulu pasti REFRESH_REVOKED)
 *   2. Sliding grace: token LAMA dipakai ulang dua kali → tetap 200
 *   3. Gangguan infrastruktur (DB throw) → 503 SERVICE_UNAVAILABLE, bukan 401
 *   4. Denylist eksplisit aktif → 401 REFRESH_REVOKED
 *   5. Akun dinonaktifkan → 403 ACCOUNT_DISABLED
 *   6. did stabil antar rotasi; jti berganti
 *
 * Redis memakai ioredis-mock otomatis (REDIS_URL tidak diset di .env.test).
 */

import request from 'supertest';
import bcrypt from 'bcryptjs';
import { getApp, closeApp } from './helpers/app-helper';
import { db } from '../../config/database';
import * as schema from '../../database/schema';
import { revokeDeviceSession } from '../../services/tokenService';
import { config } from '../../config/env';

jest.mock('../../config/database', () => {
  const mockFindFirstUser = jest.fn();
  const mockFindFirstOfficer = jest.fn();
  // Default chain wajib ada sejak registrasi route — getLatestCollectionCondition
  // memakai db.select(...).from(...).where(...) saat plugin mobile dimuat.
  const mockWhereUpdate = jest.fn().mockImplementation(async () => [{}]);
  const mockSet = jest.fn().mockImplementation(() => ({
    where: mockWhereUpdate,
  }));
  const mockUpdate = jest.fn().mockImplementation(() => ({ set: mockSet }));
  const mockValues = jest.fn().mockImplementation(async () => ({}));
  const mockInsert = jest.fn().mockImplementation(() => ({
    values: mockValues,
  }));
  const mockLimit = jest.fn().mockImplementation(async () => []);
  const mockWhere = jest.fn().mockImplementation(() => ({ limit: mockLimit }));
  const mockFrom = jest.fn().mockImplementation(() => ({ where: mockWhere }));
  // select().from(table).where(...).limit(1) — diisi dinamis per test
  const mockSelect = jest.fn().mockImplementation(() => ({ from: mockFrom }));

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

const VALID_ADMIN = {
  identifier: 'refresh-admin@lazisnu.test',
  password: 'Admin123!',
};

const activeUserRow = (overrides: Record<string, unknown> = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  email: VALID_ADMIN.identifier,
  phone: '081234567891',
  fullName: 'Admin Refresh',
  passwordHash: bcrypt.hashSync(VALID_ADMIN.password, 10),
  role: 'ADMIN_KECAMATAN',
  branchId: 'branch-id',
  districtId: 'district-id',
  isActive: true,
  lastLogin: null,
  ...overrides,
});

/**
 * Pasang mock select() yang membedakan tabel lewat identitas objek schema.
 * Chain mendukung dua pola dipakai route:
 *   - await db.select().from(x).where(...)          (login: daftar officer)
 *   - await db.select().from(x).where(...).limit(1) (refresh: users/officers/sessions)
 */
function setupSelectMock(opts: {
  user?: Record<string, unknown> | null;
  userThrow?: boolean;
  sessions?: Array<Record<string, unknown>>;
}) {
  const rowsFor = (table: unknown) => {
    if (table === schema.users) {
      if (opts.userThrow) {
        throw new Error('db-blowup-simulasi-infra');
      }
      return opts.user === undefined ? [activeUserRow()] : opts.user ? [opts.user] : [];
    }
    if (table === schema.userSessions) return opts.sessions ?? [];
    return [];
  };

  const makeWhere = (rows: Array<unknown>) => {
    const p = Promise.resolve(rows);
    return {
      then: (
        resolve?: (v: Array<unknown>) => unknown,
        reject?: (e: unknown) => unknown,
      ) => p.then(resolve, reject),
      limit: async () => rows,
    };
  };

  (db.select as jest.Mock).mockImplementation(() => ({
    from: (table: unknown) => ({
      where: () => makeWhere(rowsFor(table)),
    }),
  }));
}

async function loginAndGetTokens(deviceId: string) {
  const app = await getApp();
  (db.query.users.findFirst as jest.Mock).mockResolvedValue(activeUserRow());
  setupSelectMock({});

  const res = await request(app.server)
    .post('/v1/auth/login')
    .send({ ...VALID_ADMIN, device_id: deviceId });

  expect(res.status).toBe(200);
  return {
    accessToken: res.body.data.access_token as string,
    refreshToken: res.body.data.refresh_token as string,
  };
}

function decodeRefresh(app: any, token: string) {
  return app.jwt.verify(token, { key: config.JWT_REFRESH_SECRET }) as {
    userId: string;
    did: string;
    jti: string;
    exp: number;
  };
}

beforeAll(async () => {
  await getApp();
});

afterAll(async () => {
  await closeApp();
});

describe('POST /v1/auth/refresh — sesi permanen sliding', () => {
  // CATATAN: TIDAK memakai jest.resetAllMocks() — implementasi rantai default
  // dari factory jest.mock dibutuhkan saat registrasi route (getApp cached).
  // Setiap test memasang ulang mock yang ia butuhkan lewat helper.

  afterEach(async () => {
    const { getRedis } = require('../../config/redis');
    const redis = getRedis();
    if (redis) await redis.flushall();
  });

  it('[Kasus 1+6] refresh ke-2 dengan token hasil rotasi sukses; did stabil, jti berganti (F0)', async () => {
    const { refreshToken } = await loginAndGetTokens('kasus1-device');
    let app = await getApp();
    const original = decodeRefresh(app, refreshToken);

    // Refresh pertama
    setupSelectMock({});
    const r1 = await request(app.server)
      .post('/v1/auth/refresh')
      .send({ refresh_token: refreshToken });
    expect(r1.status).toBe(200);
    const t1 = r1.body.data.refresh_token;
    const d1 = decodeRefresh(app, t1);
    expect(d1.did).toBe(original.did);
    expect(d1.jti).not.toBe(original.jti);

    // Refresh kedua memakai token HASIL ROTASI — dulu PASTI REFRESH_REVOKED (F0)
    app = await getApp();
    const r2 = await request(app.server)
      .post('/v1/auth/refresh')
      .send({ refresh_token: t1 });
    expect(r2.status).toBe(200);
    const d2 = decodeRefresh(app, r2.body.data.refresh_token);
    expect(d2.did).toBe(original.did);
    expect(d2.jti).not.toBe(d1.jti);
  });

  it('[Kasus 2] sliding grace — token lama dipakai ulang dua kali tetap sah', async () => {
    const { refreshToken } = await loginAndGetTokens('kasus2-device');
    const app = await getApp();
    setupSelectMock({});

    const r1 = await request(app.server)
      .post('/v1/auth/refresh')
      .send({ refresh_token: refreshToken });
    expect(r1.status).toBe(200);

    // Simulasi respons rotasi pertama hilang: klien mengulang dengan token lama
    const r2 = await request(app.server)
      .post('/v1/auth/refresh')
      .send({ refresh_token: refreshToken });
    expect(r2.status).toBe(200);
  });

  it('[Kasus 3] gangguan infrastruktur saat lookup akun → 503 SERVICE_UNAVAILABLE', async () => {
    const { refreshToken } = await loginAndGetTokens('kasus3-device');
    const app = await getApp();

    setupSelectMock({ userThrow: true });
    const res = await request(app.server)
      .post('/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('[Kasus 4] denylist eksplisit → 401 REFRESH_REVOKED', async () => {
    const { refreshToken } = await loginAndGetTokens('kasus4-device');
    const app = await getApp();
    setupSelectMock({});

    // Pastikan refresh normal dulu hidup
    const ok = await request(app.server)
      .post('/v1/auth/refresh')
      .send({ refresh_token: refreshToken });
    expect(ok.status).toBe(200);

    // Admin/user mencabut device ini secara eksplisit
    const decoded = decodeRefresh(app, ok.body.data.refresh_token);
    await revokeDeviceSession(decoded.userId, decoded.did, 3600);

    const denied = await request(app.server)
      .post('/v1/auth/refresh')
      .send({ refresh_token: ok.body.data.refresh_token });
    expect(denied.status).toBe(401);
    expect(denied.body.error.code).toBe('REFRESH_REVOKED');
  });

  it('[Kasus 5] akun dinonaktifkan → 403 ACCOUNT_DISABLED meski token valid', async () => {
    const { refreshToken } = await loginAndGetTokens('kasus5-device');
    const app = await getApp();

    setupSelectMock({ user: activeUserRow({ isActive: false }) });
    const res = await request(app.server)
      .post('/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('[Kasus 6b] refresh tanpa body → 400 MISSING_TOKEN', async () => {
    const app = await getApp();
    const res = await request(app.server).post('/v1/auth/refresh').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_TOKEN');
  });
});
