import { sanitizeAuditData, insertActivityLog } from '../auditLogService';
import * as schema from '../../database/schema';

const valuesMock = jest.fn().mockResolvedValue(undefined);

jest.mock('../../config/database', () => ({
  db: {
    insert: jest.fn().mockImplementation(() => ({
      values: valuesMock,
    })),
  },
}));

const { db: mockedDb } = require('../../config/database');

describe('auditLogService — sanitizeAuditData', () => {
  it('harus meredaksi field sensitif di tingkat utama', () => {
    const raw = {
      password: 'my-secret-password',
      password_hash: 'hash-xyz',
      access_token: 'token-abc',
      refresh_token: 'refresh-xyz',
      token: 'jwt-123',
      authorization: 'Bearer foo',
      otp: '123456',
      secret: 'my-secret-key',
      normalField: 'safe value'
    };

    const sanitized = sanitizeAuditData(raw) as any;

    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.password_hash).toBe('[REDACTED]');
    expect(sanitized.access_token).toBe('[REDACTED]');
    expect(sanitized.refresh_token).toBe('[REDACTED]');
    expect(sanitized.token).toBe('[REDACTED]');
    expect(sanitized.authorization).toBe('[REDACTED]');
    expect(sanitized.otp).toBe('[REDACTED]');
    expect(sanitized.secret).toBe('[REDACTED]');
    expect(sanitized.normalField).toBe('safe value');
  });

  it('harus meredaksi secara rekursif pada nested object dan array', () => {
    const raw = {
      user: {
        fullName: 'Budi',
        password: 'nested-password',
      },
      tokens: [
        { type: 'access', token: 'token-1' },
        { type: 'refresh', token: 'token-2' }
      ],
      safeArray: ['one', 'two']
    };

    const sanitized = sanitizeAuditData(raw) as any;

    expect(sanitized.user.fullName).toBe('Budi');
    expect(sanitized.user.password).toBe('[REDACTED]');
    expect(sanitized.tokens[0].token).toBe('[REDACTED]');
    expect(sanitized.tokens[1].token).toBe('[REDACTED]');
    expect(sanitized.safeArray).toEqual(['one', 'two']);
  });
});

describe('auditLogService — sanitizeAuditData BigInt (regression cans.totalCollected)', () => {
  it('konversi BigInt ke Number agar aman di-JSON.stringify', () => {
    const raw = { totalCollected: BigInt(0), ownerName: 'Budi' };

    const sanitized = sanitizeAuditData(raw) as any;

    expect(sanitized.totalCollected).toBe(0);
    expect(typeof sanitized.totalCollected).toBe('number');
  });

  it('konversi BigInt secara rekursif di nested object & array', () => {
    const raw = {
      can: { totalCollected: BigInt(150000), collectionCount: 2 },
      history: [{ nominal: BigInt(50000) }, { nominal: BigInt(100000) }]
    };

    const sanitized = sanitizeAuditData(raw) as any;

    expect(sanitized.can.totalCollected).toBe(150000);
    expect(sanitized.history[0].nominal).toBe(50000);
    expect(sanitized.history[1].nominal).toBe(100000);
  });

  it('hasil sanitasi harus bisa di-JSON.stringify tanpa error (gejala produksi: "Do not know how to serialize a BigInt")', () => {
    const canRow = {
      id: '198d07b8-342b-4392-a1d5-bdd63906f4b6',
      ownerName: 'Helmy Mubarok1',
      totalCollected: BigInt(0),
      isActive: true,
    };

    const sanitized = sanitizeAuditData({ newData: canRow, oldData: { ...canRow } });

    expect(() => JSON.stringify(sanitized)).not.toThrow();
  });
});

describe('auditLogService — insertActivityLog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('harus menyimpan oldData & newData yang sudah disanitasi', async () => {
    const input = {
      userId: 'user-123',
      officerId: 'officer-456',
      actionType: 'LOGIN_SUCCESS',
      entityType: 'auth',
      entityId: null,
      oldData: { normal: 'old value', password: 'old password' },
      newData: { normal: 'new value', password: 'new password' },
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
    };

    await insertActivityLog(input);

    expect(mockedDb.insert).toHaveBeenCalledWith(schema.activityLogs);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        actionType: 'LOGIN_SUCCESS',
        oldData: { normal: 'old value', password: '[REDACTED]' },
        newData: { normal: 'new value', password: '[REDACTED]' },
      })
    );
  });
});
