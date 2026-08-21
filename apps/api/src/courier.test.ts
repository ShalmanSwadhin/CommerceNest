import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasDatabase } from './test/setup.js';
import { initRedis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import * as trialService from './services/trial.service.js';
import * as productService from './services/product.service.js';
import * as storefrontService from './services/storefront.service.js';
import * as orderService from './services/order.service.js';
import * as courierService from './services/courier/courier.service.js';

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function makeStore() {
  const slug = uniqueSlug('courier');
  const { store } = await trialService.createTrialLead({
    prospectName: 'Test Owner',
    businessName: `Courier Test ${slug}`,
    phone: `018${String(Math.floor(10000000 + Math.random() * 89999999))}`,
    email: `${slug}@example.com`,
    password: 'TestPass123!',
    confirmPassword: 'TestPass123!',
  });
  await prisma.store.update({ where: { id: store.id }, data: { isTrial: false } });
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: store.ownerUserId } });
  return { storeId: store.id, storeSlug: store.slug, ownerId: owner.id };
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

function address() {
  return {
    label: 'Home',
    line1: '12 Test Road',
    area: 'Test Area',
    district: 'Test District',
    division: 'Dhaka',
    recipientName: 'Test Customer',
    recipientPhone: '01712345678',
  };
}

/** A CONFIRMED order — the state createShipmentForOrder requires. */
async function makeConfirmedOrder(storeId: string, storeSlug: string, ownerId: string) {
  const product = await makeProduct(storeId);
  const result = await storefrontService.checkout(storeSlug, {
    items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
    customerName: 'Test Customer',
    customerPhone: `017${String(Math.floor(10000000 + Math.random() * 89999999))}`,
    deliveryAddress: address(),
    paymentMethod: 'CASH_ON_DELIVERY',
  });
  await orderService.transitionOrderStatus(
    storeId,
    result.orderId,
    { status: 'CONFIRMED', note: 'Test confirm' },
    { id: ownerId },
  );
  return result.orderId;
}

async function enableSteadfast(storeId: string) {
  return courierService.upsertCourierAccount(storeId, {
    provider: 'STEADFAST',
    credentials: { apiKey: 'test-api-key', secretKey: 'test-secret-key' },
    enabled: true,
    isDefault: true,
  });
}

