import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  BANGLADESH_PHONE_REGEX,
  checkoutSchema,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
  StoreStatus,
} from '@commercenest/types';
import { Prisma } from '@commercenest/prisma';
import { prisma, isUniqueConstraintError } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { emitAfterCommit } from '../events/emit.js';
import { kvDel, kvGet, kvSet } from '../lib/redis.js';
import { signCustomerToken } from '../lib/jwt.js';
import { toNumber } from './order.service.js';
import { env } from '../lib/env.js';
import { validateCouponForOrder } from './coupon.service.js';
import { toDecimal, roundMoney, type Decimal } from './billing.service.js';
import { createAndSendOtp, consumeOtp, otpConsumeErrorMessage } from '../lib/otp.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

/**
 * V1 MANUAL_BKASH is two-step:
 * 1) Place order (txn optional) → paymentStatus PENDING
 * 2) Submit txn via /payments/bkash → PENDING_VERIFICATION
 * If txn is provided at checkout, jump straight to PENDING_VERIFICATION.
 */
const storefrontCheckoutSchema = checkoutSchema
  .extend({
    bkashTxnId: z.string().trim().min(6).max(32).optional(),
    bkashSenderPhone: z
      .string()
      .trim()
      .regex(BANGLADESH_PHONE_REGEX)
      .optional(),
    couponCode: z.string().trim().min(1).max(40).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.paymentMethod !== PaymentMethod.MANUAL_BKASH) return;
    const hasTxn = Boolean(data.bkashTxnId);
    const hasSender = Boolean(data.bkashSenderPhone);
    if (hasTxn !== hasSender) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'bkashTxnId and bkashSenderPhone must both be provided together',
        path: hasTxn ? ['bkashSenderPhone'] : ['bkashTxnId'],
      });
    }
  });

function isTrialExpired(store: { isTrial: boolean; trialExpiresAt: Date | null }) {
  return Boolean(store.isTrial && store.trialExpiresAt && store.trialExpiresAt < new Date());
}

/**
 * Resolve a public storefront by slug.
 * Allows PENDING_SETUP (pre-launch preview); blocks SUSPENDED/ARCHIVED.
 * An expired trial store blocks every storefront action by default (no
 * browsing, no checkout) — pass allowExpiredTrial for the two "entry"
 * endpoints (summary/home) that need to render a professional trial-expired
 * page instead of a bare error.
 */
async function resolveStoreBySlug(
  storeSlug: string,
  opts: { allowExpiredTrial?: boolean } = {},
) {
  const store = await prisma.store.findUnique({
    where: { slug: storeSlug },
    include: {
      storefront: {
        include: { publishedVersion: true, draftVersion: true },
      },
      domains: { where: { isPrimary: true }, take: 1 },
    },
  });
  if (!store || store.status === 'ARCHIVED' || store.status === 'SUSPENDED') {
    throw AppError.notFound('Store not found');
  }
  if (!opts.allowExpiredTrial && isTrialExpired(store)) {
    throw AppError.forbidden(
      'This trial store has expired.',
      'TRIAL_EXPIRED',
    );
  }
  return store;
}

function publicCustomer(customer: {
  id: string;
  storeId: string;
  phone: string | null;
  name: string;
  email: string | null;
  preferredLocale?: string;
  riskLevel?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
}) {
  return {
    id: customer.id,
    storeId: customer.storeId,
    phone: customer.phone,
    name: customer.name,
    email: customer.email,
    preferredLocale: customer.preferredLocale,
    emailVerified: customer.emailVerified ?? false,
    phoneVerified: customer.phoneVerified ?? false,
  };
}

/** Store summary for storefront shell (published theme only). */
export async function getStorefrontSummary(storeSlug: string) {
  const store = await resolveStoreBySlug(storeSlug, { allowExpiredTrial: true });
  const trialExpired = isTrialExpired(store);
  const published = store.storefront?.publishedVersion ?? null;
  const primary = store.domains[0] ?? null;

  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    status: store.status,
    tagline: store.tagline,
    category: store.category,
    bkashNumber: store.bkashNumber,
    bkashInstructions: store.bkashInstructions,
    themeSettings: trialExpired ? null : published?.themeSettings ?? null,
    primaryHostname: primary?.hostname ?? null,
    isTrial: store.isTrial,
    trialExpired,
  };
}

