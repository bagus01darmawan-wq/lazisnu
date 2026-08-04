/**
 * Integration Test: Auth Endpoints (Mocked Database)
 * Tests Fastify routes, schema validation, rate-limiting, and logic.
 */

import request from 'supertest';
import bcrypt from 'bcryptjs';
import { getApp, closeApp, resetApp } from './helpers/app-helper';
import { db } from '../../config/database';

// Mock DB configuration completely so it doesn't try to connect to a real Postgres database
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
        users: {
          findFirst: mockFindFirstUser,
        },
        officers: {
          findFirst: mockFindFirstOfficer,
        },
      },
      select: mockSelect,
      update: mockUpdate,
      insert: mockInsert,
    },
    closeDbConnection: jest.fn().mockResolvedValue(undefined),
    testConnection: jest.fn().mockResolvedValue(true),
  };
});

/**
 * Re-establish default mock implementations untuk DB setelah jest.resetAllMocks().
 *
 * jest.clearAllMocks() HANYA hapus call history, BUKAN reset implementation.
 * jest.resetAllMocks() hapus keduanya, tapi mock jadi return undefined
 * (memutus chain db.select().from().where()).
 *
 * Helper ini dipanggil di setiap beforeEach setelah resetAllMocks()
 * agar default chain kembali tersedia — test bisa langsung call db.*()
 * tanpa harus override implementation terlebih dahulu.
 */
const setupDefaultDbMocks = () => {
  // Default: chain select().from().where() mengembalikan array kosong (awaitable)
  (db.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn().mockImplementation(() => ({
      where: jest.fn().mockImplementation(async () => []),
    })),
  }));

  // Default: update().set().where() mengembalikan object kosong
  (db.update as jest.Mock).mockImplementation(() => ({
    set: jest.fn().mockImplementation(() => ({
      where: jest.fn().mockImplementation(async () => [{}]),
    })),
  }));

  // Default: insert().values() mengembalikan object kosong
  (db.insert as jest.Mock).mockImplementation(() => ({
    values: jest.fn().mockImplementation(async () => [{}]),
  }));

  // query.users.findFirst / query.officers.findFirst: default return undefined
  (db.query.users.findFirst as jest.Mock).mockReset();
  (db.query.officers.findFirst as jest.Mock).mockReset();
};

const VALID_ADMIN = {
  identifier: 'admin@lazisnu.test',
  password: 'Admin123!',
};

const mockUser = {
  id: 'user-admin-id',
  email: 'admin@lazisnu.test',
  phone: '081234567890',
  fullName: 'Administrator',
  passwordHash: bcrypt.hashSync('Admin123!', 10),
  role: 'ADMIN_KECAMATAN',
  branchId: 'branch-id',
  districtId: 'district-id',
  isActive: true,
  lastLogin: null,
};

let accessToken: string | null = null;
let refreshToken: string | null = null;

beforeAll(async () => {
  await getApp();
});

afterAll(async () => {
  await closeApp();
});

describe('[POST] /v1/auth/login', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setupDefaultDbMocks();
  });

  it('should return 400 when body is empty', async () => {
    const app = await getApp();
    const res = await request(app.server).post('/v1/auth/login').send({});
    console.log('RESPONSE:', res.status, res.body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toMatch(/VALIDATION_ERROR/i);
  });

  it('should return 400 when password is too short', async () => {
    const app = await getApp();
    const res = await request(app.server)
      .post('/v1/auth/login')
      .send({ identifier: 'test@test.com', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 401 with wrong password', async () => {
    const app = await getApp();
    
    // Mock user exists
    (db.query.users.findFirst as jest.Mock).mockResolvedValue(mockUser);
    
    const res = await request(app.server)
      .post('/v1/auth/login')
      .send({ identifier: VALID_ADMIN.identifier, password: 'wrongpassword' });
    
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/salah/i);
  });

  it('should return 200 and tokens when credentials are valid', async () => {
    const app = await getApp();
    
    // Mock user and officer
    (db.query.users.findFirst as jest.Mock).mockResolvedValue(mockUser);
    
    // Mock select().from().where() return value for officers list
    const mockLimit = jest.fn().mockImplementation(async () => [{ id: 'officer-id' }]);
    const mockWhere = jest.fn().mockImplementation(() => [{ id: 'officer-id' }]);
    // In auth.ts line 57: db.select().from(officers).where(eq(officers.userId, user.id))
    // This is a direct await of the where builder or chain
    const mockFrom = jest.fn().mockImplementation(() => ({
      where: mockWhere,
    }));
    (db.select as jest.Mock).mockImplementation(() => ({
      from: mockFrom,
    }));

    const res = await request(app.server)
      .post('/v1/auth/login')
      .send(VALID_ADMIN);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('access_token');
    expect(res.body.data).toHaveProperty('refresh_token');
    expect(res.body.data.user.email).toBe(mockUser.email);
    expect(res.body.data.user.role).toBe(mockUser.role);

    // Save tokens
    accessToken = res.body.data.access_token;
    refreshToken = res.body.data.refresh_token;
  });
});

