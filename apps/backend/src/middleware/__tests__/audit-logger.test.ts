/**
 * TC-AUDIT-01: Unit Test — Middleware auditLogger
 *
 * Memastikan:
 * - Mutasi sukses (POST/PUT/PATCH/DELETE) dicatat di activity_logs
 * - GET & response gagal tidak dicatat
 * - Request tanpa login tidak dicatat
 * - oldData & newData dari auditContext tersimpan (atau NULL saat kosong)
 * - entityType di-infer benar dari URL
 * - Route auth (kecuali logout) tidak dicatat
 * - Middleware tidak crash saat DB error
 */

import { auditLogger } from '../audit-logger';
import * as schema from '../../database/schema';

const valuesMock = jest.fn().mockResolvedValue(undefined);

jest.mock('../../config/database', () => ({
  db: {
    insert: jest.fn().mockImplementation(() => ({
      values: valuesMock,
    })),
  },
  closeDbConnection: jest.fn().mockResolvedValue(undefined),
  testConnection: jest.fn().mockResolvedValue(true),
}));

const { db: mockedDb } = require('../../config/database');

function mockRequest(overrides: Record<string, any> = {}) {
  const base: Record<string, any> = {
    method: 'POST',
    url: '/v1/admin/cans',
    routeOptions: { url: '/v1/admin/cans' },
    params: {},
    headers: {},
    ip: '127.0.0.1',
    id: 'req-123',
    log: { error: jest.fn() },
    currentUser: {
      userId: 'user-123',
      role: 'ADMIN_KECAMATAN',
      officerId: 'officer-456',
      branchId: 'branch-789',
      districtId: 'district-001',
    },
    auditContext: undefined,
    ...overrides,
  };
  base.routeOptions = { url: base.url };
  return base;
}

function mockReply(statusCode: number = 201) {
  return {
    statusCode,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================================
// Test 1: Mencatat operasi mutation yang sukses
// ============================================================================

describe('auditLogger — mencatat mutasi sukses', () => {
  it('mencatat POST sukses dengan userId, actionType, entityType, ipAddress, userAgent', async () => {
    const req = mockRequest({ method: 'POST', url: '/v1/admin/cans' });
    const rep = mockReply(201);

    await auditLogger(req as any, rep as any);

    expect(mockedDb.insert).toHaveBeenCalledTimes(1);
    expect(mockedDb.insert).toHaveBeenCalledWith(schema.activityLogs);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        actionType: 'POST /v1/admin/cans',
        entityType: 'cans',
        ipAddress: '127.0.0.1',
      })
    );
  });

  it('mencatat PUT sukses', async () => {
    const req = mockRequest({ method: 'PUT', url: '/v1/admin/officers/abc' });
    const rep = mockReply(200);

    await auditLogger(req as any, rep as any);

    expect(mockedDb.insert).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'PUT /v1/admin/officers/abc',
        entityType: 'officers',
      })
    );
  });

  it('mencatat PATCH sukses', async () => {
    const req = mockRequest({ method: 'PATCH', url: '/v1/admin/branches/xyz' });
    const rep = mockReply(200);

    await auditLogger(req as any, rep as any);

    expect(mockedDb.insert).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'PATCH /v1/admin/branches/xyz',
        entityType: 'branches',
      })
    );
  });

  it('mencatat DELETE sukses', async () => {
    const req = mockRequest({ method: 'DELETE', url: '/v1/admin/dukuhs/def' });
    const rep = mockReply(200);

    await auditLogger(req as any, rep as any);

    expect(mockedDb.insert).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'DELETE /v1/admin/dukuhs/def',
        entityType: 'dukuhs',
      })
    );
  });
});

// ============================================================================
// Test 2: TIDAK mencatat GET
// ============================================================================

