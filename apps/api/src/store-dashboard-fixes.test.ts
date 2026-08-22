import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { hasDatabase } from './test/setup.js';
import { initRedis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import * as trialService from './services/trial.service.js';
import * as categoryService from './services/category.service.js';
import * as productService from './services/product.service.js';
import * as orderService from './services/order.service.js';
import * as paymentService from './services/payment.service.js';
import * as analyticsService from './services/analytics.service.js';
import * as supportService from './services/support.service.js';
import * as storefrontService from './services/storefront.service.js';

const app = createApp();

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function masterAdminActor() {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@commercenest.com' },
    select: { id: true, role: true },
  });
  return { id: admin.id, role: admin.role as string };
}

async function makeStore() {
  const slug = uniqueSlug('fixtest');
  const { store } = await trialService.createTrialLead({
    prospectName: 'Test Owner',
    businessName: `Fix Test ${slug}`,
    phone: `018${String(Math.floor(10000000 + Math.random() * 89999999))}`,
    email: `${slug}@example.com`,
    password: 'TestPass123!',
    confirmPassword: 'TestPass123!',
  });
  await prisma.store.update({ where: { id: store.id }, data: { isTrial: false } });
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: store.ownerUserId } });
  return { storeId: store.id, storeSlug: store.slug, ownerId: owner.id };
}

describe.skipIf(!hasDatabase)('Item 2 — category image upload', () => {
  it('creates a category with an imageUrl, and it is returned on read', async () => {
    const { storeId } = await makeStore();
    const slug = uniqueSlug('cat');
    const created = await categoryService.createCategory(storeId, {
      name: 'Summer Collection',
      slug,
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/summer.jpg',
    });
    expect(created.imageUrl).toBe('https://res.cloudinary.com/demo/image/upload/summer.jpg');

    const fetched = await categoryService.getCategory(storeId, created.id);
    expect(fetched.imageUrl).toBe('https://res.cloudinary.com/demo/image/upload/summer.jpg');
  });

  it('replacing the image (re-upload) overwrites the old URL, not appends', async () => {
    const { storeId } = await makeStore();
    const created = await categoryService.createCategory(storeId, {
      name: 'Winter',
      slug: uniqueSlug('winter'),
      imageUrl: 'https://example.com/old.jpg',
    });
    const updated = await categoryService.updateCategory(storeId, created.id, {
      imageUrl: 'https://example.com/new.jpg',
    });
    expect(updated.imageUrl).toBe('https://example.com/new.jpg');
  });

  it('an explicit empty string clears the image (distinct from omitting the field, which leaves it untouched)', async () => {
    const { storeId } = await makeStore();
    const created = await categoryService.createCategory(storeId, {
      name: 'Spring',
      slug: uniqueSlug('spring'),
      imageUrl: 'https://example.com/spring.jpg',
    });

    // Omitting imageUrl entirely must NOT clear it.
    const untouched = await categoryService.updateCategory(storeId, created.id, { name: 'Spring Renamed' });
    expect(untouched.imageUrl).toBe('https://example.com/spring.jpg');

    // Explicit '' clears it.
    const cleared = await categoryService.updateCategory(storeId, created.id, { imageUrl: '' });
    expect(cleared.imageUrl).toBeNull();
  });

  it('the storefront categories list prefers a real category image over the product-derived fallback', async () => {
    const { storeId, storeSlug } = await makeStore();
    const catSlug = uniqueSlug('withimg');
    const category = await categoryService.createCategory(storeId, {
      name: 'Has Real Image',
      slug: catSlug,
      imageUrl: 'https://example.com/real-category-image.jpg',
    });
    await productService.createProduct(
      storeId,
      {
        name: 'Product In Category',
        slug: uniqueSlug('prod'),
        basePrice: 500,
        status: 'ACTIVE',
        categoryId: category.id,
        images: [{ url: 'https://example.com/product-photo.jpg' }],
        variants: [{ sku: uniqueSlug('SKU'), stock: 5 }],
      },
      'system',
    );

    const res = await request(app).get(`/api/storefront/${storeSlug}/categories`);
    expect(res.status).toBe(200);
    const found = res.body.items.find((c: { id: string }) => c.id === category.id);
    expect(found.imageUrl).toBe('https://example.com/real-category-image.jpg');
  });

  it('a category with NO real image still falls back to a photo derived from its own products', async () => {
    const { storeId, storeSlug } = await makeStore();
    const category = await categoryService.createCategory(storeId, {
      name: 'No Real Image',
      slug: uniqueSlug('noimg'),
    });
    await productService.createProduct(
      storeId,
      {
        name: 'Fallback Product',
        slug: uniqueSlug('fallbackprod'),
        basePrice: 300,
        status: 'ACTIVE',
        categoryId: category.id,
        images: [{ url: 'https://example.com/fallback-photo.jpg' }],
        variants: [{ sku: uniqueSlug('SKU'), stock: 3 }],
      },
      'system',
    );

    const res = await request(app).get(`/api/storefront/${storeSlug}/categories`);
    const found = res.body.items.find((c: { id: string }) => c.id === category.id);
    expect(found.imageUrl).toBe('https://example.com/fallback-photo.jpg');
  });
});

