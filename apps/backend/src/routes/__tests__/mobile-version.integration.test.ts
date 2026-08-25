import Fastify from 'fastify';
import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { versionRoutes } from '../mobile/version';

/**
 * Endpoint versi PUBLIK & self-contained (tanpa DB/Redis) — diuji dengan
 * instance Fastify minimal, sehingga bisa jalan di mesin mana pun.
 */
let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  await app.register(versionRoutes, { prefix: '/v1/mobile' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Mobile Version Endpoint (fitur update-in-app Tingkat 1)', () => {
  it('mengembalikan info rilis publik dalam bentuk snake_case', async () => {
    const response = await request(app.server).get('/v1/mobile/version');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const data = response.body.data;
    expect(data.version).toBe('1.1.1');
    expect(data.version_code).toBe(18);
    expect(data.apk_url).toContain('lazisnu-1.1.1.apk');
    expect(data.apk_url).toMatch(/^https:\/\//);
    expect(typeof data.changelog).toBe('string');
    expect(data.minimum_version_code).toBe(0);
  });
});