describe('auditLogger — skip GET', () => {
  it('TIDAK mencatat request GET', async () => {
    const req = mockRequest({ method: 'GET', url: '/v1/admin/cans' });
    const rep = mockReply(200);

    await auditLogger(req as any, rep as any);

    expect(mockedDb.insert).not.toHaveBeenCalled();
    expect(valuesMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Test 3: TIDAK mencatat response gagal
// ============================================================================

describe('auditLogger — skip response error', () => {
  it('MENCATAT response 403 sebagai AUTH_FAILED (security event)', async () => {
    const req = mockRequest({ method: 'POST', url: '/v1/admin/cans' });
    const rep = mockReply(403);

    await auditLogger(req as any, rep as any);

    expect(mockedDb.insert).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'AUTH_FAILED',
        entityType: 'cans',
      })
    );
  });

  it('P2-F3: 403 + _auditCode FORBIDDEN_SCOPE → actionType OWNERSHIP_DENIED', async () => {
    const req = mockRequest({ method: 'POST', url: '/v1/admin/officers/officer-456' });
    const rep = mockReply(403) as any;
    rep._auditCode = 'FORBIDDEN_SCOPE';

    await auditLogger(req as any, rep as any);

    expect(mockedDb.insert).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'OWNERSHIP_DENIED',
        entityType: 'officers',
      })
    );
  });

  it('TIDAK mencatat saat response.statusCode = 500', async () => {
    const req = mockRequest({ method: 'PUT', url: '/v1/admin/officers/abc' });
    const rep = mockReply(500);

    await auditLogger(req as any, rep as any);

    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('TIDAK mencatat saat response.statusCode = 404', async () => {
    const req = mockRequest({ method: 'DELETE', url: '/v1/admin/dukuhs/def' });
    const rep = mockReply(404);

    await auditLogger(req as any, rep as any);

    expect(mockedDb.insert).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Test 4: TIDAK mencatat tanpa user login
// ============================================================================

describe('auditLogger — skip tanpa user', () => {
  it('TIDAK mencatat jika request.currentUser = undefined', async () => {
    const req = { ...mockRequest({ method: 'POST', url: '/v1/admin/cans' }), currentUser: undefined };
    const rep = mockReply(201);

    await auditLogger(req as any, rep as any);

    expect(mockedDb.insert).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Test 5: oldData & newData dari auditContext
// ============================================================================

describe('auditLogger — oldData & newData', () => {
  it('mencatat oldData & newData dari request.auditContext', async () => {
    const oldData = { ownerName: 'Lama', isActive: true };
    const newData = { ownerName: 'Baru', isActive: true };
    const req = mockRequest({
      method: 'PUT',
      url: '/v1/admin/cans/123',
      params: { id: 'can-123' },
      auditContext: { oldData, newData },
    });
    const rep = mockReply(200);

    await auditLogger(req as any, rep as any);

    expect(mockedDb.insert).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'can-123',
        oldData,
        newData,
      })
    );
  });

  it('oldData & newData NULL saat auditContext tidak diisi (POST create)', async () => {
    const req = mockRequest({
      method: 'POST',
      url: '/v1/admin/cans',
      auditContext: undefined,
    });
    const rep = mockReply(201);

    await auditLogger(req as any, rep as any);

    expect(mockedDb.insert).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oldData: null,
        newData: null,
      })
    );
  });
});

// ============================================================================
// Test 6: entityType di-infer benar dari URL
// ============================================================================

describe('auditLogger — infer entityType', () => {
  it('infer entityType = "cans" dari /v1/admin/cans/123', async () => {
    const req = mockRequest({ method: 'PUT', url: '/v1/admin/cans/123' });
    const rep = mockReply(200);

    await auditLogger(req as any, rep as any);

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'cans' })
    );
  });

  it('infer entityType = "officers" dari /v1/admin/officers/456', async () => {
    const req = mockRequest({ method: 'PUT', url: '/v1/admin/officers/456' });
    const rep = mockReply(200);

    await auditLogger(req as any, rep as any);

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'officers' })
    );
  });

  it('infer entityType = "collections" dari /v1/admin/collections', async () => {
    const req = mockRequest({ method: 'POST', url: '/v1/admin/collections' });
    const rep = mockReply(201);

    await auditLogger(req as any, rep as any);

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'collections' })
    );
  });

  it('infer entityType = "dukuhs" dari /v1/admin/dukuhs/789', async () => {
    const req = mockRequest({ method: 'DELETE', url: '/v1/admin/dukuhs/789' });
    const rep = mockReply(200);

    await auditLogger(req as any, rep as any);

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'dukuhs' })
    );
  });

  it('strip query params dari URL', async () => {
    const req = mockRequest({ method: 'PUT', url: '/v1/admin/cans/123?permanent=true' });
    const rep = mockReply(200);

    await auditLogger(req as any, rep as any);

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'cans' })
    );
  });
});

