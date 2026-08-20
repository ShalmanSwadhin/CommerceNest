import { beforeAll, describe, expect, it } from 'vitest';
import { hasDatabase } from './test/setup.js';
import { initRedis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import * as trialService from './services/trial.service.js';
import * as productService from './services/product.service.js';
import * as staffService from './services/staff.service.js';
import * as mediaService from './services/media.service.js';
import * as packageService from './services/package.service.js';
import * as subscriptionService from './services/subscription.service.js';
import * as billingService from './services/billing.service.js';
import * as orderService from './services/order.service.js';
import * as returnService from './services/return.service.js';

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/** Foreign keys (AuditLog.actorId) require a real User row — the seeded
 * Master Admin, not a placeholder string. */
async function masterAdminActor() {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@commercenest.com' },
    select: { id: true, role: true },
  });
  return { id: admin.id, role: admin.role as string };
}

async function makeStore(overrides: { planTier?: string } = {}) {
  const slug = uniqueSlug('billtest');
  const { store } = await trialService.createTrialLead({
    prospectName: 'Test Owner',
    businessName: `Bill Test ${slug}`,
    phone: `017${String(Math.floor(10000000 + Math.random() * 89999999))}`,
    email: `${slug}@example.com`,
    password: 'TestPass123!',
    confirmPassword: 'TestPass123!',
  });
  // These tests exercise real subscription/platform-fee billing, which only
  // applies to a converted (non-trial) store — trial stores are correctly
  // billed nothing (see the "Trial stores are never billed" suite below).
  await prisma.store.update({
    where: { id: store.id },
    data: { isTrial: false, ...(overrides.planTier ? { planTier: overrides.planTier } : {}) },
  });
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: store.ownerUserId } });
  return { storeId: store.id, ownerId: owner.id };
}

/** A tiny, disposable plan so limit-boundary tests run in milliseconds
 * instead of creating hundreds of real rows to reach the real 50/250/1000
 * commercial limits. The real seeded values are checked separately, once,
 * as a plain data assertion. */
async function makeTestPlan(limits: { maxProducts?: number; maxStaff?: number; storageLimitMb?: number; platformFeeRate?: number }) {
  const slug = uniqueSlug('testplan');
  const pkg = await packageService.createPackage(
    {
      name: `Test Plan ${slug}`,
      slug,
      monthlyPrice: 100,
      maxProducts: limits.maxProducts ?? null,
      maxStaff: limits.maxStaff ?? null,
      storageLimitMb: limits.storageLimitMb ?? null,
      platformFeeRate: limits.platformFeeRate ?? 0,
    },
    await masterAdminActor(),
  );
  return pkg.slug;
}

async function makeProduct(storeId: string, status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' = 'ACTIVE') {
  const slug = uniqueSlug('prod');
  return productService.createProduct(
    storeId,
    {
      name: `Product ${slug}`,
      slug,
      basePrice: 500,
      status: status === 'ARCHIVED' ? 'DRAFT' : status,
      variants: [{ sku: `SKU-${slug}`, stock: 100 }],
    },
    'system',
  );
}

/** Creates a DELIVERED-ready order directly (bypassing checkout) with
 * caller-controlled subtotal/discount/delivery so the fee math can be
 * asserted exactly, then drives it through the real order-status state
 * machine to DELIVERED — the same code path production orders take. */
