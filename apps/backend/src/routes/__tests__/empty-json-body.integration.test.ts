import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import { closeDbConnection } from '../../config/database';
import { disconnectRedis } from '../../config/redis';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await disconnectRedis();
  await closeDbConnection();
});

// Klien mobile memasang `Content-Type: application/json` walau tidak mengirim
// body (mis. POST /mobile/cans/:canId/ensure-assignment dan
// POST /mobile/periods/complete). Parser bawaan Fastify menolaknya dengan
// FST_ERR_CTP_EMPTY_JSON_BODY sehingga permintaan gagal sebelum handler jalan.
describe('POST dengan Content-Type json tetapi body kosong', () => {
  it('diteruskan ke handler (bukan error parser body kosong)', async () => {
    const response = await request(app.server)
      .post('/v1/mobile/periods/complete')
      .set('Content-Type', 'application/json')
      .send('');

    const rawBody = JSON.stringify(response.body);
    expect(rawBody).not.toContain('FST_ERR_CTP_EMPTY_JSON_BODY');
    expect(rawBody).not.toContain('Body cannot be empty');
    // Tanpa token, route ini berhenti di autentikasi — bukan 400 parser.
    expect(response.status).not.toBe(400);
  });

  it('tetap menolak JSON yang rusak dengan 400', async () => {
    const response = await request(app.server)
      .post('/v1/mobile/periods/complete')
      .set('Content-Type', 'application/json')
      .send('{"purpose": ');

    expect(response.status).toBe(400);
    expect(response.body?.error?.code).toBe('INVALID_JSON');
  });
});
