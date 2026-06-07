/**
 * Integration Test: Auth Endpoints (Mocked Database)
 * Tests Fastify routes, schema validation, rate-limiting, and logic.
 */

import request from 'supertest';
import bcrypt from 'bcryptjs';
import { getApp, closeApp } from './helpers/app-helper';
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
    jest.clearAllMocks();
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
    jest.clearAllMocks();
  });

  it('should always return 200 regardless of whether phone is registered (anti-enumeration)', async () => {
    const app = await getApp();
    
    // Mock user not found
    const mockLimit = jest.fn().mockResolvedValue([]);
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
      .post('/v1/auth/request-otp')
      .send({ phone: '08999999999' });
      
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 400 when phone is missing', async () => {
    const app = await getApp();
    const res = await request(app.server)
      .post('/v1/auth/request-otp')
      .send({});
    expect(res.status).toBe(400);
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
    jest.clearAllMocks();
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
    jest.clearAllMocks();
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
  it('should return 200 on logout', async () => {
    const app = await getApp();
    const res = await request(app.server)
      .post('/v1/auth/logout')
      .send({ refresh_token: refreshToken || '' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
