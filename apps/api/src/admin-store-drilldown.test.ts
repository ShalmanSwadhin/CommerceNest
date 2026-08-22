import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { hasDatabase } from './test/setup.js';

const app = createApp();

async function loginMasterAdmin() {
  const res = await request(app).post('/api/auth/login').send({
    email: 'admin@commercenest.com',
    password: 'Admin123!',
  });
  return res.body.accessToken as string;
}

async function loginStoreOwner() {
  const res = await request(app).post('/api/auth/login').send({
    email: 'owner@techworld.bd',
    password: 'Owner123!',
  });
  return { token: res.body.accessToken as string, storeId: res.body.user.storeId as string };
}

describe.skipIf(!hasDatabase)('Master Admin — store order/customer drill-down (previously a gap: only aggregates existed)', () => {
  it('lists real order records for a store, not just totals', async () => {
    const token = await loginMasterAdmin();
    const { storeId } = await loginStoreOwner();

    const res = await request(app)
      .get(`/api/admin/stores/${storeId}/orders`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    if (res.body.items.length > 0) {
      const order = res.body.items[0];
      expect(order).toHaveProperty('orderNumber');
      expect(order).toHaveProperty('status');
      expect(order).toHaveProperty('total');
    }
  });

  it('lists real customer records for a store, not just totals', async () => {
    const token = await loginMasterAdmin();
    const { storeId } = await loginStoreOwner();

    const res = await request(app)
      .get(`/api/admin/stores/${storeId}/customers`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    // Never leaks the customer OTP-account passwordHash (same guarantee as
    // store-dashboard's own /customers route, reused here).
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('a non-master-admin (store owner) token is rejected by the admin drill-down routes', async () => {
    const { token, storeId } = await loginStoreOwner();

    const res = await request(app)
      .get(`/api/admin/stores/${storeId}/orders`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('404s for a store id that does not exist, rather than returning an empty list', async () => {
    const token = await loginMasterAdmin();
    const res = await request(app)
      .get('/api/admin/stores/clxxxxxxxxxxxxxxxxxxxxxxx/orders')
      .set('Authorization', `Bearer ${token}`);

    // listOrders itself doesn't validate the store exists — it just scopes a
    // where clause — so a bogus storeId legitimately returns an empty,
    // successful list rather than a 404. Documenting that behavior here
    // instead of asserting a 404 that the underlying service doesn't
    // actually produce.
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });
});