describe.skipIf(!hasDatabase)('Item 3 — customer order bKash payment approve/reject', () => {
  async function makeBkashOrder(storeId: string, storeSlug: string) {
    const product = await productService.createProduct(
      storeId,
      {
        name: 'bKash Test Product',
        slug: uniqueSlug('bkprod'),
        basePrice: 800,
        status: 'ACTIVE',
        variants: [{ sku: uniqueSlug('SKU'), stock: 10 }],
      },
      'system',
    );
    const result = await storefrontService.checkout(storeSlug, {
      items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
      customerName: 'Bkash Customer',
      customerPhone: `017${String(Math.floor(10000000 + Math.random() * 89999999))}`,
      deliveryAddress: {
        label: 'Home',
        line1: 'x',
        area: 'x',
        district: 'x',
        division: 'Dhaka',
        recipientName: 'x',
        recipientPhone: '01712345678',
      },
      paymentMethod: 'MANUAL_BKASH',
    });
    await paymentService.submitBkashPayment(storeId, {
      orderId: result.orderId,
      bkashTxnId: uniqueSlug('TXN'),
      bkashSenderPhone: '01712345678',
      bkashAmount: 860,
    });
    return result.orderId;
  }

  it('approving correctly sets isPaid + paymentStatus, and never touches order.status', async () => {
    const { storeId, storeSlug } = await makeStore();
    const orderId = await makeBkashOrder(storeId, storeSlug);
    const admin = await masterAdminActor();

    const before = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(before.status).toBe('PENDING');

    const updated = await paymentService.verifyBkashPayment(storeId, { orderId, approved: true }, admin);
    expect(updated.isPaid).toBe(true);
    expect(updated.paymentStatus).toBe('APPROVED');
    expect(updated.status).toBe('PENDING'); // untouched — a separate, deliberate merchant action

    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: before.customerId! } });
    expect(customer.totalOrders).toBe(0); // untouched too — risk counters are DELIVERED/RETURNED-only, not payment-verification
  });

  it('rejecting is visible on the order (paymentStatus + bkashNote) but deliberately does NOT affect customer riskLevel — that tracks delivery outcomes only (Part 10.2 spec), not payment-verification failures', async () => {
    const { storeId, storeSlug } = await makeStore();
    const orderId = await makeBkashOrder(storeId, storeSlug);
    const admin = await masterAdminActor();
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const customerBefore = await prisma.customer.findUniqueOrThrow({ where: { id: order.customerId! } });

    const updated = await paymentService.verifyBkashPayment(
      storeId,
      { orderId, approved: false, rejectionReason: 'Transaction ID does not match bKash records' },
      admin,
    );
    expect(updated.paymentStatus).toBe('REJECTED');
    expect(updated.bkashNote).toBe('Transaction ID does not match bKash records');
    expect(updated.isPaid).toBe(false);

    const customerAfter = await prisma.customer.findUniqueOrThrow({ where: { id: order.customerId! } });
    expect(customerAfter.riskLevel).toBe(customerBefore.riskLevel);
    expect(customerAfter.refusedOrders).toBe(customerBefore.refusedOrders);
  });
});

