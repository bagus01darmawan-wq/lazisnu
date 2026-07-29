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