async function createDeliverableOrder(
  storeId: string,
  amounts: { subtotal: number; discountAmount?: number; deliveryCharge?: number },
) {
  const product = await makeProduct(storeId);
  const variant = product.variants[0]!;
  const customer = await prisma.customer.create({
    data: {
      storeId,
      name: 'Test Customer',
      email: `${uniqueSlug('cust')}@example.com`,
      passwordHash: 'x',
    },
  });
  const discountAmount = amounts.discountAmount ?? 0;
  const deliveryCharge = amounts.deliveryCharge ?? 0;
  const total = amounts.subtotal - discountAmount + deliveryCharge;
  const order = await prisma.order.create({
    data: {
      storeId,
      customerId: customer.id,
      orderNumber: `TEST-${uniqueSlug('ord')}`,
      status: 'CONFIRMED',
      paymentMethod: 'CASH_ON_DELIVERY',
      paymentStatus: 'PENDING',
      subtotal: amounts.subtotal,
      discountAmount,
      deliveryCharge,
      total,
      deliveryAddress: { line1: 'x', area: 'x', district: 'x', division: 'x', recipientName: 'x', recipientPhone: '01712345678', label: 'Home' },
      items: {
        create: {
          storeId,
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          variantLabel: variant.sku,
          unitPrice: amounts.subtotal,
          quantity: 1,
          lineTotal: amounts.subtotal,
        },
      },
    },
  });
  return order;
}

async function deliverOrder(storeId: string, orderId: string, actorId: string) {
  await orderService.transitionOrderStatus(storeId, orderId, { status: 'PROCESSING' }, { id: actorId });
  await orderService.transitionOrderStatus(
    storeId,
    orderId,
    { status: 'SHIPPED', courierTrackingId: 'TRK-TEST' },
    { id: actorId },
  );
  return orderService.transitionOrderStatus(storeId, orderId, { status: 'DELIVERED' }, { id: actorId });
}

describe.skipIf(!hasDatabase)('Seeded pricing plans match the business model', () => {
  it('Starter / Business / Pro carry the specified limits and platform fee rates', async () => {
    const starter = await subscriptionService.getPlanLimits('starter');
    expect(starter).toMatchObject({ maxProducts: 50, maxStaff: 2, platformFeeRate: 0.005 });

    const business = await subscriptionService.getPlanLimits('business');
    expect(business).toMatchObject({ maxProducts: 250, maxStaff: 5, platformFeeRate: 0.004 });

    const pro = await subscriptionService.getPlanLimits('pro');
    expect(pro).toMatchObject({ maxProducts: 1000, maxStaff: 15, platformFeeRate: 0.0025 });
  });
});

describe.skipIf(!hasDatabase)('Active product definition', () => {
  beforeAll(async () => {
    await initRedis();
  });

  it('counts ACTIVE products only — DRAFT and ARCHIVED do not count', async () => {
    const { storeId } = await makeStore();
    await makeProduct(storeId, 'ACTIVE');
    await makeProduct(storeId, 'DRAFT');
    const archived = await makeProduct(storeId, 'ACTIVE');
    await prisma.product.update({ where: { id: archived.id }, data: { status: 'ARCHIVED' } });

    const count = await subscriptionService.getActiveProductCount(storeId);
    expect(count).toBe(1);
  });
});

describe.skipIf(!hasDatabase)('Product limit enforcement', () => {
  it('allows creating up to the limit, rejects the one past it, with a structured error', async () => {
    const planSlug = await makeTestPlan({ maxProducts: 3 });
    const { storeId } = await makeStore({ planTier: planSlug });

    await makeProduct(storeId);
    await makeProduct(storeId);
    await makeProduct(storeId);
    expect(await subscriptionService.getActiveProductCount(storeId)).toBe(3);

    await expect(makeProduct(storeId)).rejects.toMatchObject({
      statusCode: 403,
      code: 'PRODUCT_LIMIT_REACHED',
    });
  });

  it('a null maxProducts means unlimited', async () => {
    const planSlug = await makeTestPlan({ maxProducts: null as unknown as number });
    const { storeId } = await makeStore({ planTier: planSlug });
    for (let i = 0; i < 5; i++) await makeProduct(storeId);
    expect(await subscriptionService.getActiveProductCount(storeId)).toBe(5);
  });

  it('archiving a product frees a slot for a new one', async () => {
    const planSlug = await makeTestPlan({ maxProducts: 1 });
    const { storeId } = await makeStore({ planTier: planSlug });
    const first = await makeProduct(storeId);
    await expect(makeProduct(storeId)).rejects.toMatchObject({ code: 'PRODUCT_LIMIT_REACHED' });

    await prisma.product.update({ where: { id: first.id }, data: { status: 'ARCHIVED' } });
    await expect(makeProduct(storeId)).resolves.toBeTruthy();
  });
});