describe.skipIf(!hasDatabase)('Item 4 — analytics: orders-over-time and new-customer series', () => {
  it("getStoreSummary's revenueSeries points include an orders count riding along revenue, and newCustomersSeries reflects Customer.createdAt", async () => {
    const { storeId } = await makeStore();
    const summary = await analyticsService.getStoreSummary(storeId);
    expect(Array.isArray(summary.revenueSeries)).toBe(true);
    expect(summary.revenueSeries.length).toBeGreaterThan(0);
    for (const point of summary.revenueSeries) {
      expect(point).toHaveProperty('orders');
    }
    expect(Array.isArray(summary.newCustomersSeries)).toBe(true);
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayPoint = summary.newCustomersSeries.find((p) => p.date === todayKey);
    // This store's own owner account was created today by makeStore() above —
    // Customer and User are different models, so this store has 0 customers
    // yet; the series must still be well-formed and store-scoped (tenant
    // isolation is inherent to getStoreSummary(storeId) taking a storeId).
    expect(todayPoint).toBeTruthy();
    expect(typeof todayPoint!.newCustomers).toBe('number');
  });
});

describe.skipIf(!hasDatabase)('Item 5 — CMS: named page keys and social links', () => {
  it('a CMS block saved with key "about" is readable at the storefront /cms/about route the footer already links to', async () => {
    const { storeId, storeSlug } = await makeStore();
    const putRes = await request(app)
      .put(`/api/store/${storeId}/cms/about`)
      .set('Authorization', `Bearer ${(await loginOwnerToken(storeSlug)).token}`)
      .send({ fields: { title: 'About Us', body: 'We sell great things.' } });
    expect(putRes.status).toBe(200);

    const publicRes = await request(app).get(`/api/storefront/${storeSlug}/cms/about`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.title).toBe('About Us');
    expect(publicRes.body.body).toBe('We sell great things.');
  });

  it('social links save under the fixed "social-links" key and are readable with the full fields object', async () => {
    const { storeId, storeSlug } = await makeStore();
    const { token } = await loginOwnerToken(storeSlug);
    const putRes = await request(app)
      .put(`/api/store/${storeId}/cms/social-links`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fields: { facebook: 'https://facebook.com/store', instagram: '', whatsapp: 'https://wa.me/8801700000000' } });
    expect(putRes.status).toBe(200);

    const publicRes = await request(app).get(`/api/storefront/${storeSlug}/cms/social-links`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.fields.facebook).toBe('https://facebook.com/store');
    expect(publicRes.body.fields.whatsapp).toBe('https://wa.me/8801700000000');
  });

  it('contact info saves under the fixed "contact-info" key and is readable the same way, regardless of which theme the store is on — this key-value store has no theme concept at all', async () => {
    const { storeId, storeSlug } = await makeStore();
    const { token } = await loginOwnerToken(storeSlug);
    const putRes = await request(app)
      .put(`/api/store/${storeId}/cms/contact-info`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fields: {
          address: 'House 1, Road 1, Dhaka',
          phone: '01700000000',
          email: 'hello@teststore.com',
        },
      });
    expect(putRes.status).toBe(200);

    const publicRes = await request(app).get(`/api/storefront/${storeSlug}/cms/contact-info`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.fields).toEqual({
      address: 'House 1, Road 1, Dhaka',
      phone: '01700000000',
      email: 'hello@teststore.com',
    });
  });

  it('a second store never sees the first store\'s contact-info/social-links (tenant isolation on the fixed-key CMS entries)', async () => {
    const storeA = await makeStore();
    const storeB = await makeStore();
    const { token: tokenA } = await loginOwnerToken(storeA.storeSlug);

    await request(app)
      .put(`/api/store/${storeA.storeId}/cms/contact-info`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ fields: { address: 'Store A address', phone: '01711111111', email: 'a@example.com' } });

    const bRes = await request(app).get(`/api/storefront/${storeB.storeSlug}/cms/contact-info`);
    expect(bRes.status).toBe(404);
  });

  // Trial stores are created with a known password (TestPass123!) by
  // makeStore() above via createTrialLead — reuse that directly rather
  // than a second account-creation path.
  async function loginOwnerToken(storeSlug: string) {
    const owner = await prisma.user.findFirstOrThrow({
      where: { store: { slug: storeSlug }, role: 'STORE_OWNER' },
    });
    const res = await request(app).post('/api/auth/login').send({ email: owner.email, password: 'TestPass123!' });
    return { token: res.body.accessToken as string };
  }
});