// ============================================================================
// Test 7: Skip route auth (kecuali logout)
// ============================================================================

describe('auditLogger — skip auth routes', () => {
  it('TIDAK mencatat route /v1/auth/login', async () => {
    const req = mockRequest({
      method: 'POST',
      url: '/v1/auth/login',
      currentUser: { userId: 'user-123', role: 'ADMIN_KECAMATAN' } as any,
    });
    const rep = mockReply(200);

    await auditLogger(req as any, rep as any);

    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('TIDAK mencatat route /v1/auth/verify-otp', async () => {
    const req = mockRequest({ method: 'POST', url: '/v1/auth/verify-otp' });
    const rep = mockReply(200);

    await auditLogger(req as any, rep as any);

    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('TIDAK mencatat route /v1/auth/logout secara otomatis', async () => {
    const req = mockRequest({ method: 'POST', url: '/v1/auth/logout' });
    const rep = mockReply(200);

    await auditLogger(req as any, rep as any);

    expect(mockedDb.insert).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Test 8: Tidak crash saat DB error
// ============================================================================

describe('auditLogger — graceful DB error handling', () => {
  it('TIDAK throw error saat db.insert gagal', async () => {
    valuesMock.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = mockRequest({ method: 'POST', url: '/v1/admin/cans' });
    const rep = mockReply(201);
    const logErrorSpy = req.log.error;

    await expect(auditLogger(req as any, rep as any)).resolves.toBeUndefined();

    expect(logErrorSpy).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Audit Logger Insert Failed'
    );
  });
});

// ============================================================================
// Test 9: sumber alamat IP — header X-Forwarded-For TIDAK dibaca langsung
// ============================================================================
//
// Sebelum perbaikan, middleware ini membaca `request.headers['x-forwarded-for']`
// mentah-mentah. Akibatnya:
//   1. klien bisa mengarang alamat IP (header dikirim sendiri oleh pemanggil);
//   2. nginx menambahkan alamat asli di belakangnya, jadi yang tersimpan berupa
//      daftar "1.2.3.4, 114.10.4.212" — bukan satu alamat;
//   3. daftar itu bisa melewati varchar(45) dan membuat baris audit ditolak DB.
// Sumber kebenaran sekarang hanya `request.ip`, yang diisi Fastify dari
// X-Forwarded-For HANYA bila koneksi datang dari proxy tepercaya (trustProxy).

describe('auditLogger — sumber alamat IP', () => {
  it('MENGABAIKAN header x-forwarded-for dan memakai request.ip', async () => {
    const req = mockRequest({
      method: 'POST',
      url: '/v1/admin/cans',
      headers: { 'x-forwarded-for': '1.2.3.4' },
      ip: '9.9.9.9',
    });
    const rep = mockReply(201);

    await auditLogger(req as any, rep as any);

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: '9.9.9.9' })
    );
  });

  it('header berisi daftar panjang tidak masuk ke kolom audit', async () => {
    // 54 karakter — melebihi varchar(45) dan dulu memicu SQLSTATE 22001.
    const forged = '1.2.3.4, 5.6.7.8, 9.10.11.12, 13.14.15.16, 17.18.19.20';
    const req = mockRequest({
      method: 'POST',
      url: '/v1/admin/cans',
      headers: { 'x-forwarded-for': forged },
      ip: '9.9.9.9',
    });
    const rep = mockReply(201);

    await auditLogger(req as any, rep as any);

    const stored = valuesMock.mock.calls[0][0].ipAddress;
    expect(stored).toBe('9.9.9.9');
    expect(stored).not.toContain('1.2.3.4');
    expect(stored.length).toBeLessThanOrEqual(45);
  });

  it('AUTH_FAILED (401/403) juga memakai request.ip', async () => {
    const req = mockRequest({
      method: 'POST',
      url: '/v1/admin/cans',
      headers: { 'x-forwarded-for': '1.2.3.4' },
      ip: '9.9.9.9',
    });
    const rep = mockReply(403);

    await auditLogger(req as any, rep as any);

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'AUTH_FAILED', ipAddress: '9.9.9.9' })
    );
  });
});