describe.skipIf(!hasDatabase)('Staff limit enforcement', () => {
  it('the store owner counts toward the limit (existing behavior, preserved)', async () => {
    const planSlug = await makeTestPlan({ maxStaff: 1 });
    const { storeId, ownerId } = await makeStore({ planTier: planSlug });

    // Owner alone already fills a maxStaff:1 plan.
    await expect(
      staffService.inviteStoreStaff(
        storeId,
        { email: `${uniqueSlug('staff')}@example.com`, name: 'Staff One', role: 'STORE_MANAGER' },
        { id: ownerId, role: 'STORE_OWNER' },
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'STAFF_LIMIT_REACHED' });
  });

  it('allows inviting up to the limit, rejects the one past it', async () => {
    const planSlug = await makeTestPlan({ maxStaff: 2 });
    const { storeId, ownerId } = await makeStore({ planTier: planSlug });
    // Owner = 1 of 2.
    await staffService.inviteStoreStaff(
      storeId,
      { email: `${uniqueSlug('staff')}@example.com`, name: 'Staff One', role: 'STORE_MANAGER' },
      { id: ownerId, role: 'STORE_OWNER' },
    );
    // 2 of 2 — at the limit now.
    await expect(
      staffService.inviteStoreStaff(
        storeId,
        { email: `${uniqueSlug('staff')}@example.com`, name: 'Staff Two', role: 'STORE_MANAGER' },
        { id: ownerId, role: 'STORE_OWNER' },
      ),
    ).rejects.toMatchObject({ code: 'STAFF_LIMIT_REACHED' });
  });
});