export async function getStorefrontHome(storeSlug: string) {
  const store = await resolveStoreBySlug(storeSlug, { allowExpiredTrial: true });
  const trialExpired = isTrialExpired(store);

  // Catalog only when store is ACTIVE and not an expired trial — never fall
  // back to draft theme.
  const featured =
    store.status === StoreStatus.ACTIVE && !trialExpired
      ? await prisma.product.findMany({
          where: { storeId: store.id, status: ProductStatus.ACTIVE },
          include: { variants: true },
          orderBy: { createdAt: 'desc' },
          take: 12,
        })
      : [];

  const published = store.storefront?.publishedVersion ?? null;

  return {
    store: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      status: store.status,
      tagline: store.tagline,
      category: store.category,
      bkashNumber: store.bkashNumber,
      bkashInstructions: store.bkashInstructions,
      isTrial: store.isTrial,
      trialExpired,
    },
    theme:
      published && !trialExpired
        ? {
            layout: published.layout,
            themeSettings: published.themeSettings,
            versionNumber: published.versionNumber,
            status: published.status,
          }
        : null,
    featuredProducts: featured,
  };
}

export type StorefrontProductSort =
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'name_asc';

export interface StorefrontProductQuery {
  page?: number;
  limit?: number;
  search?: string;
  sort?: StorefrontProductSort;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
}

const SORT_ORDER_BY: Record<StorefrontProductSort, Prisma.ProductOrderByWithRelationInput> = {
  newest: { createdAt: 'desc' },
  price_asc: { basePrice: 'asc' },
  price_desc: { basePrice: 'desc' },
  name_asc: { name: 'asc' },
};

function buildProductWhere(
  storeId: string,
  query: StorefrontProductQuery,
): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    storeId,
    status: ProductStatus.ACTIVE,
  };
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { slug: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.basePrice = {
      ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
    };
  }
  if (query.inStock) {
    where.variants = { some: { stock: { gt: 0 } } };
  }
  return where;
}

export async function listStorefrontProducts(
  storeSlug: string,
  query: StorefrontProductQuery,
) {
  const store = await resolveStoreBySlug(storeSlug);
  if (store.status !== StoreStatus.ACTIVE) {
    return {
      storeId: store.id,
      items: [],
      total: 0,
      page: query.page ?? 1,
      limit: Math.min(query.limit ?? 20, 100),
    };
  }

  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? 20, 100);
  const where = buildProductWhere(store.id, query);
  const orderBy = SORT_ORDER_BY[query.sort ?? 'newest'];

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { variants: true, category: true },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return { storeId: store.id, items, total, page, limit };
}

export async function getStorefrontProduct(storeSlug: string, productSlug: string) {
  const store = await resolveStoreBySlug(storeSlug);
  if (store.status !== StoreStatus.ACTIVE) {
    throw AppError.notFound('Product not found');
  }
  const product = await prisma.product.findFirst({
    where: {
      storeId: store.id,
      slug: productSlug,
      status: ProductStatus.ACTIVE,
    },
    include: { variants: true, category: true },
  });
  if (!product) throw AppError.notFound('Product not found');
  return product;
}

export async function listCategoryProducts(
  storeSlug: string,
  categorySlug: string,
  query: StorefrontProductQuery,
) {
  const store = await resolveStoreBySlug(storeSlug);
  const category = await prisma.category.findUnique({
    where: { storeId_slug: { storeId: store.id, slug: categorySlug } },
  });
  if (!category) throw AppError.notFound('Category not found');

  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? 20, 100);

  if (store.status !== StoreStatus.ACTIVE) {
    return { category, items: [], total: 0, page, limit };
  }

  const where = { ...buildProductWhere(store.id, query), categoryId: category.id };
  const orderBy = SORT_ORDER_BY[query.sort ?? 'newest'];

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { variants: true },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return { category, items, total, page, limit };
}

function nextOrderNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `CN-${stamp}-${rand}`;
}

/**
 * Server-computed delivery charge — a client-submitted deliveryCharge is
 * never trusted, matching how product pricing is server-computed. Bangladesh
 * V1 shipping model: flat inside-Dhaka / outside-Dhaka rates per store, with
 * an optional free-shipping subtotal threshold.
 */
export function computeShippingCharge(
  store: {
    shippingInsideDhaka: { toString(): string } | number | string;
    shippingOutsideDhaka: { toString(): string } | number | string;
    freeShippingThreshold: { toString(): string } | number | string | null;
  },
  division: string,
  subtotal: Decimal,
): Decimal {
  const threshold =
    store.freeShippingThreshold !== null ? toDecimal(store.freeShippingThreshold) : null;
  if (threshold !== null && subtotal.gte(threshold)) return new Prisma.Decimal(0);
  const isDhaka = division.trim().toLowerCase() === 'dhaka';
  return toDecimal(isDhaka ? store.shippingInsideDhaka : store.shippingOutsideDhaka);
}

