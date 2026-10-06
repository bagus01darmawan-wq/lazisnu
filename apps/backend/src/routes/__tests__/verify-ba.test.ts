/**
 * C1-T5 (§14.9) — endpoint verifikasi QR BA: publik, minimal, tanpa bocor.
 * DB/service di-mock (kontrak HTTP yang diuji, bukan logika verifikasi —
 * itu di cosign.integration.test.ts).
 */
import request from 'supertest';
import { getApp, closeApp } from './helpers/app-helper';
import { verifyBaRecord } from '../../services/baPdfService';

jest.mock('../../services/baPdfService', () => ({
  verifyBaRecord: jest.fn(),
}));

const mockedVerify = verifyBaRecord as jest.Mock;

describe('GET /v1/verify/ba — publik & minimal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await closeApp();
  });

  test('tanpa token tetap 200 (publik)', async () => {
    mockedVerify.mockResolvedValue(true);
    const app = await getApp();
    const res = await request(app.server).get(
      '/v1/verify/ba?type=ppk&id=00000000-0000-0000-0000-000000000001&version=1&hash=ab',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { valid: true } });
  });

  test('respons hanya { valid } — tanpa nominal/nama/pihak', async () => {
    mockedVerify.mockResolvedValue(false);
    const app = await getApp();
    const res = await request(app.server).get('/v1/verify/ba?type=branch&id=x&version=1&hash=y');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data)).toEqual(['valid']);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/nominal|total|nama|name|phone|address|officer|branch/i);
  });

  test('tipe tak dikenal → valid:false (seragam, tanpa 400/404 pembeda)', async () => {
    const app = await getApp();
    const res = await request(app.server).get('/v1/verify/ba?type=saldo&id=x&version=1&hash=y');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ valid: false });
    expect(mockedVerify).not.toHaveBeenCalled();
  });
});