describe('[POST] /v1/auth/request-otp', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setupDefaultDbMocks();
  });

  it('should return 404 when phone is not registered (TD-04)', async () => {
    // TD-04: Route request-otp di auth.ts line 244 pakai db.query.officers.findFirst
    // (relational query, dengan `with: { user: true }`), BUKAN db.select() (SQL builder).
    // Test lama mock db.select — mock tidak pernah terpanggil route, route jalan
    // dengan default state (findFirst returns undefined) dan return 404.
    //
    // Test ini di-rewrite agar:
    // 1. Mock target benar: db.query.officers.findFirst
    // 2. Ekspektasi sesuai route behavior: 404 USER_NOT_FOUND (route TIDAK anti-enumeration
    //    by design — lihat auth.ts:249-251, eksplisit return 404 jika officer tidak ada)
    const app = await getApp();

    // Mock officer not found — return undefined (eksplisit untuk kejelasan)
    (db.query.officers.findFirst as jest.Mock).mockResolvedValue(undefined);

    const res = await request(app.server)
      .post('/v1/auth/request-otp')
      .send({ phone: '08999999999' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('should return 400 when phone is missing', async () => {
    const app = await getApp();
    const res = await request(app.server)
      .post('/v1/auth/request-otp')
      .send({});
    expect(res.status).toBe(400);
  });

  it('should match officer dengan format 08xx (normalisasi lookup, regresi D10-MF3a)', async () => {
    // officers.phone disimpan format 62xx ("6282134536151") sedangkan user
    // mengetik 08xx ("082134536151"). Lookup harus cocok dengan varian
    // normalisasi — jika tidak, route return 404 USER_NOT_FOUND.
    // resetApp: beri jatah rate limit penuh (route max 3/menit, TD-05).
    const app = await resetApp();

    (db.query.officers.findFirst as jest.Mock).mockResolvedValue({
      id: 'officer-1',
      phone: '6282134536151',
      isActive: true,
      user: { id: 'user-1', isActive: true },
    });

    const res = await request(app.server)
      .post('/v1/auth/request-otp')
      .send({ phone: '082134536151' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should match officer dengan format 62xx (input langsung)', async () => {
    const app = await resetApp();

    (db.query.officers.findFirst as jest.Mock).mockResolvedValue({
      id: 'officer-1',
      phone: '6282134536151',
      isActive: true,
      user: { id: 'user-1', isActive: true },
    });

    const res = await request(app.server)
      .post('/v1/auth/request-otp')
      .send({ phone: '6282134536151' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 400 when phone is too short', async () => {
    const app = await getApp();
    const res = await request(app.server)
      .post('/v1/auth/request-otp')
      .send({ phone: '0812' });
    expect(res.status).toBe(400);
  });
});

describe('[POST] /v1/auth/verify-otp', () => {
  it('should return 401 when OTP is wrong', async () => {
    const app = await getApp();
    const res = await request(app.server)
      .post('/v1/auth/verify-otp')
      .send({ phone: '081234567890', otp: '000000' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toMatch(/INVALID_OTP/i);
  });
});

describe('[GET] /v1/auth/me', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setupDefaultDbMocks();
  });

  it('should return 401 when no token is provided', async () => {
    const app = await getApp();
    const res = await request(app.server).get('/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 200 with user data when valid token is provided', async () => {
    if (!accessToken) return;
    
    const app = await getApp();
    
    // Mock user for /me check
    const mockLimit = jest.fn().mockResolvedValue([mockUser]);
    const mockWhere = jest.fn().mockImplementation(() => ({
      limit: mockLimit,
    }));
    const mockFrom = jest.fn().mockImplementation(() => ({
      where: mockWhere,
    }));
    (db.select as jest.Mock).mockImplementation(() => ({
      from: mockFrom,
    }));

    const res = await request(app.server)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
      
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(mockUser.email);
  });
});

describe('[POST] /v1/auth/refresh', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setupDefaultDbMocks();
  });

  it('should return 401 when refresh_token is invalid', async () => {
    const app = await getApp();
    const res = await request(app.server)
      .post('/v1/auth/refresh')
      .send({ refresh_token: 'invalid.token.here' });
    expect(res.status).toBe(401);
  });

  it('should return 200 when valid refresh_token is provided', async () => {
    if (!refreshToken) return;
    
    const app = await getApp();
    
    // Mock user for refresh check
    const mockLimit = jest.fn().mockResolvedValue([mockUser]);
    const mockWhere = jest.fn().mockImplementation(() => ({
      limit: mockLimit,
    }));
    const mockFrom = jest.fn().mockImplementation(() => ({
      where: mockWhere,
    }));
    (db.select as jest.Mock).mockImplementation(() => ({
      from: mockFrom,
    }));

    const res = await request(app.server)
      .post('/v1/auth/refresh')
      .send({ refresh_token: refreshToken });
      
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('access_token');
    expect(res.body.data).toHaveProperty('refresh_token');
  });
});

describe('[POST] /v1/auth/logout', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setupDefaultDbMocks();
  });

  it('should return 200 on logout', async () => {
    const app = await getApp();
    const res = await request(app.server)
      .post('/v1/auth/logout')
      .send({ refresh_token: refreshToken || '' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── 04-F1: Session Management Integration Tests ───

describe('Session Management (04-F1)', () => {
  let sessionToken: string | null = null;
  let sessionRefresh: string | null = null;

  // Impor jwt untuk decode token
  const jwt = require('jsonwebtoken');
  const { revokeDeviceSession, revokeAllUserSessions } = require('../../services/tokenService');

  beforeEach(async () => {
    // TD-05: Reset Fastify instance agar @fastify/rate-limit LocalStore
    // (in-memory counter) kembali ke 0. Tanpa reset ini, counter
    // terakumulasi lintas test dalam describe (3 test × 2 login = 6)
    // ditambah dari outer describe (1 login) = 7, melebihi limit
    // 5/minute di /v1/auth/login → test gagal dengan 429.
    await resetApp();
    jest.resetAllMocks();
    setupDefaultDbMocks();
  });

  afterEach(async () => {
    // Bersihkan Redis mock + reset mock state untuk isolasi antar test
    const { getRedis } = require('../../config/redis');
    const redis = getRedis();
    if (redis) await redis.flushall();
  });

  it('Full cycle: login → refresh → logout → refresh after logout gagal', async () => {
    const app = await getApp();
    
    // ── 1. Login ──
    (db.query.users.findFirst as jest.Mock).mockResolvedValue(mockUser);
    const mockWhere = jest.fn().mockResolvedValue([{ id: 'officer-id' }]);
    const mockFrom = jest.fn().mockImplementation(() => ({ where: mockWhere }));
    (db.select as jest.Mock).mockImplementation(() => ({ from: mockFrom }));

    const loginRes = await request(app.server)
      .post('/v1/auth/login')
      .send(VALID_ADMIN);
    
    expect(loginRes.status).toBe(200);
    const token1 = loginRes.body.data.refresh_token;
    expect(token1).toBeDefined();

    // ── 2. Refresh ──
    const mockLimit = jest.fn().mockResolvedValue([mockUser]);
    const mockWhere2 = jest.fn().mockImplementation(() => ({ limit: mockLimit }));
    const mockFrom2 = jest.fn().mockImplementation(() => ({ where: mockWhere2 }));
    (db.select as jest.Mock).mockImplementation(() => ({ from: mockFrom2 }));

    const refreshRes = await request(app.server)
      .post('/v1/auth/refresh')
      .send({ refresh_token: token1 });
    
    expect(refreshRes.status).toBe(200);
    const token2 = refreshRes.body.data.refresh_token;
    sessionToken = token2;

    // Token lama (token1) tidak bisa dipakai refresh lagi (sudah dirotasi)
    (db.select as jest.Mock).mockImplementation(() => ({ from: mockFrom2 }));
    const refreshOld = await request(app.server)
      .post('/v1/auth/refresh')
      .send({ refresh_token: token1 });
    
    // Token lama sudah direvoke (rotasi) → 401 REFRESH_REVOKED
    expect(refreshOld.status).toBe(401);
    expect(refreshOld.body.error.code).toBe('REFRESH_REVOKED');

    // ── 3. Logout → refresh gagal ──
    (db.select as jest.Mock).mockImplementation(() => ({ from: mockFrom2 }));
    const logoutRes = await request(app.server)
      .post('/v1/auth/logout')
      .send({ refresh_token: token2 });
    
    expect(logoutRes.status).toBe(200);

    // Setelah logout, refresh harus gagal
    (db.select as jest.Mock).mockImplementation(() => ({ from: mockFrom2 }));
    const refreshAfterLogout = await request(app.server)
      .post('/v1/auth/refresh')
      .send({ refresh_token: token2 });
    
    expect(refreshAfterLogout.status).toBe(401);
    expect(refreshAfterLogout.body.error.code).toBe('REFRESH_REVOKED');
  });

  it('Revoke sesi tunggal → refresh gagal REFRESH_REVOKED', async () => {
    const app = await getApp();
    
    // ── 1. Login 2x (2 device berbeda, deviceId di-generate server) ──
    (db.query.users.findFirst as jest.Mock).mockResolvedValue(mockUser);
    const mockWhere = jest.fn().mockResolvedValue([{ id: 'officer-id' }]);
    const mockFrom = jest.fn().mockImplementation(() => ({ where: mockWhere }));
    (db.select as jest.Mock).mockImplementation(() => ({ from: mockFrom }));

    const loginA = await request(app.server)
      .post('/v1/auth/login')
      .send(VALID_ADMIN);
    expect(loginA.status).toBe(200);

    const loginB = await request(app.server)
      .post('/v1/auth/login')
      .send(VALID_ADMIN);
    expect(loginB.status).toBe(200);

    const tokenA = loginA.body.data.refresh_token;
    const tokenB = loginB.body.data.refresh_token;

    // ── 2. Decode token, revoke device A via Redis ──
    const decodedA: any = jwt.decode(tokenA);
    const deviceIdA = decodedA.did || decodedA.jti;
    await revokeDeviceSession(decodedA.userId, deviceIdA);

    // ── 3. Refresh device A → gagal REFRESH_REVOKED ──
    const mockLimit = jest.fn().mockResolvedValue([mockUser]);
    const mockWhere2 = jest.fn().mockImplementation(() => ({ limit: mockLimit }));
    const mockFrom2 = jest.fn().mockImplementation(() => ({ where: mockWhere2 }));
    (db.select as jest.Mock).mockImplementation(() => ({ from: mockFrom2 }));

    const refreshA = await request(app.server)
      .post('/v1/auth/refresh')
      .send({ refresh_token: tokenA });
    
    expect(refreshA.status).toBe(401);
    expect(refreshA.body.error.code).toBe('REFRESH_REVOKED');

    // ── 4. Refresh device B → sukses ──
    (db.select as jest.Mock).mockImplementation(() => ({ from: mockFrom2 }));
    const refreshB = await request(app.server)
      .post('/v1/auth/refresh')
      .send({ refresh_token: tokenB });
    
    expect(refreshB.status).toBe(200);
    expect(refreshB.body.data).toHaveProperty('refresh_token');
  });

  it('Revoke semua sesi → semua device mati kecuali current', async () => {
    const app = await getApp();
    
    // ── 1. Login 2 device ──
    (db.query.users.findFirst as jest.Mock).mockResolvedValue(mockUser);
    const mockWhere = jest.fn().mockResolvedValue([{ id: 'officer-id' }]);
    const mockFrom = jest.fn().mockImplementation(() => ({ where: mockWhere }));
    (db.select as jest.Mock).mockImplementation(() => ({ from: mockFrom }));

    const loginA = await request(app.server)
      .post('/v1/auth/login')
      .send(VALID_ADMIN);
    const loginB = await request(app.server)
      .post('/v1/auth/login')
      .send(VALID_ADMIN);

    expect(loginA.status).toBe(200);
    expect(loginB.status).toBe(200);

    const tokenA = loginA.body.data.refresh_token;
    const tokenB = loginB.body.data.refresh_token;

    // Device B adalah "current" yang dikecualikan
    const decodedB: any = jwt.decode(tokenB);
    const userId = decodedB.userId;
    const exceptDeviceId = decodedB.did || decodedB.jti;

    // ── 2. Revoke semua kecuali device B ──
    const revoked = await revokeAllUserSessions(userId, exceptDeviceId);
    // Harus ada device A yang direvoke
    expect(revoked.length).toBeGreaterThanOrEqual(1);
    expect(revoked).not.toContain(exceptDeviceId);

    // ── 3. Refresh device A → gagal ──
    const mockLimit = jest.fn().mockResolvedValue([mockUser]);
    const mockWhere2 = jest.fn().mockImplementation(() => ({ limit: mockLimit }));
    const mockFrom2 = jest.fn().mockImplementation(() => ({ where: mockWhere2 }));
    (db.select as jest.Mock).mockImplementation(() => ({ from: mockFrom2 }));

    const refreshA = await request(app.server)
      .post('/v1/auth/refresh')
      .send({ refresh_token: tokenA });
    expect(refreshA.status).toBe(401);

    // ── 4. Refresh device B → sukses ──
    (db.select as jest.Mock).mockImplementation(() => ({ from: mockFrom2 }));
    const refreshB = await request(app.server)
      .post('/v1/auth/refresh')
      .send({ refresh_token: tokenB });
    expect(refreshB.status).toBe(200);
  });
});

describe('Rate Limit (Backlog Sesi 31 #1)', () => {
  beforeAll(async () => {
    // TD-05: Reset Fastify instance untuk memastikan rate limit
    // counter mulai dari 0. Tanpa reset, counter terakumulasi dari
    // Session Management tests sebelumnya (~5 login) sehingga
    // request pertama Rate Limit test sudah kena 429, gagal verifikasi.
    await resetApp();
  });

  it('harus return 429 (bukan 500) saat /v1/auth/login kena rate limit', async () => {
    // /v1/auth/login punya config rateLimit max 5/menit (lihat auth.ts:44)
    // Bombard 7x — request ke-6 dan seterusnya harus 429, BUKAN 500.
    // Bug: errorResponseBuilder return plain object tanpa statusCode,
    // branch error.statusCode === 429 di setErrorHandler tidak match,
    // jatuh ke fallback 500.
    const app = await getApp();
    const results: Array<{ status: number; code?: string }> = [];

    for (let i = 0; i < 7; i++) {
      const res = await request(app.server)
        .post('/v1/auth/login')
        .send(VALID_ADMIN);
      results.push({
        status: res.status,
        code: res.body?.error?.code,
      });
    }

    // Request 1-5: bukan 429 (mungkin 200/401, tergantung mock)
    // Request 6-7: HARUS 429 dengan body TOO_MANY_REQUESTS
    const rateLimited = results.slice(5);
    expect(rateLimited.length).toBe(2);
    for (const r of rateLimited) {
      expect(r.status).toBe(429);  // BUKAN 500
      expect(r.code).toBe('TOO_MANY_REQUESTS');
    }

    // Verifikasi: tidak ada yang 500
    const anyServerError = results.find(r => r.status >= 500);
    expect(anyServerError).toBeUndefined();
  });
});
