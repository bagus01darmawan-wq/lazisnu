/**
 * TC-WA-FONNTE (P1-B3): sendTemplateMessage dengan WA_PROVIDER=fonnte
 * harus throw AppError UNSUPPORTED_OPERATION — template message hanya
 * didukung oleh provider Meta (lihat whatsapp.ts L223-225).
 */

jest.mock('../../config/env', () => ({
  config: {
    NODE_ENV: 'test',
    PORT: '3001',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: undefined,
    JWT_SECRET: 'a'.repeat(32),
    JWT_EXPIRES_IN: '7d',
    JWT_ACCESS_SECRET: 'b'.repeat(32),
    JWT_REFRESH_SECRET: 'c'.repeat(32),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '365d',
    JWT_REFRESH_TTL_PETUGAS: '365d',
    CORS_ORIGINS: '*',
    API_BASE_URL: 'http://localhost:3001',
    WA_PROVIDER: 'fonnte',
    WA_BUSINESS_API_URL: 'https://api.fonnte.com',
    WA_PHONE_NUMBER_ID: '',
    WA_ACCESS_TOKEN: 'dummy-fonnte-token',
    APP_SECRET: 'a'.repeat(32),
  },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../services/queues', () => ({
  addWhatsAppJob: jest.fn(),
}));

jest.mock('../../config/database', () => {
  const values = jest.fn().mockResolvedValue(undefined);
  return {
    db: { insert: jest.fn().mockReturnValue({ values }) },
    closeDbConnection: jest.fn().mockResolvedValue(undefined),
    testConnection: jest.fn().mockResolvedValue(true),
  };
});

import { sendTemplateMessage } from '../../services/whatsapp';

describe('whatsapp — sendTemplateMessage (WA_PROVIDER=fonnte)', () => {
  it('P1-B3: throws UNSUPPORTED_OPERATION (template tidak didukung Fonnte)', async () => {
    await expect(
      sendTemplateMessage('081234567890', 'collection_receipt', { name: 'Budi' }, 'col-1')
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_OPERATION',
      statusCode: 400,
      name: 'AppError',
    });
  });
});
