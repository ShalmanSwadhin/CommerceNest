import { beforeAll, describe, expect, it } from 'vitest';
import { hasDatabase } from './test/setup.js';
import { initRedis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import * as trialService from './services/trial.service.js';
import * as productService from './services/product.service.js';
import * as storefrontService from './services/storefront.service.js';
import * as couponService from './services/coupon.service.js';
import * as orderService from './services/order.service.js';
import * as returnService from './services/return.service.js';

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

/** A converted (non-trial) store — checkout doesn't depend on trial state,
 * but using a real paying store keeps this file's stores unambiguous. */
async function makeStore() {
  const slug = uniqueSlug('checkout');
  const { store } = await trialService.createTrialLead({
    prospectName: 'Test Owner',
    businessName: `Checkout Test ${slug}`,
    phone: `016${String(Math.floor(10000000 + Math.random() * 89999999))}`,
    email: `${slug}@example.com`,
    password: 'TestPass123!',
    confirmPassword: 'TestPass123!',
  });
  await prisma.store.update({ where: { id: store.id }, data: { isTrial: false } });
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: store.ownerUserId } });
  return { storeId: store.id, storeSlug: store.slug, ownerId: owner.id };
}

async function makeProduct(
  storeId: string,
  overrides: { stock?: number; basePrice?: number; status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' } = {},
) {
  const slug = uniqueSlug('prod');
  const product = await productService.createProduct(
    storeId,
    {
      name: `Product ${slug}`,
      slug,
      basePrice: overrides.basePrice ?? 500,
      status: overrides.status === 'ARCHIVED' ? 'DRAFT' : (overrides.status ?? 'ACTIVE'),
      variants: [{ sku: `SKU-${slug}`, stock: overrides.stock ?? 100 }],
    },
    'system',
  );
  if (overrides.status === 'ARCHIVED') {
    await productService.archiveProduct(storeId, product.id);
  }
  return product;
}

function address(division = 'Chattogram') {
  return {
    label: 'Home',
    line1: '12 Test Road',
    area: 'Test Area',
    district: 'Test District',
    division,
    recipientName: 'Test Customer',
    recipientPhone: '01712345678',
  };
}

function baseCheckoutInput(overrides: Record<string, unknown> = {}) {
  return {
    items: [],
    customerName: 'Test Customer',
    customerPhone: `017${String(Math.floor(10000000 + Math.random() * 89999999))}`,
    deliveryAddress: address(),
    paymentMethod: 'CASH_ON_DELIVERY',
    ...overrides,
  };
}

describe.skipIf(!hasDatabase)('Storefront checkout — pricing integrity', () => {
  beforeAll(async () => {
    await initRedis();
  });

  it('computes subtotal/delivery/total entirely server-side from current product/variant data', async () => {
    const { storeId, storeSlug } = await makeStore();
    const product = await makeProduct(storeId, { basePrice: 250 });
    const variant = product.variants[0]!;

    const result = await storefrontService.checkout(storeSlug, baseCheckoutInput({
      items: [{ productId: product.id, variantId: variant.id, quantity: 2 }],
      deliveryAddress: address('Chattogram'), // outside Dhaka -> 120 flat rate
    }));

    expect(result.subtotal).toBeCloseTo(500, 2); // 250 * 2, never trusting a client price
    expect(result.deliveryCharge).toBeCloseTo(120, 2);
    expect(result.total).toBeCloseTo(620, 2);
  });

  it('rejects a checkout payload that tries to smuggle a price/total field (strict schema)', async () => {
    const { storeId, storeSlug } = await makeStore();
    const product = await makeProduct(storeId);
    const variant = product.variants[0]!;

    await expect(
      storefrontService.checkout(storeSlug, {
        ...baseCheckoutInput({
          items: [{ productId: product.id, variantId: variant.id, quantity: 1, unitPrice: 1 }],
        }),
      }),
    ).rejects.toBeTruthy();
  });

  it('exact Decimal precision — no JS float drift across quantity multiplication and summation', async () => {
    const { storeId, storeSlug } = await makeStore();
    const productA = await makeProduct(storeId, { basePrice: 19.99 });
    const productB = await makeProduct(storeId, { basePrice: 10.1 });

    const result = await storefrontService.checkout(storeSlug, baseCheckoutInput({
      items: [
        { productId: productA.id, variantId: productA.variants[0]!.id, quantity: 3 },
        { productId: productB.id, variantId: productB.variants[0]!.id, quantity: 3 },
      ],
    }));

    // 19.99*3 + 10.10*3 = 59.97 + 30.30 = 90.27 exactly — plain JS float
    // multiplication/summation of these exact inputs is a known drift case
    // (10.1 * 3 = 30.299999999999997 in IEEE754 double).
    expect(result.subtotal).toBe(90.27);
  });

  it('rejects a variant that belongs to a different product', async () => {
    const { storeId, storeSlug } = await makeStore();
    const productA = await makeProduct(storeId);
    const productB = await makeProduct(storeId);

    await expect(
      storefrontService.checkout(storeSlug, baseCheckoutInput({
        items: [{ productId: productA.id, variantId: productB.variants[0]!.id, quantity: 1 }],
      })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a product/variant belonging to another store entirely', async () => {
    const { storeSlug: storeSlugA } = await makeStore();
    const { storeId: storeIdB } = await makeStore();
    const productB = await makeProduct(storeIdB);

    await expect(
      storefrontService.checkout(storeSlugA, baseCheckoutInput({
        items: [{ productId: productB.id, variantId: productB.variants[0]!.id, quantity: 1 }],
      })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects checkout for a DRAFT product', async () => {
    const { storeId, storeSlug } = await makeStore();
    const product = await makeProduct(storeId, { status: 'DRAFT' });

    await expect(
      storefrontService.checkout(storeSlug, baseCheckoutInput({
        items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
      })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects checkout for an ARCHIVED product', async () => {
    const { storeId, storeSlug } = await makeStore();
    const product = await makeProduct(storeId, { status: 'ARCHIVED' });

    await expect(
      storefrontService.checkout(storeSlug, baseCheckoutInput({
        items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
      })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects checkout when requested quantity exceeds current stock', async () => {
    const { storeId, storeSlug } = await makeStore();
    const product = await makeProduct(storeId, { stock: 2 });

    await expect(
      storefrontService.checkout(storeSlug, baseCheckoutInput({
        items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 3 }],
      })),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });
});

describe.skipIf(!hasDatabase)('Coupon validation at checkout', () => {
  async function makeCoupon(storeId: string, overrides: Record<string, unknown> = {}) {
    const code = uniqueSlug('COUPON').toUpperCase();
    return prisma.coupon.create({
      data: {
        storeId,
        code,
        discountType: 'PERCENTAGE',
        discountValue: 10,
        active: true,
        ...overrides,
      },
    });
  }

  it('applies a valid percentage coupon and books an idempotent redemption', async () => {
    const { storeId, storeSlug } = await makeStore();
    const product = await makeProduct(storeId, { basePrice: 1000 });
    const coupon = await makeCoupon(storeId, { discountValue: 10 });

    const result = await storefrontService.checkout(storeSlug, baseCheckoutInput({
      items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
      couponCode: coupon.code,
    }));

    expect(result.discountAmount).toBeCloseTo(100, 2); // 10% of 1000
    const redemptions = await prisma.couponRedemption.count({ where: { couponId: coupon.id } });
    expect(redemptions).toBe(1);
  });

  it('rejects an expired coupon', async () => {
    const { storeId, storeSlug } = await makeStore();
    const product = await makeProduct(storeId);
    const coupon = await makeCoupon(storeId, { endsAt: new Date(Date.now() - 86_400_000) });

    await expect(
      storefrontService.checkout(storeSlug, baseCheckoutInput({
        items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
        couponCode: coupon.code,
      })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects an inactive coupon', async () => {
    const { storeId, storeSlug } = await makeStore();
    const product = await makeProduct(storeId);
    const coupon = await makeCoupon(storeId, { active: false });

    await expect(
      storefrontService.checkout(storeSlug, baseCheckoutInput({
        items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
        couponCode: coupon.code,
      })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a coupon below its minimum order value', async () => {
    const { storeId, storeSlug } = await makeStore();
    const product = await makeProduct(storeId, { basePrice: 100 });
    const coupon = await makeCoupon(storeId, { minOrderValue: 5000 });

    await expect(
      storefrontService.checkout(storeSlug, baseCheckoutInput({
        items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
        couponCode: coupon.code,
      })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a coupon belonging to another store', async () => {
    const { storeId: storeIdA } = await makeStore();
    const { storeId: storeIdB, storeSlug: storeSlugB } = await makeStore();
    const product = await makeProduct(storeIdB);
    const couponA = await makeCoupon(storeIdA);

    await expect(
      storefrontService.checkout(storeSlugB, baseCheckoutInput({
        items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
        couponCode: couponA.code,
      })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects reuse once a coupon has reached its usage limit', async () => {
    const { storeId, storeSlug } = await makeStore();
    const product = await makeProduct(storeId, { stock: 10 });
    const coupon = await makeCoupon(storeId, { usageLimit: 1 });

    await storefrontService.checkout(storeSlug, baseCheckoutInput({
      items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
      couponCode: coupon.code,
    }));

    await expect(
      storefrontService.checkout(storeSlug, baseCheckoutInput({
        items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
        couponCode: coupon.code,
      })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('database-level lock prevents over-redemption of a usageLimit=1 coupon under concurrent checkouts', async () => {
    const { storeId, storeSlug } = await makeStore();
    const product = await makeProduct(storeId, { stock: 10 });
    const coupon = await makeCoupon(storeId, { usageLimit: 1 });

    const attempt = () =>
      storefrontService.checkout(storeSlug, baseCheckoutInput({
        items: [{ productId: product.id, variantId: product.variants[0]!.id, quantity: 1 }],
        couponCode: coupon.code,
      }));

    const results = await Promise.allSettled([attempt(), attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const redemptions = await prisma.couponRedemption.count({ where: { couponId: coupon.id } });
    expect(redemptions).toBe(1);
    const reloaded = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
    expect(reloaded.usedCount).toBe(1);
  });
});

describe.skipIf(!hasDatabase)('Stock — confirm-time race and restoration', () => {
  async function orderFor(storeId: string, storeSlug: string, variantId: string, productId: string) {
    const result = await storefrontService.checkout(storeSlug, baseCheckoutInput({
      items: [{ productId, variantId, quantity: 1 }],
    }));
    return result.orderId;
  }

  it('database-level check prevents overselling when two orders for the last unit are confirmed concurrently', async () => {
    const { storeId, storeSlug, ownerId } = await makeStore();
    const product = await makeProduct(storeId, { stock: 1 });
    const variant = product.variants[0]!;

    const orderIdA = await orderFor(storeId, storeSlug, variant.id, product.id);
    const orderIdB = await orderFor(storeId, storeSlug, variant.id, product.id);

    const results = await Promise.allSettled([
      orderService.transitionOrderStatus(storeId, orderIdA, { status: 'CONFIRMED', note: 'Test confirm' }, { id: ownerId }),
      orderService.transitionOrderStatus(storeId, orderIdB, { status: 'CONFIRMED', note: 'Test confirm' }, { id: ownerId }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const reloadedVariant = await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(reloadedVariant.stock).toBe(0);
  });

  it('CONFIRMED -> CANCELLED restores the reserved stock', async () => {
    const { storeId, storeSlug, ownerId } = await makeStore();
    const product = await makeProduct(storeId, { stock: 5 });
    const variant = product.variants[0]!;
    const orderId = await orderFor(storeId, storeSlug, variant.id, product.id);

    await orderService.transitionOrderStatus(storeId, orderId, { status: 'CONFIRMED', note: 'Test confirm' }, { id: ownerId });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(4);

    await orderService.transitionOrderStatus(storeId, orderId, { status: 'CANCELLED' }, { id: ownerId });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(5);
  });

  it('PENDING -> CANCELLED never reserved stock, so cancelling it never inflates stock', async () => {
    const { storeId, storeSlug, ownerId } = await makeStore();
    const product = await makeProduct(storeId, { stock: 5 });
    const variant = product.variants[0]!;
    const orderId = await orderFor(storeId, storeSlug, variant.id, product.id);

    await orderService.transitionOrderStatus(storeId, orderId, { status: 'CANCELLED' }, { id: ownerId });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(5);
  });

  it('SHIPPED -> RETURNED restores the reserved stock', async () => {
    const { storeId, storeSlug, ownerId } = await makeStore();
    const product = await makeProduct(storeId, { stock: 5 });
    const variant = product.variants[0]!;
    const orderId = await orderFor(storeId, storeSlug, variant.id, product.id);

    await orderService.transitionOrderStatus(storeId, orderId, { status: 'CONFIRMED', note: 'Test confirm' }, { id: ownerId });
    await orderService.transitionOrderStatus(storeId, orderId, { status: 'PROCESSING' }, { id: ownerId });
    await orderService.transitionOrderStatus(
      storeId,
      orderId,
      { status: 'SHIPPED', courierTrackingId: 'TRK-1' },
      { id: ownerId },
    );
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(4);

    await orderService.transitionOrderStatus(storeId, orderId, { status: 'RETURNED' }, { id: ownerId });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(5);
  });

  it('a post-delivery return restores stock once staff confirms the item physically received', async () => {
    const { storeId, storeSlug, ownerId } = await makeStore();
    const product = await makeProduct(storeId, { stock: 5 });
    const variant = product.variants[0]!;
    const orderId = await orderFor(storeId, storeSlug, variant.id, product.id);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    await orderService.transitionOrderStatus(storeId, orderId, { status: 'CONFIRMED', note: 'Test confirm' }, { id: ownerId });
    await orderService.transitionOrderStatus(storeId, orderId, { status: 'PROCESSING' }, { id: ownerId });
    await orderService.transitionOrderStatus(
      storeId,
      orderId,
      { status: 'SHIPPED', courierTrackingId: 'TRK-2' },
      { id: ownerId },
    );
    await orderService.transitionOrderStatus(storeId, orderId, { status: 'DELIVERED' }, { id: ownerId });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(4);

    const returnReq = await returnService.createReturnRequest(storeId, order.customerId, {
      orderId,
      reason: 'Wrong size received, does not fit',
    });
    await returnService.approveReturn(storeId, returnReq.id, {});
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(4); // not yet — only on physical receipt

    await returnService.markItemReceived(storeId, returnReq.id);
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(5);
  });
});

describe.skipIf(!hasDatabase)('Order detail exposes only the currently-legal status transitions', () => {
  it('matches the actual state machine at each stage', async () => {
    const { storeId, storeSlug, ownerId } = await makeStore();
    const product = await makeProduct(storeId, { stock: 5 });
    const variant = product.variants[0]!;
    const result = await storefrontService.checkout(storeSlug, baseCheckoutInput({
      items: [{ productId: product.id, variantId: variant.id, quantity: 1 }],
    }));

    let order = await orderService.getOrder(storeId, result.orderId);
    expect(order.allowedStatusTransitions.sort()).toEqual(['CANCELLED', 'CONFIRMED'].sort());

    await orderService.transitionOrderStatus(storeId, result.orderId, { status: 'CONFIRMED', note: 'Test confirm' }, { id: ownerId });
    order = await orderService.getOrder(storeId, result.orderId);
    expect(order.allowedStatusTransitions.sort()).toEqual(['CANCELLED', 'PROCESSING'].sort());

    await orderService.transitionOrderStatus(storeId, result.orderId, { status: 'PROCESSING' }, { id: ownerId });
    order = await orderService.getOrder(storeId, result.orderId);
    expect(order.allowedStatusTransitions).toEqual(['SHIPPED']);

    await orderService.transitionOrderStatus(
      storeId,
      result.orderId,
      { status: 'SHIPPED', courierTrackingId: 'TRK-3' },
      { id: ownerId },
    );
    order = await orderService.getOrder(storeId, result.orderId);
    expect(order.allowedStatusTransitions.sort()).toEqual(['DELIVERED', 'RETURNED'].sort());

    await orderService.transitionOrderStatus(storeId, result.orderId, { status: 'DELIVERED' }, { id: ownerId });
    order = await orderService.getOrder(storeId, result.orderId);
    expect(order.allowedStatusTransitions).toEqual([]);
  });
});