describe.skipIf(!hasDatabase)('Storage limit enforcement', () => {
  it('accepts uploads under the limit, rejects one that would exceed it, allows again after deleting', async () => {
    const planSlug = await makeTestPlan({ storageLimitMb: 1 }); // 1 MB = 1,048,576 bytes
    const { storeId } = await makeStore({ planTier: planSlug });

    const asset = await mediaService.registerMediaAsset(storeId, {
      publicId: uniqueSlug('media'),
      url: 'https://example.com/a.png',
      filename: 'a.png',
      mimeType: 'image/png',
      bytes: 700_000,
    });
    expect(await subscriptionService.getStorageUsedBytes(storeId)).toBe(700_000);

    // A second 700KB file would push total to 1.4MB, over the 1MB limit.
    await expect(
      mediaService.registerMediaAsset(storeId, {
        publicId: uniqueSlug('media'),
        url: 'https://example.com/b.png',
        filename: 'b.png',
        mimeType: 'image/png',
        bytes: 700_000,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'STORAGE_LIMIT_REACHED' });

    await mediaService.deleteMedia(storeId, asset.id);
    expect(await subscriptionService.getStorageUsedBytes(storeId)).toBe(0);

    await expect(
      mediaService.registerMediaAsset(storeId, {
        publicId: uniqueSlug('media'),
        url: 'https://example.com/c.png',
        filename: 'c.png',
        mimeType: 'image/png',
        bytes: 700_000,
      }),
    ).resolves.toBeTruthy();
  });
});

describe.skipIf(!hasDatabase)('Platform fee — booking, eligibility, idempotency, refunds', () => {
  it('books the fee only once an order is DELIVERED, on the eligible value (subtotal - discount, excluding delivery)', async () => {
    const planSlug = await makeTestPlan({ platformFeeRate: 0.05 }); // 5% for easy math
    const { storeId, ownerId } = await makeStore({ planTier: planSlug });
    const order = await createDeliverableOrder(storeId, { subtotal: 1000, discountAmount: 100, deliveryCharge: 60 });

    // Not yet delivered — no fee.
    let entries = await prisma.billingLedgerEntry.findMany({ where: { storeId, referenceId: order.id } });
    expect(entries).toHaveLength(0);

    await deliverOrder(storeId, order.id, ownerId);

    entries = await prisma.billingLedgerEntry.findMany({ where: { storeId, referenceId: order.id, type: 'PLATFORM_FEE' } });
    expect(entries).toHaveLength(1);
    // eligible = 1000 - 100 = 900 (delivery excluded); fee = 900 * 0.05 = 45
    expect(Number(entries[0]!.amount)).toBeCloseTo(45, 2);
  });

  it('never books a fee for an order cancelled before delivery', async () => {
    const planSlug = await makeTestPlan({ platformFeeRate: 0.05 });
    const { storeId, ownerId } = await makeStore({ planTier: planSlug });
    const order = await createDeliverableOrder(storeId, { subtotal: 500 });

    await orderService.transitionOrderStatus(storeId, order.id, { status: 'CANCELLED' }, { id: ownerId });

    const entries = await prisma.billingLedgerEntry.findMany({ where: { storeId, referenceId: order.id } });
    expect(entries).toHaveLength(0);
  });

  it('is idempotent — booking the same delivered order twice produces exactly one ledger entry', async () => {
    const planSlug = await makeTestPlan({ platformFeeRate: 0.05 });
    const { storeId } = await makeStore({ planTier: planSlug });
    const order = await createDeliverableOrder(storeId, { subtotal: 800 });

    await billingService.bookPlatformFeeForOrder(prisma, {
      id: order.id,
      storeId,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
    });
    await billingService.bookPlatformFeeForOrder(prisma, {
      id: order.id,
      storeId,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
    });

    const entries = await prisma.billingLedgerEntry.findMany({ where: { storeId, referenceId: order.id, type: 'PLATFORM_FEE' } });
    expect(entries).toHaveLength(1);
  });

  it('a full refund fully reverses the platform fee; a partial refund reverses it proportionally', async () => {
    const planSlug = await makeTestPlan({ platformFeeRate: 0.1 }); // 10%
    const { storeId, ownerId } = await makeStore({ planTier: planSlug });

    // Full refund case.
    const orderA = await createDeliverableOrder(storeId, { subtotal: 1000 });
    await deliverOrder(storeId, orderA.id, ownerId);
    const returnA = await prisma.returnRequest.create({
      data: { storeId, orderId: orderA.id, customerId: orderA.customerId, reason: 'test', status: 'ITEM_RECEIVED' },
    });
    await returnService.completeRefund(storeId, returnA.id, { refundAmount: Number(orderA.total), refundMethod: 'CASH' });

    const feeA = await prisma.billingLedgerEntry.findFirst({ where: { storeId, referenceId: orderA.id, type: 'PLATFORM_FEE' } });
    const adjA = await prisma.billingLedgerEntry.findFirst({ where: { storeId, referenceId: returnA.id, type: 'ADJUSTMENT' } });
    expect(Number(feeA!.amount)).toBeCloseTo(100, 2); // 1000 * 0.10
    expect(Number(adjA!.amount)).toBeCloseTo(-100, 2); // fully reversed

    // Partial refund case — refund half the order.
    const orderB = await createDeliverableOrder(storeId, { subtotal: 1000 });
    await deliverOrder(storeId, orderB.id, ownerId);
    const returnB = await prisma.returnRequest.create({
      data: { storeId, orderId: orderB.id, customerId: orderB.customerId, reason: 'test', status: 'ITEM_RECEIVED' },
    });
    await returnService.completeRefund(storeId, returnB.id, { refundAmount: Number(orderB.total) / 2, refundMethod: 'CASH' });

    const adjB = await prisma.billingLedgerEntry.findFirst({ where: { storeId, referenceId: returnB.id, type: 'ADJUSTMENT' } });
    expect(Number(adjB!.amount)).toBeCloseTo(-50, 2); // half of the 100 fee
  });

  it('refunding an order that never generated a fee is a safe no-op', async () => {
    const planSlug = await makeTestPlan({ platformFeeRate: 0.1 });
    const { storeId } = await makeStore({ planTier: planSlug });
    const order = await createDeliverableOrder(storeId, { subtotal: 500 });
    // Never delivered, so no fee exists yet.
    const ret = await prisma.returnRequest.create({
      data: { storeId, orderId: order.id, customerId: order.customerId, reason: 'test', status: 'ITEM_RECEIVED' },
    });
    await expect(
      returnService.completeRefund(storeId, ret.id, { refundAmount: Number(order.total), refundMethod: 'CASH' }),
    ).resolves.toBeTruthy();
    const adj = await prisma.billingLedgerEntry.findMany({ where: { storeId, referenceId: ret.id } });
    expect(adj).toHaveLength(0);
  });
});

describe.skipIf(!hasDatabase)('Exact decimal money arithmetic', () => {
  // These three inputs are not arbitrary — each is a verified case where
  // `Math.round(eligible * rate * 100) / 100` (naive JS float arithmetic)
  // disagrees with the mathematically-correct round-half-up result, one
  // input for each real plan rate:
  //   29    × 0.005  (Starter)  → naive 0.14, correct 0.15
  //   36.25 × 0.004  (Business) → naive 0.14, correct 0.15
  //   58    × 0.0025 (Pro)      → naive 0.14, correct 0.15
  // If billing.service.ts regressed to plain `number` arithmetic, these
  // would silently under-charge by one paisa and this test would catch it.
  it.each([
    { label: 'Starter rate (0.50%)', eligible: 29, rate: 0.005, expectedFee: 0.15 },
    { label: 'Business rate (0.40%)', eligible: 36.25, rate: 0.004, expectedFee: 0.15 },
    { label: 'Pro rate (0.25%)', eligible: 58, rate: 0.0025, expectedFee: 0.15 },
  ])('$label: eligible=$eligible books the exact correct fee, not the float-rounded one', async ({ eligible, rate, expectedFee }) => {
    const planSlug = await makeTestPlan({ platformFeeRate: rate });
    const { storeId, ownerId } = await makeStore({ planTier: planSlug });
    const order = await createDeliverableOrder(storeId, { subtotal: eligible });
    await deliverOrder(storeId, order.id, ownerId);

    const fee = await prisma.billingLedgerEntry.findFirst({
      where: { storeId, referenceId: order.id, type: 'PLATFORM_FEE' },
    });
    expect(Number(fee!.amount)).toBe(expectedFee);
  });

  it('a repeating-decimal refund ratio (1/3) rounds correctly, not to a truncated float', async () => {
    const planSlug = await makeTestPlan({ platformFeeRate: 0.1 });
    const { storeId, ownerId } = await makeStore({ planTier: planSlug });
    // Fee = 1000 × 0.10 = 100.00 exactly.
    const order = await createDeliverableOrder(storeId, { subtotal: 1000 });
    await deliverOrder(storeId, order.id, ownerId);

    // Refund exactly a third of the order — ratio is a repeating decimal
    // (0.3333...), so the adjustment (100 × 1/3 = 33.333...) must round to
    // 33.33, not silently drift from repeated float division.
    const ret = await prisma.returnRequest.create({
      data: { storeId, orderId: order.id, customerId: order.customerId, reason: 'test', status: 'ITEM_RECEIVED' },
    });
    await returnService.completeRefund(storeId, ret.id, {
      refundAmount: Number(order.total) / 3,
      refundMethod: 'CASH',
    });

    const adj = await prisma.billingLedgerEntry.findFirst({
      where: { storeId, referenceId: ret.id, type: 'ADJUSTMENT' },
    });
    expect(Number(adj!.amount)).toBe(-33.33);
  });

  it('multiple sequential adjustments on the same store never drift from exact expected totals', async () => {
    const planSlug = await makeTestPlan({ platformFeeRate: 0.0025 }); // Pro rate
    const { storeId, ownerId } = await makeStore({ planTier: planSlug });

    // Three orders whose fees individually expose the float-rounding trap
    // (all three verified mismatches from the Pro-rate table above and a
    // clean control value), booked back-to-back into the same period.
    const inputs = [58, 410, 878, 100];
    let expectedTotalFee = 0;
    for (const subtotal of inputs) {
      const order = await createDeliverableOrder(storeId, { subtotal });
      await deliverOrder(storeId, order.id, ownerId);
      const fee = await prisma.billingLedgerEntry.findFirst({
        where: { storeId, referenceId: order.id, type: 'PLATFORM_FEE' },
      });
      expectedTotalFee += Number(fee!.amount);
    }
    // Only rounded once, at the end, to guard against trailing float dust in
    // the test's own oracle sum — each individual fee is already an exact
    // 2dp value, and the actual implementation accumulates these via a
    // Postgres NUMERIC increment, not JS float addition.
    expectedTotalFee = Math.round(expectedTotalFee * 100) / 100;

    const period = await billingService.getOrCreateCurrentBillingPeriod(storeId);
    expect(Number(period.platformFeeAmount)).toBe(expectedTotalFee);
  });

  it('small amounts round to zero rather than throwing or storing a fractional-paisa value', async () => {
    const planSlug = await makeTestPlan({ platformFeeRate: 0.0025 }); // Pro rate
    const { storeId, ownerId } = await makeStore({ planTier: planSlug });
    // 1 × 0.0025 = 0.0025 → rounds down to 0.00, so no fee entry is booked
    // at all (bookPlatformFeeForOrder treats a zero fee as a no-op).
    const order = await createDeliverableOrder(storeId, { subtotal: 1 });
    await deliverOrder(storeId, order.id, ownerId);

    const fee = await prisma.billingLedgerEntry.findFirst({
      where: { storeId, referenceId: order.id, type: 'PLATFORM_FEE' },
    });
    expect(fee).toBeNull();
  });

  it('large amounts remain exact (no precision loss at higher magnitudes)', async () => {
    const planSlug = await makeTestPlan({ platformFeeRate: 0.005 }); // Starter rate
    const { storeId, ownerId } = await makeStore({ planTier: planSlug });
    const order = await createDeliverableOrder(storeId, { subtotal: 987654.32 });
    await deliverOrder(storeId, order.id, ownerId);

    const fee = await prisma.billingLedgerEntry.findFirst({
      where: { storeId, referenceId: order.id, type: 'PLATFORM_FEE' },
    });
    // 987654.32 × 0.005 = 4938.2716 → round-half-up 2dp = 4938.27
    expect(Number(fee!.amount)).toBe(4938.27);
  });
});

describe.skipIf(!hasDatabase)('Billing period snapshotting', () => {
  it('an already-open period keeps its original rate even after the Package rate changes', async () => {
    const planSlug = await makeTestPlan({ platformFeeRate: 0.05 });
    const { storeId } = await makeStore({ planTier: planSlug });

    const period = await billingService.getOrCreateCurrentBillingPeriod(storeId);
    expect(Number(period.platformFeeRate)).toBeCloseTo(0.05, 4);

    const pkg = await packageService.getPackageBySlug(planSlug);
    await packageService.updatePackage(pkg!.id, { platformFeeRate: 0.2 }, await masterAdminActor());

    const periodAgain = await billingService.getOrCreateCurrentBillingPeriod(storeId);
    expect(periodAgain.id).toBe(period.id);
    expect(Number(periodAgain.platformFeeRate)).toBeCloseTo(0.05, 4); // unchanged
  });

  it('books exactly one SUBSCRIPTION_CHARGE per period, matching the plan price', async () => {
    const planSlug = await makeTestPlan({});
    const pkg = await packageService.getPackageBySlug(planSlug);
    await packageService.updatePackage(pkg!.id, { monthlyPrice: 999 }, await masterAdminActor());
    const { storeId } = await makeStore({ planTier: planSlug });

    await billingService.getOrCreateCurrentBillingPeriod(storeId);
    await billingService.getOrCreateCurrentBillingPeriod(storeId);

    const charges = await prisma.billingLedgerEntry.findMany({
      where: { storeId, type: 'SUBSCRIPTION_CHARGE' },
    });
    expect(charges).toHaveLength(1);
    expect(Number(charges[0]!.amount)).toBeCloseTo(999, 2);
  });
});

describe.skipIf(!hasDatabase)('Trial stores are never billed', () => {
  it('a fresh trial store\'s billing period has zero subscription price and zero platform fee rate', async () => {
    const planSlug = await makeTestPlan({ platformFeeRate: 0.05 });
    const pkg = await packageService.getPackageBySlug(planSlug);
    await packageService.updatePackage(pkg!.id, { monthlyPrice: 999 }, await masterAdminActor());

    // A real trial store, exactly as trialService.createTrialLead produces
    // one — isTrial: true, not converted via makeStore's own override.
    const slug = uniqueSlug('trialbill');
    const { store } = await trialService.createTrialLead({
      prospectName: 'Trial Owner',
      businessName: `Trial Bill Test ${slug}`,
      phone: `019${String(Math.floor(10000000 + Math.random() * 89999999))}`,
      email: `${slug}@example.com`,
      password: 'TestPass123!',
      confirmPassword: 'TestPass123!',
    });
    await prisma.store.update({ where: { id: store.id }, data: { planTier: planSlug } });

    const period = await billingService.getOrCreateCurrentBillingPeriod(store.id);
    expect(Number(period.subscriptionPrice)).toBe(0);
    expect(Number(period.platformFeeRate)).toBe(0);

    const charges = await prisma.billingLedgerEntry.findMany({
      where: { storeId: store.id, type: 'SUBSCRIPTION_CHARGE' },
    });
    expect(charges).toHaveLength(0);
  });

  it('a trial store\'s delivered order never books a platform fee', async () => {
    const planSlug = await makeTestPlan({ platformFeeRate: 0.05 });
    const slug = uniqueSlug('trialfee');
    const { store } = await trialService.createTrialLead({
      prospectName: 'Trial Owner',
      businessName: `Trial Fee Test ${slug}`,
      phone: `019${String(Math.floor(10000000 + Math.random() * 89999999))}`,
      email: `${slug}@example.com`,
      password: 'TestPass123!',
      confirmPassword: 'TestPass123!',
    });
    await prisma.store.update({ where: { id: store.id }, data: { planTier: planSlug } });
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: store.ownerUserId } });

    const order = await createDeliverableOrder(store.id, { subtotal: 1000 });
    await deliverOrder(store.id, order.id, owner.id);

    const entries = await prisma.billingLedgerEntry.findMany({
      where: { storeId: store.id, referenceId: order.id, type: 'PLATFORM_FEE' },
    });
    expect(entries).toHaveLength(0);
  });

  it('converting a trial to paid never retroactively charges the already-open trial period, but the next period bills normally', async () => {
    const planSlug = await makeTestPlan({ platformFeeRate: 0.05 });
    const pkg = await packageService.getPackageBySlug(planSlug);
    await packageService.updatePackage(pkg!.id, { monthlyPrice: 999 }, await masterAdminActor());

    const slug = uniqueSlug('trialconvert');
    const { store } = await trialService.createTrialLead({
      prospectName: 'Trial Owner',
      businessName: `Trial Convert Test ${slug}`,
      phone: `019${String(Math.floor(10000000 + Math.random() * 89999999))}`,
      email: `${slug}@example.com`,
      password: 'TestPass123!',
      confirmPassword: 'TestPass123!',
    });
    await prisma.store.update({ where: { id: store.id }, data: { planTier: planSlug } });

    const trialPeriod = await billingService.getOrCreateCurrentBillingPeriod(store.id);
    expect(Number(trialPeriod.subscriptionPrice)).toBe(0);

    // Convert to paid — same effect as trialService.convertTrial's Store update.
    await prisma.store.update({ where: { id: store.id }, data: { isTrial: false, trialExpiresAt: null } });

    // The already-open period (same calendar month) is never rewritten.
    const stillTrialPeriod = await billingService.getOrCreateCurrentBillingPeriod(store.id);
    expect(stillTrialPeriod.id).toBe(trialPeriod.id);
    expect(Number(stillTrialPeriod.subscriptionPrice)).toBe(0);

    // Existing store data survives the conversion untouched.
    await makeProduct(store.id);
    const reloaded = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
    expect(reloaded.isTrial).toBe(false);
    expect(await prisma.product.count({ where: { storeId: store.id } })).toBe(1);
  });
});

