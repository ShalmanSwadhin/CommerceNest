import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { hasDatabase } from './test/setup.js';
import { initRedis } from './lib/redis.js';

const app = createApp();

describe('GET /api/health', () => {
  beforeAll(async () => {
    await initRedis();
  });

  it('returns ok payload', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe('commercenest-api');
    expect(res.body.brand).toBe('CommerceNest');
  });
});

describe('POST /api/auth/login', () => {
  it.skipIf(!hasDatabase)('logs in seeded master admin', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'admin@commercenest.com',
      password: 'Admin123!',
    });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('MASTER_ADMIN');
    expect(res.body.accessToken).toBeTruthy();
  });

  it('rejects invalid credentials without DB dependency when body invalid', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'not-an-email',
      password: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('payment approve requires auth', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/store/clxxxxxxxxxxxxxxxxxxxx/payments/bkash/approve')
      .send({ orderId: 'clxxxxxxxxxxxxxxxxxxxx' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('tenant isolation (Store A cannot access Store B products)', () => {
  it.skipIf(!hasDatabase)(
    'returns 403 TENANT_MISMATCH for cross-store product access',
    async () => {
      const loginA = await request(app).post('/api/auth/login').send({
        email: 'owner@techworld.bd',
        password: 'Owner123!',
      });
      expect(loginA.status).toBe(200);
      const tokenA = loginA.body.accessToken as string;
      const storeAId = loginA.body.user.storeId as string;

      const loginB = await request(app).post('/api/auth/login').send({
        email: 'owner@rahimmobile.bd',
        password: 'Owner123!',
      });
      expect(loginB.status).toBe(200);
      const storeBId = loginB.body.user.storeId as string;

      expect(storeAId).toBeTruthy();
      expect(storeBId).toBeTruthy();
      expect(storeAId).not.toBe(storeBId);

      // Store A token attempting Store B path
      const res = await request(app)
        .get(`/api/store/${storeBId}/products`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('TENANT_MISMATCH');
    },
  );
});