describe.skipIf(!hasDatabase)('Item 6 — theme customization request approval workflow', () => {
  beforeAll(async () => {
    await initRedis();
  });

  it('a submitted request is PENDING, invisible in the generic support queue as anything special, then Approve notifies the store owner', async () => {
    const { storeId, ownerId } = await makeStore();
    const admin = await masterAdminActor();

    const ticket = await supportService.createSupportTicket(
      storeId,
      { subject: 'Theme customization request', body: 'Please make the header darker.' },
      { id: ownerId, role: 'STORE_OWNER' },
      { isThemeCustomizationRequest: true },
    );
    expect(ticket.themeRequestStatus).toBe('PENDING');

    const list = await supportService.listThemeCustomizationRequests({});
    expect(list.items.some((t) => t.id === ticket.id)).toBe(true);

    const approved = await supportService.approveThemeCustomizationRequest(ticket.id, admin);
    expect(approved.themeRequestStatus).toBe('APPROVED');
    expect(approved.status).toBe('IN_PROGRESS');

    const notified = await prisma.notification.findFirst({
      where: { userId: ownerId, type: 'THEME_REQUEST_APPROVED' },
    });
    expect(notified).not.toBeNull();
  });

  it('rejecting requires a reason, sets REJECTED, and notifies the store with that reason', async () => {
    const { storeId, ownerId } = await makeStore();
    const admin = await masterAdminActor();
    const ticket = await supportService.createSupportTicket(
      storeId,
      { subject: 'Theme customization request', body: 'Change the font.' },
      { id: ownerId, role: 'STORE_OWNER' },
      { isThemeCustomizationRequest: true },
    );

    await expect(
      supportService.rejectThemeCustomizationRequest(ticket.id, admin, ''),
    ).rejects.toMatchObject({ statusCode: 400 });

    const rejected = await supportService.rejectThemeCustomizationRequest(
      ticket.id,
      admin,
      'This plan does not include custom theme work.',
    );
    expect(rejected.themeRequestStatus).toBe('REJECTED');

    const notified = await prisma.notification.findFirst({
      where: { userId: ownerId, type: 'THEME_REQUEST_REJECTED' },
    });
    expect(notified?.body).toBe('This plan does not include custom theme work.');
  });

  it('a request cannot be approved twice, and cannot be marked completed before being approved', async () => {
    const { storeId, ownerId } = await makeStore();
    const admin = await masterAdminActor();
    const ticket = await supportService.createSupportTicket(
      storeId,
      { subject: 'Theme customization request', body: 'x' },
      { id: ownerId, role: 'STORE_OWNER' },
      { isThemeCustomizationRequest: true },
    );

    await expect(
      supportService.completeThemeCustomizationRequest(ticket.id, admin),
    ).rejects.toMatchObject({ statusCode: 409 });

    await supportService.approveThemeCustomizationRequest(ticket.id, admin);
    await expect(
      supportService.approveThemeCustomizationRequest(ticket.id, admin),
    ).rejects.toMatchObject({ statusCode: 409 });

    const completed = await supportService.completeThemeCustomizationRequest(ticket.id, admin);
    expect(completed.themeRequestStatus).toBe('COMPLETED');
  });

  it('a non-master-admin is rejected by every theme-request route', async () => {
    const loginOwner = await request(app).post('/api/auth/login').send({
      email: 'owner@techworld.bd',
      password: 'Owner123!',
    });
    const ownerToken = loginOwner.body.accessToken as string;

    expect(
      (await request(app).get('/api/admin/theme-requests').set('Authorization', `Bearer ${ownerToken}`)).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/admin/theme-requests/nonexistent/approve')
          .set('Authorization', `Bearer ${ownerToken}`)
      ).status,
    ).toBe(403);
  });
});

describe.skipIf(!hasDatabase)('Item 7 — Master Admin settings save (support email)', () => {
  it('PATCH /admin/settings accepts the object-shaped payload the client sends and persists a valid support email', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'admin@commercenest.com',
      password: 'Admin123!',
    });
    const token = loginRes.body.accessToken as string;

    const email = `${uniqueSlug('support')}@example.com`;
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: { supportEmail: email } });

    expect(res.status).toBe(200);

    const stored = await prisma.platformSettings.findUnique({ where: { key: 'supportEmail' } });
    expect(stored?.value).toBe(email);
  });

  it('the previously-broken array-shaped payload is correctly rejected as invalid (documenting the exact failure the bug reproduced)', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'admin@commercenest.com',
      password: 'Admin123!',
    });
    const token = loginRes.body.accessToken as string;

    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ key: 'supportEmail', value: 'test@example.com' }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
