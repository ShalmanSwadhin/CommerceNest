import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { hasDatabase } from './test/setup.js';
import { prisma } from './lib/prisma.js';
import * as productService from './services/product.service.js';
import * as trialService from './services/trial.service.js';

const app = createApp();

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function address(phone: string) {
  return {
    label: 'Home',
    line1: '12 Test Road',
    area: 'Test Area',
    district: 'Test District',
    division: 'Dhaka',
    recipientName: 'Test Customer',
    recipientPhone: phone,
  };
}

async function makeStoreWithProduct() {
  const slug = uniqueSlug('checkoutlink');
  const { store } = await trialService.createTrialLead({
    prospectName: 'Test Owner',
    businessName: `Checkout Link Test ${slug}`,
    phone: `018${String(Math.floor(10000000 + Math.random() * 89999999))}`,
    email: `${slug}@example.com`,
    password: 'TestPass123!',
    confirmPassword: 'TestPass123!',
  });
  await prisma.store.update({ where: { id: store.id }, data: { isTrial: false } });
  const product = await productService.createProduct(
    store.id,
    {
      name: 'Checkout Link Product',
      slug: uniqueSlug('clprod'),
      basePrice: 500,
      status: 'ACTIVE',
      variants: [{ sku: uniqueSlug('SKU'), stock: 20 }],
    },
    'system',
  );
  return { storeId: store.id, storeSlug: store.slug, product };
}

async function registerCustomer(storeSlug: string, email: string) {
  const res = await request(app).post(`/api/storefront/${storeSlug}/auth/register`).send({
    name: 'Session Customer',
    email,
    password: 'TestPass123!',
    confirmPassword: 'TestPass123!',
  });
  expect(res.status).toBe(201);
  return { token: res.body.accessToken as string, customerId: res.body.customer.id as string };
}

describe.skipIf(!hasDatabase)(
  'Checkout <-> account order-history linking — root cause: /checkout had no auth awareness at all and matched the order to a Customer purely by the phone typed into the form, while email/password registration (the primary signup path) never requires a phone',
  () => {
    it('a signed-in customer\'s order is linked to their real account, even when the checkout phone does not match anything on that account (account has no phone at all)', async () => {
      const { storeSlug, product } = await makeStoreWithProduct();
      const { token, customerId } = await registerCustomer(storeSlug, `${uniqueSlug('cust')}@example.com`);

      const checkoutRes = await request(app)
        .post(`/api/storefront/${storeSlug}/checkout`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
          customerName: 'Session Customer',
          customerPhone: '01999999999', // never set on the account
          deliveryAddress: address('01999999999'),
          paymentMethod: 'CASH_ON_DELIVERY',
        });
      expect(checkoutRes.status).toBe(201);

      const order = await prisma.order.findUniqueOrThrow({ where: { id: checkoutRes.body.orderId } });
      expect(order.customerId).toBe(customerId);

      const ordersRes = await request(app)
        .get(`/api/storefront/${storeSlug}/account/orders`)
        .set('Authorization', `Bearer ${token}`);
      expect(ordersRes.status).toBe(200);
      expect(ordersRes.body.items.some((o: { id: string }) => o.id === checkoutRes.body.orderId)).toBe(true);
    });

    it('placing two orders in the same session both land on the same account, not two different customer rows', async () => {
      const { storeSlug, product } = await makeStoreWithProduct();
      const { token, customerId } = await registerCustomer(storeSlug, `${uniqueSlug('cust2')}@example.com`);

      for (const phone of ['01700000001', '01700000002']) {
        const res = await request(app)
          .post(`/api/storefront/${storeSlug}/checkout`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
            customerName: 'Session Customer',
            customerPhone: phone,
            deliveryAddress: address(phone),
            paymentMethod: 'CASH_ON_DELIVERY',
          });
        expect(res.status).toBe(201);
        const order = await prisma.order.findUniqueOrThrow({ where: { id: res.body.orderId } });
        expect(order.customerId).toBe(customerId);
      }

      const ordersRes = await request(app)
        .get(`/api/storefront/${storeSlug}/account/orders`)
        .set('Authorization', `Bearer ${token}`);
      expect(ordersRes.body.total).toBe(2);
    });

    it('guest checkout (no token at all) is unaffected — still resolves/creates a customer by phone', async () => {
      const { storeSlug, product } = await makeStoreWithProduct();
      const phone = '01611111111';

      const res = await request(app)
        .post(`/api/storefront/${storeSlug}/checkout`)
        .send({
          items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
          customerName: 'Guest Customer',
          customerPhone: phone,
          deliveryAddress: address(phone),
          paymentMethod: 'CASH_ON_DELIVERY',
        });
      expect(res.status).toBe(201);

      const order = await prisma.order.findUniqueOrThrow({ where: { id: res.body.orderId } });
      const customer = await prisma.customer.findUniqueOrThrow({ where: { id: order.customerId } });
      expect(customer.phone).toBe(phone);
      expect(customer.passwordHash).toBeNull(); // a real guest row, not an account
    });

    it('an expired/garbage Authorization header never blocks checkout — falls back to guest resolution instead of erroring', async () => {
      const { storeSlug, product } = await makeStoreWithProduct();
      const phone = '01622222222';

      const res = await request(app)
        .post(`/api/storefront/${storeSlug}/checkout`)
        .set('Authorization', 'Bearer this-is-not-a-real-token')
        .send({
          items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
          customerName: 'Guest Customer',
          customerPhone: phone,
          deliveryAddress: address(phone),
          paymentMethod: 'CASH_ON_DELIVERY',
        });
      expect(res.status).toBe(201);
    });

    it('if the typed checkout phone already belongs to a different customer at this store, the signed-in account is never overwritten to claim it (no crash, no phone stolen)', async () => {
      const { storeId, storeSlug, product } = await makeStoreWithProduct();
      const collisionPhone = '01633333333';

      // A pre-existing guest customer already owns this phone (e.g. they
      // checked out before ever creating an account).
      await prisma.customer.create({
        data: { storeId, phone: collisionPhone, name: 'Existing Guest' },
      });

      const { token, customerId } = await registerCustomer(storeSlug, `${uniqueSlug('cust3')}@example.com`);
      const res = await request(app)
        .post(`/api/storefront/${storeSlug}/checkout`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
          customerName: 'Session Customer',
          customerPhone: collisionPhone,
          deliveryAddress: address(collisionPhone),
          paymentMethod: 'CASH_ON_DELIVERY',
        });
      expect(res.status).toBe(201);

      const order = await prisma.order.findUniqueOrThrow({ where: { id: res.body.orderId } });
      expect(order.customerId).toBe(customerId); // still linked to the real account

      const account = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
      expect(account.phone).toBeNull(); // never claimed the colliding phone
    });

    // No per-theme test variant needed, rather than duplicating the same
    // HTTP assertions under a different label: storefront.routes.ts's
    // /checkout and /account/orders handlers take only storeSlug + auth
    // state, never a theme/templateId — the same bug (and the same fix)
    // applies identically to every theme and every store. Confirmed live
    // against both a modern-commerce store (techworld-bd) and a
    // default-theme store (rahim-mobile) via manual end-to-end
    // verification against the running dev server before writing these.
  },
);