/** A fetch mock speaking Steadfast's documented response shapes. */
function mockSteadfastFetch(overrides: {
  createStatus?: string;
  trackStatus?: string;
} = {}) {
  return vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith('/create_order')) {
      return jsonResponse(200, {
        consignment: {
          consignment_id: 999001,
          tracking_code: 'TRK-999001',
          status: overrides.createStatus ?? 'pending',
        },
      });
    }
    if (u.includes('/status_by_cid/') || u.includes('/status_by_trackingcode/')) {
      return jsonResponse(200, { delivery_status: overrides.trackStatus ?? 'pending' });
    }
    if (u.endsWith('/get_balance')) {
      return jsonResponse(200, { current_balance: 1000 });
    }
    return jsonResponse(404, { message: 'not found' });
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe.skipIf(!hasDatabase)('Courier accounts — credential handling', () => {
  beforeAll(async () => {
    await initRedis();
  });
  beforeEach(() => {
    vi.stubGlobal('fetch', mockSteadfastFetch());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never returns credentials (encrypted or decrypted) from upsert or list', async () => {
    const { storeId } = await makeStore();
    const created = await enableSteadfast(storeId);
    expect(created).not.toHaveProperty('credentials');
    expect(created).not.toHaveProperty('credentialsEncrypted');
    expect(JSON.stringify(created)).not.toContain('test-secret-key');

    const list = await courierService.listCourierAccounts(storeId);
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain('test-secret-key');

    // What's actually stored in the DB is encrypted, not plaintext.
    const row = await prisma.courierAccount.findFirstOrThrow({ where: { storeId } });
    expect(JSON.stringify(row.credentialsEncrypted)).not.toContain('test-secret-key');
  });

  it('rejects an upsert missing a required credential field', async () => {
    const { storeId } = await makeStore();
    await expect(
      courierService.upsertCourierAccount(storeId, {
        provider: 'STEADFAST',
        credentials: { apiKey: 'only-one-field' },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects an unknown provider id', async () => {
    const { storeId } = await makeStore();
    await expect(
      courierService.upsertCourierAccount(storeId, {
        provider: 'NOT_A_REAL_COURIER',
        credentials: { apiKey: 'x' },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('re-upserting an existing account updates credentials and resets its last-test result', async () => {
    const { storeId } = await makeStore();
    const created = await enableSteadfast(storeId);
    await courierService.testCourierConnection(storeId, created.id);

    const updated = await courierService.upsertCourierAccount(storeId, {
      provider: 'STEADFAST',
      credentials: { apiKey: 'rotated-key', secretKey: 'rotated-secret' },
      isDefault: true,
    });
    expect(updated.id).toBe(created.id);
    expect(updated.isDefault).toBe(true);
    expect(updated.lastTestedAt).toBeNull(); // invalidated by the credentials change
  });

  it('one store cannot read, enable, or delete another store\'s courier account', async () => {
    const a = await makeStore();
    const b = await makeStore();
    const accountA = await enableSteadfast(a.storeId);

    await expect(
      courierService.setCourierAccountEnabled(b.storeId, accountA.id, false),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      courierService.deleteCourierAccount(b.storeId, accountA.id),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      courierService.testCourierConnection(b.storeId, accountA.id),
    ).rejects.toMatchObject({ statusCode: 404 });

    // Store A itself still can.
    await expect(
      courierService.setCourierAccountEnabled(a.storeId, accountA.id, false),
    ).resolves.toMatchObject({ enabled: false });
  });
});

describe.skipIf(!hasDatabase)('Shipment creation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockSteadfastFetch());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('happy path: creates a shipment, records it, and auto-advances CONFIRMED -> PROCESSING', async () => {
    const { storeId, storeSlug, ownerId } = await makeStore();
    await enableSteadfast(storeId);
    const orderId = await makeConfirmedOrder(storeId, storeSlug, ownerId);

    const shipment = await courierService.createShipmentForOrder(storeId, orderId, { id: ownerId });
    expect(shipment.provider).toBe('STEADFAST');
    expect(shipment.consignmentId).toBe('999001');
    expect(shipment.trackingCode).toBe('TRK-999001');
    expect(shipment).not.toHaveProperty('courierResponse');

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('PROCESSING');
    expect(order.courierTrackingId).toBe('TRK-999001');
  });

  it('rejects creating a shipment for an order that is not CONFIRMED or PROCESSING', async () => {
    const { storeId, storeSlug } = await makeStore();
    await enableSteadfast(storeId);
    const product = await makeProduct(storeId);
    const result = await storefrontService.checkout(storeSlug, {
      items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
      customerName: 'Test Customer',
      customerPhone: `017${String(Math.floor(10000000 + Math.random() * 89999999))}`,
      deliveryAddress: address(),
      paymentMethod: 'CASH_ON_DELIVERY',
    });
    // Still PENDING — never confirmed.
    await expect(
      courierService.createShipmentForOrder(storeId, result.orderId, { id: 'irrelevant' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects creating a second shipment for the same order', async () => {
    const { storeId, storeSlug, ownerId } = await makeStore();
    await enableSteadfast(storeId);
    const orderId = await makeConfirmedOrder(storeId, storeSlug, ownerId);

    await courierService.createShipmentForOrder(storeId, orderId, { id: ownerId });
    await expect(
      courierService.createShipmentForOrder(storeId, orderId, { id: ownerId }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'SHIPMENT_ALREADY_EXISTS' });
  });

  it('rejects creating a shipment when no courier account is enabled', async () => {
    const { storeId, storeSlug, ownerId } = await makeStore();
    const orderId = await makeConfirmedOrder(storeId, storeSlug, ownerId);
    await expect(
      courierService.createShipmentForOrder(storeId, orderId, { id: ownerId }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'COURIER_NOT_CONFIGURED' });
  });

  it('tenant isolation: store B cannot create a shipment for store A\'s order', async () => {
    const a = await makeStore();
    const b = await makeStore();
    await enableSteadfast(b.storeId);
    const orderId = await makeConfirmedOrder(a.storeId, a.storeSlug, a.ownerId);

    await expect(
      courierService.createShipmentForOrder(b.storeId, orderId, { id: b.ownerId }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('records the order total as codAmount for cash-on-delivery orders', async () => {
    const { storeId, storeSlug, ownerId } = await makeStore();
    await enableSteadfast(storeId);
    const orderId = await makeConfirmedOrder(storeId, storeSlug, ownerId);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    const shipment = await courierService.createShipmentForOrder(storeId, orderId, { id: ownerId });
    expect(shipment.codAmount).toBe(Number(order.total));
  });
});

describe.skipIf(!hasDatabase)('Shipment status sync — idempotency and order auto-advance', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function createConfirmedShipment() {
    vi.stubGlobal('fetch', mockSteadfastFetch());
    const { storeId, storeSlug, ownerId } = await makeStore();
    await enableSteadfast(storeId);
    const orderId = await makeConfirmedOrder(storeId, storeSlug, ownerId);
    await courierService.createShipmentForOrder(storeId, orderId, { id: ownerId });
    // The order is now PROCESSING (auto-advanced). Move it on to SHIPPED —
    // a deliberate staff action, same as production — so a courier
    // "delivered" update has somewhere legal to land.
    // Mirrors the real Store Admin UI: the "mark as shipped" form pre-fills
    // this field from the order's existing courierTrackingId (already set
    // by createShipmentForOrder), so it's always present in the request —
    // see OrdersPage.tsx's trackingId state.
    await orderService.transitionOrderStatus(
      storeId,
      orderId,
      { status: 'SHIPPED', courierTrackingId: 'TRK-999001' },
      { id: ownerId },
    );
    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { orderId } });
    return { storeId, orderId, ownerId, shipmentId: shipment.id };
  }

  it('auto-advances SHIPPED -> DELIVERED when the courier reports delivered', async () => {
    const { storeId, orderId, ownerId, shipmentId } = await createConfirmedShipment();
    vi.stubGlobal('fetch', mockSteadfastFetch({ trackStatus: 'delivered' }));

    const result = await courierService.syncShipmentStatus(storeId, shipmentId, { id: ownerId });
    expect(result.status).toBe('DELIVERED');

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('DELIVERED');
  });

  it('syncing twice with the same status is a no-op the second time (no duplicate order transition)', async () => {
    const { storeId, orderId, ownerId, shipmentId } = await createConfirmedShipment();
    vi.stubGlobal('fetch', mockSteadfastFetch({ trackStatus: 'delivered' }));

    await courierService.syncShipmentStatus(storeId, shipmentId, { id: ownerId });
    const orderAfterFirst = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(orderAfterFirst.status).toBe('DELIVERED');

    // DELIVERED has no further legal transitions — if this incorrectly
    // tried to transition again, it would throw. It must not throw.
    await expect(
      courierService.syncShipmentStatus(storeId, shipmentId, { id: ownerId }),
    ).resolves.toMatchObject({ status: 'DELIVERED' });
    const orderAfterSecond = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(orderAfterSecond.status).toBe('DELIVERED');
  });

  it('a status with no order-lifecycle meaning (e.g. still pending) updates the shipment without touching the order', async () => {
    const { storeId, orderId, ownerId, shipmentId } = await createConfirmedShipment();
    vi.stubGlobal('fetch', mockSteadfastFetch({ trackStatus: 'in_review' }));

    const result = await courierService.syncShipmentStatus(storeId, shipmentId, { id: ownerId });
    expect(result.status).toBe('IN_REVIEW');

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('SHIPPED'); // unchanged
  });
});

describe.skipIf(!hasDatabase)('Courier webhook handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function createConfirmedShipment(webhookToken?: string) {
    vi.stubGlobal('fetch', mockSteadfastFetch());
    const { storeId, storeSlug, ownerId } = await makeStore();
    await courierService.upsertCourierAccount(storeId, {
      provider: 'STEADFAST',
      credentials: webhookToken
        ? { apiKey: 'test-api-key', secretKey: 'test-secret-key', webhookToken }
        : { apiKey: 'test-api-key', secretKey: 'test-secret-key' },
      enabled: true,
      isDefault: true,
    });
    const orderId = await makeConfirmedOrder(storeId, storeSlug, ownerId);
    const shipment = await courierService.createShipmentForOrder(storeId, orderId, { id: ownerId });
    // Mirrors the real Store Admin UI, which pre-fills this from the
    // order's existing courierTrackingId (see OrdersPage.tsx).
    await orderService.transitionOrderStatus(
      storeId,
      orderId,
      { status: 'SHIPPED', courierTrackingId: shipment.trackingCode ?? undefined },
      { id: ownerId },
    );
    return { storeId, orderId, ownerId, consignmentId: shipment.consignmentId! };
  }

  it('applies a valid, correctly-signed webhook and advances the order', async () => {
    const { storeId, orderId, consignmentId } = await createConfirmedShipment('whsecret');

    const result = await courierService.handleCourierWebhook(
      storeId,
      'STEADFAST',
      { authorization: 'Bearer whsecret' },
      { consignment_id: consignmentId, delivery_status: 'delivered' },
    );
    expect(result).toEqual({ ok: true });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('DELIVERED');
  });

  it('rejects a webhook with an incorrect signature', async () => {
    const { storeId, consignmentId } = await createConfirmedShipment('whsecret');

    await expect(
      courierService.handleCourierWebhook(
        storeId,
        'STEADFAST',
        { authorization: 'Bearer wrong-token' },
        { consignment_id: consignmentId, delivery_status: 'delivered' },
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('ignores (never throws) a webhook referencing a shipment CommerceNest has no record of', async () => {
    const { storeId } = await createConfirmedShipment('whsecret');

    const result = await courierService.handleCourierWebhook(
      storeId,
      'STEADFAST',
      { authorization: 'Bearer whsecret' },
      { consignment_id: 'no-such-consignment', delivery_status: 'delivered' },
    );
    expect(result).toEqual({ ok: true, ignored: true });
  });

  it('a duplicate/retried webhook delivery is idempotent', async () => {
    const { storeId, orderId, consignmentId } = await createConfirmedShipment('whsecret');
    const payload = { consignment_id: consignmentId, delivery_status: 'delivered' };
    const headers = { authorization: 'Bearer whsecret' };

    await courierService.handleCourierWebhook(storeId, 'STEADFAST', headers, payload);
    await expect(
      courierService.handleCourierWebhook(storeId, 'STEADFAST', headers, payload),
    ).resolves.toEqual({ ok: true });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('DELIVERED'); // not double-transitioned
  });

  it('ignores a webhook for a store with no matching courier account, rather than erroring', async () => {
    const { storeId } = await makeStore();
    const result = await courierService.handleCourierWebhook(
      storeId,
      'STEADFAST',
      {},
      { consignment_id: '123', delivery_status: 'delivered' },
    );
    expect(result).toEqual({ ok: true, ignored: true });
  });

  it('ignores a webhook for an unrecognized provider id, rather than erroring', async () => {
    const { storeId } = await makeStore();
    const result = await courierService.handleCourierWebhook(storeId, 'NOT_A_REAL_COURIER', {}, {});
    expect(result).toEqual({ ok: true, ignored: true });
  });
});

describe.skipIf(!hasDatabase)('Encryption at rest (lib/crypto.ts) round trip', () => {
  it('encrypts then decrypts back to the original value', async () => {
    const { encryptJson, decryptJson } = await import('./lib/crypto.js');
    const original = { apiKey: 'abc', secretKey: 'xyz-secret' };
    const encrypted = encryptJson(original);
    expect(JSON.stringify(encrypted)).not.toContain('xyz-secret');
    expect(decryptJson(encrypted)).toEqual(original);
  });

  it('throws rather than returning garbage when the ciphertext has been tampered with', async () => {
    const { encryptJson, decryptJson } = await import('./lib/crypto.js');
    const encrypted = encryptJson({ apiKey: 'abc' });
    const tampered = { ...encrypted, ciphertext: Buffer.from('tampered-bytes-here').toString('base64') };
    expect(() => decryptJson(tampered)).toThrow();
  });

  it('throws when the auth tag has been tampered with', async () => {
    const { encryptJson, decryptJson } = await import('./lib/crypto.js');
    const encrypted = encryptJson({ apiKey: 'abc' });
    const tampered = { ...encrypted, authTag: Buffer.from(new Uint8Array(16)).toString('base64') };
    expect(() => decryptJson(tampered)).toThrow();
  });
});
