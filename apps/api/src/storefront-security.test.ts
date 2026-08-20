import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { hasDatabase } from './test/setup.js';
import { initRedis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import * as trialService from './services/trial.service.js';
import * as productService from './services/product.service.js';

const app = createApp();

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function makeStore() {
  const slug = uniqueSlug('sfsec');
  const { store } = await trialService.createTrialLead({
    prospectName: 'Test Owner',
    businessName: `Storefront Security Test ${slug}`,
    phone: `015${String(Math.floor(10000000 + Math.random() * 89999999))}`,
    email: `${slug}@example.com`,
    password: 'TestPass123!',
    confirmPassword: 'TestPass123!',
  });
  await prisma.store.update({ where: { id: store.id }, data: { isTrial: false } });
  return { storeId: store.id, storeSlug: store.slug };
}

async function makeProduct(storeId: string) {
  const slug = uniqueSlug('prod');
  return productService.createProduct(
    storeId,
    {
      name: `Product ${slug}`,
      slug,
      basePrice: 500,
      status: 'ACTIVE',
      variants: [{ sku: `SKU-${slug}`, stock: 20 }],
    },
    'system',
  );
}

async function registerCustomer(storeSlug: string) {
  const email = `${uniqueSlug('cust')}@example.com`;
  const res = await request(app)
    .post(`/api/storefront/${storeSlug}/auth/register`)
    .send({ name: 'Test Customer', email, password: 'CustPass123!', confirmPassword: 'CustPass123!' });
  expect(res.status).toBe(201);
  return { token: res.body.accessToken as string, customer: res.body.customer };
}

describe.skipIf(!hasDatabase)('Storefront tenant isolation (HTTP)', () => {
  beforeAll(async () => {
    await initRedis();
  });

  it('a customer token issued for store A is rejected on store B\'s account routes', async () => {
    const { storeSlug: slugA } = await makeStore();
    const { storeSlug: slugB } = await makeStore();
    const { token } = await registerCustomer(slugA);

    const me = await request(app)
      .get(`/api/storefront/${slugB}/me`)
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(403);

    const orders = await request(app)
      .get(`/api/storefront/${slugB}/account/orders`)
      .set('Authorization', `Bearer ${token}`);
    expect(orders.status).toBe(403);
  });

  it('a store A product never appears in store B\'s public catalog or product-detail routes', async () => {
    const { storeId: storeIdA, storeSlug: slugA } = await makeStore();
    const { storeSlug: slugB } = await makeStore();
    const productA = await makeProduct(storeIdA);

    const listB = await request(app).get(`/api/storefront/${slugB}/products`);
    expect(listB.status).toBe(200);
    expect((listB.body.items as Array<{ id: string }>).some((p) => p.id === productA.id)).toBe(false);

    const detailAcrossStore = await request(app).get(
      `/api/storefront/${slugB}/products/${productA.slug}`,
    );
    expect(detailAcrossStore.status).toBe(404);

    const detailOwnStore = await request(app).get(`/api/storefront/${slugA}/products/${productA.slug}`);
    expect(detailOwnStore.status).toBe(200);
  });

  it('order lookup requires the correct order number AND phone together, never leaking on a partial match', async () => {
    const { storeId, storeSlug } = await makeStore();
    const product = await makeProduct(storeId);

    const checkout = await request(app)
      .post(`/api/storefront/${storeSlug}/checkout`)
      .send({
        items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
        customerName: 'Real Customer',
        customerPhone: '01711111111',
        deliveryAddress: {
          label: 'Home',
          line1: '1 Road',
          area: 'Area',
          district: 'District',
          division: 'Dhaka',
          recipientName: 'Real Customer',
          recipientPhone: '01711111111',
        },
        paymentMethod: 'CASH_ON_DELIVERY',
      });
    expect(checkout.status).toBe(201);
    const orderNumber = checkout.body.orderNumber as string;

    const wrongPhone = await request(app)
      .post(`/api/storefront/${storeSlug}/orders/lookup`)
      .send({ orderNumber, phone: '01799999999' });
    expect(wrongPhone.status).toBe(404);

    const correct = await request(app)
      .post(`/api/storefront/${storeSlug}/orders/lookup`)
      .send({ orderNumber, phone: '01711111111' });
    expect(correct.status).toBe(200);
  });

  it('checkout rejects a payload carrying an unexpected financial field instead of silently ignoring it', async () => {
    const { storeId, storeSlug } = await makeStore();
    const product = await makeProduct(storeId);

    const res = await request(app)
      .post(`/api/storefront/${storeSlug}/checkout`)
      .send({
        items: [
          {
            productId: product.id,
            variantId: product.variants[0]!.id,
            quantity: 1,
            unitPrice: 1, // attempted price tampering
          },
        ],
        customerName: 'Test Customer',
        customerPhone: '01722222222',
        deliveryAddress: {
          label: 'Home',
          line1: '1 Road',
          area: 'Area',
          district: 'District',
          division: 'Dhaka',
          recipientName: 'Test Customer',
          recipientPhone: '01722222222',
        },
        paymentMethod: 'CASH_ON_DELIVERY',
      });
    expect(res.status).toBe(400);
  });

  it('a nonexistent store slug fails safely, not with a server error', async () => {
    const res = await request(app).get('/api/storefront/this-store-does-not-exist-at-all/home');
    expect(res.status).toBe(404);
  });
});