export async function checkout(storeSlug: string, input: unknown) {
  const store = await resolveStoreBySlug(storeSlug);
  if (store.status !== StoreStatus.ACTIVE) {
    throw AppError.forbidden('Store is not accepting orders');
  }
  const data = storefrontCheckoutSchema.parse(input);

  // Exact Decimal arithmetic throughout — the same standard the billing
  // system holds itself to (see BILLING_ARCHITECTURE.md), applied here
  // because this is the other place a real customer-facing money total gets
  // computed. JS `number` is only used again at the API-response boundary
  // (toNumber, unchanged) and never as an input to further math.
  const lineDetails: Array<{
    productId: string;
    variantId: string;
    productName: string;
    variantLabel: string;
    unitPrice: Decimal;
    quantity: number;
    lineTotal: Decimal;
  }> = [];

  for (const item of data.items) {
    const product = await prisma.product.findFirst({
      where: {
        id: item.productId,
        storeId: store.id,
        status: ProductStatus.ACTIVE,
      },
    });
    if (!product) {
      throw AppError.badRequest(`Product ${item.productId} not found`);
    }
    const variant = await prisma.variant.findFirst({
      where: {
        id: item.variantId,
        productId: product.id,
        storeId: store.id,
      },
    });
    if (!variant) {
      throw AppError.badRequest(`Variant ${item.variantId} not found`);
    }
    if (variant.stock < item.quantity) {
      throw AppError.conflict('Insufficient stock', {
        code: 'INSUFFICIENT_STOCK',
        variantId: variant.id,
      });
    }

    const unitPrice = roundMoney(toDecimal(variant.priceOverride ?? product.basePrice));
    lineDetails.push({
      productId: product.id,
      variantId: variant.id,
      productName: product.name,
      variantLabel: [variant.size, variant.color].filter(Boolean).join(' / ') ||
        variant.sku,
      unitPrice,
      quantity: item.quantity,
      lineTotal: roundMoney(unitPrice.mul(item.quantity)),
    });
  }

  const subtotal = roundMoney(
    lineDetails.reduce((s, l) => s.plus(l.lineTotal), new Prisma.Decimal(0)),
  );
  const deliveryCharge = computeShippingCharge(store, data.deliveryAddress.division, subtotal);

  const isBkash = data.paymentMethod === PaymentMethod.MANUAL_BKASH;

  async function runCheckoutTransaction(orderNumber: string) {
    return prisma.$transaction(async (tx) => {
      let customer = await tx.customer.findUnique({
        where: {
          storeId_phone: { storeId: store.id, phone: data.customerPhone },
        },
      });

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            storeId: store.id,
            phone: data.customerPhone,
            name: data.customerName,
            email: data.customerEmail,
            preferredLocale: data.preferredLocale,
          },
        });
      } else {
        customer = await tx.customer.update({
          where: { id: customer.id },
          data: {
            name: data.customerName,
            email: data.customerEmail ?? customer.email,
            preferredLocale: data.preferredLocale,
          },
        });
      }

      let discountAmount = new Prisma.Decimal(0);
      let appliedCoupon: { id: string } | null = null;
      if (data.couponCode) {
        const { coupon, discountAmount: amount } = await validateCouponForOrder(
          tx,
          store.id,
          data.couponCode,
          customer.id,
          subtotal,
        );
        discountAmount = amount;
        appliedCoupon = coupon;
      }
      const total = Prisma.Decimal.max(
        subtotal.plus(deliveryCharge).minus(discountAmount),
        new Prisma.Decimal(0),
      );

      const created = await tx.order.create({
        data: {
          storeId: store.id,
          customerId: customer.id,
          orderNumber,
          status: 'PENDING',
          paymentMethod: data.paymentMethod,
          paymentStatus:
            isBkash && data.bkashTxnId
              ? PaymentStatus.PENDING_VERIFICATION
              : PaymentStatus.PENDING,
          bkashTxnId: isBkash ? data.bkashTxnId ?? null : null,
          bkashSenderPhone: isBkash ? data.bkashSenderPhone ?? null : null,
          bkashAmount: isBkash && data.bkashTxnId ? total : null,
          subtotal,
          deliveryCharge,
          couponCode: appliedCoupon ? data.couponCode! : null,
          discountAmount,
          total,
          deliveryAddress: data.deliveryAddress,
          items: {
            create: lineDetails.map((l) => ({
              storeId: store.id,
              productId: l.productId,
              variantId: l.variantId,
              productName: l.productName,
              variantLabel: l.variantLabel,
              unitPrice: l.unitPrice,
              quantity: l.quantity,
              lineTotal: l.lineTotal,
            })),
          },
          statusHistory: {
            create: {
              storeId: store.id,
              fromStatus: null,
              toStatus: 'PENDING',
              note: 'Order placed',
            },
          },
        },
        include: { items: true, customer: { select: { riskLevel: true } } },
      });

      if (appliedCoupon) {
        await tx.couponRedemption.create({
          data: {
            couponId: appliedCoupon.id,
            storeId: store.id,
            customerId: customer.id,
            orderId: created.id,
            amount: discountAmount,
          },
        });
        await tx.coupon.update({
          where: { id: appliedCoupon.id },
          data: { usedCount: { increment: 1 } },
        });
      }

      return created;
    });
  }

  // Retries the whole transaction (not just the insert) on an orderNumber
  // collision — a failed statement inside a Postgres transaction poisons
  // every later statement on that same connection until rollback (the same
  // lesson the billing system's invoice generation already ran into), so a
  // catch-and-retry-with-a-fresh-number can't happen *inside* the
  // transaction that just failed. Re-running the whole thing from a fresh
  // transaction is the correct fix, and cheap: coupon/stock re-validation on
  // retry is a few extra reads, not wasted correctness work. A same-store,
  // same-day collision is normally rare (4 random digits) but not
  // negligible for a busy store, so this must be a real retry, not just a
  // best-effort pre-check.
  let order: Awaited<ReturnType<typeof runCheckoutTransaction>> | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      order = await runCheckoutTransaction(nextOrderNumber());
      break;
    } catch (err) {
      if (isUniqueConstraintError(err) && attempt < 3) continue;
      throw err;
    }
  }
  if (!order) throw AppError.conflict('Could not place order — please try again.');

  emitAfterCommit('OrderPlaced', {
    storeId: store.id,
    actorId: null,
    payload: {
      storeId: store.id,
      orderId: order.id,
      customerId: order.customerId,
      total: String(order.total),
      paymentMethod: data.paymentMethod,
      riskLevelAtPlacement: order.customer.riskLevel as never,
    },
  });

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    total: toNumber(order.total),
    subtotal: toNumber(order.subtotal),
    deliveryCharge: toNumber(order.deliveryCharge),
    discountAmount: toNumber(order.discountAmount),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    customerRiskLevel: order.customer.riskLevel,
  };
}

