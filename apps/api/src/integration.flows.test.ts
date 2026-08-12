import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { hasDatabase } from './test/setup.js';
import { initRedis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { hashPassword } from './lib/password.js';

/** Recursively checks a JSON value never contains a `passwordHash` key. */
function assertNoPasswordHash(value: unknown, path = '$'): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoPasswordHash(v, `${path}[${i}]`));
    return;
  }
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'passwordHash') {
      throw new Error(`Found leaked passwordHash at ${path}.${key}`);
    }
    assertNoPasswordHash(v, `${path}.${key}`);
  }
}

const app = createApp();

describe.skipIf(!hasDatabase)('CommerceNest integration flows', () => {
  beforeAll(async () => {
    await initRedis();
  });

  it('master admin login + platform analytics', async () => {
    const login = await request(app).post('/api/auth/login').send({
      email: 'admin@commercenest.com',
      password: 'Admin123!',
    });
    expect(login.status).toBe(200);
    const token = login.body.accessToken as string;

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    const meUser = me.body.user ?? me.body;
    expect(meUser.role).toBe('MASTER_ADMIN');

    const summary = await request(app)
      .get('/api/admin/analytics/summary')
      .set('Authorization', `Bearer ${token}`);
    expect(summary.status).toBe(200);
    const storeTotal = Object.values(
      (summary.body.storesByStatus ?? {}) as Record<string, number>,
    ).reduce((a: number, b) => a + Number(b), 0);
    expect(storeTotal || summary.body.totalOrders).toBeTruthy();
  });

  it('store A cannot read store B products (tenant isolation)', async () => {
    const loginA = await request(app).post('/api/auth/login').send({
      email: 'owner@techworld.bd',
      password: 'Owner123!',
    });
    const loginB = await request(app).post('/api/auth/login').send({
      email: 'owner@rahimmobile.bd',
      password: 'Owner123!',
    });
    expect(loginA.status).toBe(200);
    expect(loginB.status).toBe(200);

    const tokenA = loginA.body.accessToken as string;
    const storeBId = loginB.body.user.storeId as string;

    const res = await request(app)
      .get(`/api/store/${storeBId}/products`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TENANT_MISMATCH');
  });

  it('store A is blocked from every store-scoped resource type on store B (tenant isolation)', async () => {
    const loginA = await request(app).post('/api/auth/login').send({
      email: 'owner@techworld.bd',
      password: 'Owner123!',
    });
    const loginB = await request(app).post('/api/auth/login').send({
      email: 'owner@rahimmobile.bd',
      password: 'Owner123!',
    });
    expect(loginA.status).toBe(200);
    expect(loginB.status).toBe(200);

    const tokenA = loginA.body.accessToken as string;
    const storeBId = loginB.body.user.storeId as string;

    const reads: Array<[string, string]> = [
      ['GET', '/orders'],
      ['GET', '/customers'],
      ['GET', '/media'],
      ['GET', '/cms'],
      ['GET', '/theme/current'],
      ['GET', '/staff'],
      ['GET', '/settings/business'],
      ['GET', '/analytics/summary'],
      ['GET', '/coupons'],
      ['GET', '/returns'],
      ['GET', '/categories'],
      ['GET', '/onboarding-checklist'],
    ];
    for (const [method, path] of reads) {
      const r = await request(app)
        [method.toLowerCase() as 'get'](`/api/store/${storeBId}${path}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(
        r.status,
        `${method} ${path} should be blocked cross-store, got ${r.status}: ${JSON.stringify(r.body)}`,
      ).toBe(403);
      expect(r.body.error.code).toBe('TENANT_MISMATCH');
    }

    const writes: Array<[string, string, Record<string, unknown>]> = [
      ['POST', '/products', { name: 'x', slug: 'x', basePrice: 1, variants: [{ sku: 'x' }] }],
      ['POST', '/categories', { name: 'x', slug: 'x' }],
      ['POST', '/coupons', { code: 'HACK10', discountType: 'PERCENTAGE', discountValue: 10 }],
      ['PATCH', '/settings/business', { name: 'Hacked name' }],
      ['PUT', '/theme/draft', { layout: {}, themeSettings: {} }],
      ['POST', '/theme/publish', {}],
    ];
    for (const [method, path, body] of writes) {
      const r = await request(app)
        [method.toLowerCase() as 'post'](`/api/store/${storeBId}${path}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(body);
      expect(
        r.status,
        `${method} ${path} should be blocked cross-store, got ${r.status}: ${JSON.stringify(r.body)}`,
      ).toBe(403);
      expect(r.body.error.code).toBe('TENANT_MISMATCH');
    }
  });

  it('unauthenticated and cross-role requests are rejected on protected APIs', async () => {
    const loginA = await request(app).post('/api/auth/login').send({
      email: 'owner@techworld.bd',
      password: 'Owner123!',
    });
    const storeAId = loginA.body.user.storeId as string;

    // Unauthenticated -> store admin API
    const noAuth = await request(app).get(`/api/store/${storeAId}/orders`);
    expect(noAuth.status).toBe(401);

    // Unauthenticated -> master admin API
    const noAuthAdmin = await request(app).get('/api/admin/stores');
    expect(noAuthAdmin.status).toBe(401);

    // Store staff -> master admin API
    const tokenA = loginA.body.accessToken as string;
    const staffToAdmin = await request(app)
      .get('/api/admin/stores')
      .set('Authorization', `Bearer ${tokenA}`);
    expect([401, 403]).toContain(staffToAdmin.status);

    // Garbage bearer token -> protected API
    const badToken = await request(app)
      .get(`/api/store/${storeAId}/orders`)
      .set('Authorization', 'Bearer not-a-real-token');
    expect(badToken.status).toBe(401);
  });

  it('customer passwordHash is never returned in store-dashboard API responses', async () => {
    const login = await request(app).post('/api/auth/login').send({
      email: 'owner@techworld.bd',
      password: 'Owner123!',
    });
    expect(login.status).toBe(200);
    const token = login.body.accessToken as string;
    const storeId = login.body.user.storeId as string;

    const list = await request(app)
      .get(`/api/store/${storeId}/customers`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    assertNoPasswordHash(list.body);

    const firstCustomerId = (list.body.items ?? list.body)[0]?.id as
      | string
      | undefined;
    if (firstCustomerId) {
      const detail = await request(app)
        .get(`/api/store/${storeId}/customers/${firstCustomerId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(detail.status).toBe(200);
      assertNoPasswordHash(detail.body);
    }

    const orders = await request(app)
      .get(`/api/store/${storeId}/orders`)
      .set('Authorization', `Bearer ${token}`);
    expect(orders.status).toBe(200);
    assertNoPasswordHash(orders.body);

    const firstOrderId = (orders.body.items ?? orders.body)[0]?.id as
      | string
      | undefined;
    if (firstOrderId) {
      const orderDetail = await request(app)
        .get(`/api/store/${storeId}/orders/${firstOrderId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(orderDetail.status).toBe(200);
      assertNoPasswordHash(orderDetail.body);
    }
  });

  it('INVENTORY_MANAGER cannot read orders, customers, or support tickets (least-privilege RBAC)', async () => {
    const ownerLogin = await request(app).post('/api/auth/login').send({
      email: 'owner@techworld.bd',
      password: 'Owner123!',
    });
    const storeId = ownerLogin.body.user.storeId as string;

    const email = `inventory-rbac-test-${Date.now()}@techworld.bd`;
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword('Inventory123!'),
        name: 'Inventory Test',
        role: 'INVENTORY_MANAGER',
        storeId,
        status: 'ACTIVE',
      },
    });

    const login = await request(app).post('/api/auth/login').send({
      email,
      password: 'Inventory123!',
    });
    expect(login.status).toBe(200);
    const token = login.body.accessToken as string;

    const blocked: Array<[string, string]> = [
      ['GET', '/orders'],
      ['GET', '/customers'],
      ['GET', '/support-tickets'],
    ];
    for (const [method, path] of blocked) {
      const r = await request(app)
        [method.toLowerCase() as 'get'](`/api/store/${storeId}${path}`)
        .set('Authorization', `Bearer ${token}`);
      expect(
        r.status,
        `INVENTORY_MANAGER should be blocked from ${method} ${path}, got ${r.status}`,
      ).toBe(403);
    }

    // Sanity check: inventory manager's actual domain (products) still works.
    const products = await request(app)
      .get(`/api/store/${storeId}/products`)
      .set('Authorization', `Bearer ${token}`);
    expect(products.status).toBe(200);
  });

  it('storefront home uses published theme only + lists products', async () => {
    const home = await request(app).get('/api/storefront/techworld-bd/home');
    expect(home.status).toBe(200);
    expect(home.body.store.slug).toBe('techworld-bd');
    expect(home.body.featuredProducts?.length).toBeGreaterThan(0);
    if (home.body.theme) {
      expect(home.body.theme.status).toBe('PUBLISHED');
      expect(home.body.theme.themeSettings).toBeTruthy();
    }
  });

  it('MANUAL_BKASH checkout creates PENDING_VERIFICATION order; staff can approve', async () => {
    const products = await request(app).get(
      '/api/storefront/techworld-bd/products?limit=1',
    );
    expect(products.status).toBe(200);
    const list = products.body.items ?? products.body.data ?? products.body;
    const product = Array.isArray(list) ? list[0] : null;
    expect(product).toBeTruthy();
    const variant = product.variants?.[0];
    expect(variant?.id).toBeTruthy();

    const checkout = await request(app)
      .post('/api/storefront/techworld-bd/checkout')
      .send({
        paymentMethod: 'MANUAL_BKASH',
        customerName: 'Test Buyer',
        customerPhone: '01712345678',
        preferredLocale: 'bn',
        deliveryAddress: {
          label: 'Home',
          line1: 'House 1, Road 2',
          area: 'Banani',
          district: 'Dhaka',
          division: 'Dhaka',
          postalCode: '1213',
          recipientName: 'Test Buyer',
          recipientPhone: '01712345678',
        },
        items: [
          {
            productId: product.id,
            variantId: variant.id,
            quantity: 1,
          },
        ],
        bkashTxnId: 'TXNTEST123456',
        bkashSenderPhone: '01712345678',
      });

    if (![200, 201].includes(checkout.status)) {
      // Surface validation errors for debugging
      throw new Error(
        `Checkout failed ${checkout.status}: ${JSON.stringify(checkout.body)}`,
      );
    }
    const orderId = (checkout.body.orderId ??
      checkout.body.order?.id) as string;
    expect(orderId).toBeTruthy();
    expect(checkout.body.paymentStatus).toBe('PENDING_VERIFICATION');

    const staffLogin = await request(app).post('/api/auth/login').send({
      email: 'owner@techworld.bd',
      password: 'Owner123!',
    });
    const token = staffLogin.body.accessToken as string;
    const storeId = staffLogin.body.user.storeId as string;

    const pending = await request(app)
      .get(`/api/store/${storeId}/payments/pending-bkash`)
      .set('Authorization', `Bearer ${token}`);
    expect(pending.status).toBe(200);

    const approve = await request(app)
      .post(`/api/store/${storeId}/payments/bkash/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId, approved: true });
    expect(approve.status).toBe(200);
    expect(approve.body.paymentStatus).toBe('APPROVED');
  });

  it('resolve-host returns store for seeded subdomain hostname', async () => {
    const res = await request(app)
      .post('/api/storefront/resolve-host')
      .send({ host: 'techworld-bd.commercenest.local' });
    expect(res.status).toBe(200);
    expect(res.body.slug || res.body.store?.slug).toBe('techworld-bd');
  });

  it('master admin can create announcement', async () => {
    const login = await request(app).post('/api/auth/login').send({
      email: 'admin@commercenest.com',
      password: 'Admin123!',
    });
    const token = login.body.accessToken as string;
    const created = await request(app)
      .post('/api/admin/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Maintenance window',
        body: 'Platform maintenance tonight 2-3am BD time.',
        status: 'PUBLISHED',
        audience: { all: true },
      });
    expect([200, 201]).toContain(created.status);
    expect(created.body.title).toBe('Maintenance window');
  });
});