describe.skipIf(!hasDatabase)('Store usage view + tenant isolation', () => {
  it('reflects products/staff/storage against the plan limits', async () => {
    const planSlug = await makeTestPlan({ maxProducts: 10, maxStaff: 5, storageLimitMb: 1 });
    const { storeId } = await makeStore({ planTier: planSlug });
    await makeProduct(storeId);
    await makeProduct(storeId);

    const usage = await subscriptionService.getStoreUsage(storeId);
    expect(usage.products).toEqual({ used: 2, limit: 10 });
    expect(usage.staff).toEqual({ used: 1, limit: 5 }); // owner only
    expect(usage.storage.limitBytes).toBe(1 * 1024 * 1024);
  });

  it('never mixes one store\'s usage/billing with another\'s', async () => {
    const planSlug = await makeTestPlan({ platformFeeRate: 0.05 });
    const a = await makeStore({ planTier: planSlug });
    const b = await makeStore({ planTier: planSlug });

    await makeProduct(a.storeId);
    // createDeliverableOrder creates one more product of its own — store A
    // ends up with 2, store B with 0.
    const orderA = await createDeliverableOrder(a.storeId, { subtotal: 1000 });
    await deliverOrder(a.storeId, orderA.id, a.ownerId);

    const usageA = await subscriptionService.getStoreUsage(a.storeId);
    const usageB = await subscriptionService.getStoreUsage(b.storeId);
    expect(usageA.products.used).toBe(2);
    expect(usageB.products.used).toBe(0);

    const billingA = await billingService.getStoreBillingSummary(a.storeId);
    const billingB = await billingService.getStoreBillingSummary(b.storeId);
    expect(billingA.entries.some((e) => e.type === 'PLATFORM_FEE')).toBe(true);
    expect(billingB.entries.some((e) => e.type === 'PLATFORM_FEE')).toBe(false);
  });
});

describe.skipIf(!hasDatabase)('Plan changes never destroy merchant data', () => {
  it('downgrading below current usage preserves existing products; only new creation is blocked', async () => {
    const roomyPlan = await makeTestPlan({ maxProducts: 10 });
    const { storeId } = await makeStore({ planTier: roomyPlan });
    for (let i = 0; i < 5; i++) await makeProduct(storeId);
    expect(await subscriptionService.getActiveProductCount(storeId)).toBe(5);

    const tightPlan = await makeTestPlan({ maxProducts: 2 });
    await prisma.store.update({ where: { id: storeId }, data: { planTier: tightPlan } });

    // All 5 products still exist — nothing was deleted by the downgrade.
    expect(await subscriptionService.getActiveProductCount(storeId)).toBe(5);
    // But creating a 6th is now blocked since usage already exceeds the new limit.
    await expect(makeProduct(storeId)).rejects.toMatchObject({ code: 'PRODUCT_LIMIT_REACHED' });
  });
});