export async function lookupOrder(
  storeSlug: string,
  input: { orderNumber: string; phone: string },
) {
  const store = await resolveStoreBySlug(storeSlug);
  const order = await prisma.order.findFirst({
    where: {
      storeId: store.id,
      orderNumber: input.orderNumber,
      customer: { phone: input.phone },
    },
    include: {
      items: true,
      statusHistory: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!order) throw AppError.notFound('Order not found');
  return order;
}

function customerOtpKeys(storeSlug: string, phone: string) {
  return {
    key: `otp:${storeSlug}:${phone}`,
    cooldownKey: `otp:cooldown:${storeSlug}:${phone}`,
  };
}

export async function requestOtp(storeSlug: string, phone: string) {
  await resolveStoreBySlug(storeSlug);
  if (!BANGLADESH_PHONE_REGEX.test(phone)) {
    throw AppError.badRequest('Invalid Bangladesh phone number');
  }

  const { code } = await createAndSendOtp({
    ...customerOtpKeys(storeSlug, phone),
    phone,
    messageFor: (c) =>
      `Your CommerceNest verification code is ${c}. It expires in 5 minutes. Do not share this code.`,
  });

  return {
    ok: true,
    message: 'OTP sent',
    ...(env.NODE_ENV === 'development' || env.NODE_ENV === 'test'
      ? { devCode: code }
      : {}),
  };
}

export async function verifyOtp(
  storeSlug: string,
  phone: string,
  code: string,
) {
  const store = await resolveStoreBySlug(storeSlug);
  const { key } = customerOtpKeys(storeSlug, phone);
  const result = await consumeOtp(key, code);
  if (!result.ok) {
    throw AppError.unauthorized(otpConsumeErrorMessage(result.reason));
  }

  let customer = await prisma.customer.findUnique({
    where: { storeId_phone: { storeId: store.id, phone } },
  });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        storeId: store.id,
        phone,
        name: phone,
      },
    });
  }

  const accessToken = signCustomerToken({
    sub: customer.id,
    storeId: store.id,
  });

  return {
    accessToken,
    customer: publicCustomer(customer),
  };
}

