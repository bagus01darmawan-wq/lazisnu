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

describe('Health Check Endpoint (Integration)', () => {
  it('should return 200 and status ok', async () => {
    const response = await request(app.server).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('timestamp');
  });
});