// ---------------------------------------------------------------------------
// Customer name/email/password auth — the PRIMARY storefront login method
// (see DECISIONS.md update in AUTHENTICATION_ARCHITECTURE.md). Phone OTP
// above remains available as an independent second login method and as an
// optional post-registration verification add-on — neither replaces the
// other. No forced verification: a freshly-registered customer is
// immediately usable (browse/cart/checkout/account), exactly like a phone
// OTP login always has been.
// ---------------------------------------------------------------------------

const CUSTOMER_RESET_PREFIX = 'customer-pwdreset:';

export async function registerCustomer(
  storeSlug: string,
  input: { name: string; email: string; password: string; phone?: string },
) {
  const store = await resolveStoreBySlug(storeSlug);

  const existing = await prisma.customer.findUnique({
    where: { storeId_email: { storeId: store.id, email: input.email } },
  });
  if (existing) {
    throw AppError.conflict('An account with this email already exists.');
  }

  const passwordHash = await hashPassword(input.password);
  let customer;
  try {
    customer = await prisma.customer.create({
      data: {
        storeId: store.id,
        name: input.name,
        email: input.email,
        passwordHash,
        phone: input.phone,
      },
    });
  } catch (err) {
    // Optional phone still can't collide with another customer at this store.
    if (isUniqueConstraintError(err)) {
      throw AppError.conflict(
        'An account with this phone number already exists.',
      );
    }
    throw err;
  }

  const accessToken = signCustomerToken({
    sub: customer.id,
    storeId: store.id,
  });

  return { accessToken, customer: publicCustomer(customer) };
}

export async function loginCustomer(
  storeSlug: string,
  input: { email: string; password: string },
) {
  const store = await resolveStoreBySlug(storeSlug);
  const customer = await prisma.customer.findUnique({
    where: { storeId_email: { storeId: store.id, email: input.email } },
  });
  if (!customer || !customer.passwordHash) {
    throw AppError.unauthorized('Invalid email or password');
  }
  const ok = await verifyPassword(input.password, customer.passwordHash);
  if (!ok) {
    throw AppError.unauthorized('Invalid email or password');
  }

  const accessToken = signCustomerToken({
    sub: customer.id,
    storeId: store.id,
  });

  return { accessToken, customer: publicCustomer(customer) };
}

export async function requestCustomerPasswordReset(
  storeSlug: string,
  email: string,
) {
  const store = await resolveStoreBySlug(storeSlug);
  const customer = await prisma.customer.findUnique({
    where: { storeId_email: { storeId: store.id, email } },
  });
  // Always the same response, whether or not the account exists — avoids
  // account enumeration (this IS a public, unauthenticated endpoint, unlike
  // email verification's send step).
  if (!customer || !customer.passwordHash) {
    return {
      ok: true,
      message: 'If the account exists, a reset link was sent',
    };
  }

  const token = randomBytes(32).toString('hex');
  await kvSet(
    `${CUSTOMER_RESET_PREFIX}${store.id}:${token}`,
    customer.id,
    60 * 60,
  );

  return {
    ok: true,
    message: 'If the account exists, a reset link was sent',
    ...(env.NODE_ENV === 'development' || env.NODE_ENV === 'test'
      ? { devToken: token }
      : {}),
  };
}

export async function confirmCustomerPasswordReset(
  storeSlug: string,
  token: string,
  password: string,
) {
  const store = await resolveStoreBySlug(storeSlug);
  const key = `${CUSTOMER_RESET_PREFIX}${store.id}:${token}`;
  const customerId = await kvGet(key);
  if (!customerId) {
    throw AppError.badRequest('Invalid or expired reset link');
  }
  const passwordHash = await hashPassword(password);
  await prisma.customer.update({
    where: { id: customerId },
    data: { passwordHash },
  });
  await kvDel(key);
  return { ok: true };
}

export async function getCustomerProfile(
  storeSlug: string,
  customerId: string,
) {
  const store = await resolveStoreBySlug(storeSlug);
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId: store.id },
  });
  if (!customer) throw AppError.notFound('Customer not found');
  return publicCustomer(customer);
}

export async function listCustomerOrders(
  storeSlug: string,
  customerId: string,
  query?: { page?: number; limit?: number },
) {
  const store = await resolveStoreBySlug(storeSlug);
  const page = query?.page ?? 1;
  const limit = Math.min(query?.limit ?? 20, 100);

  const where = { storeId: store.id, customerId };
  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return { items, total, page, limit };
}

export { resolveStoreBySlug };
