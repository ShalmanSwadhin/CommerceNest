import { z } from 'zod';
import {
  BANGLADESH_PHONE_REGEX,
  checkoutSchema,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
  StoreStatus,
} from '@commercenest/types';
import type { Prisma } from '@commercenest/prisma';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { emitAfterCommit } from '../events/emit.js';
import { kvDel, kvGet, kvSet } from '../lib/redis.js';
import { signCustomerToken } from '../lib/jwt.js';
import { toNumber } from './order.service.js';
import { env } from '../lib/env.js';
import { validateCouponForOrder } from './coupon.service.js';

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

/**
 * Resolve a public storefront by slug.
 * Allows PENDING_SETUP (pre-launch preview); blocks SUSPENDED/ARCHIVED.
 */
async function resolveStoreBySlug(storeSlug: string) {
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
  return store;
}

function publicCustomer(customer: {
  id: string;
  storeId: string;
  phone: string;
  name: string;
  email: string | null;
  preferredLocale?: string;
  riskLevel?: string;
}) {
  return {
    id: customer.id,
    storeId: customer.storeId,
    phone: customer.phone,
    name: customer.name,
    email: customer.email,
    preferredLocale: customer.preferredLocale,
  };
}

/** Store summary for storefront shell (published theme only). */
export async function getStorefrontSummary(storeSlug: string) {
  const store = await resolveStoreBySlug(storeSlug);
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
    themeSettings: published?.themeSettings ?? null,
    primaryHostname: primary?.hostname ?? null,
  };
}

export async function getStorefrontHome(storeSlug: string) {
  const store = await resolveStoreBySlug(storeSlug);

  // Catalog only when store is ACTIVE — never fall back to draft theme
  const featured =
    store.status === StoreStatus.ACTIVE
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
    },
    theme: published
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
  subtotal: number,
): number {
  const threshold =
    store.freeShippingThreshold !== null ? toNumber(store.freeShippingThreshold) : null;
  if (threshold !== null && subtotal >= threshold) return 0;
  const isDhaka = division.trim().toLowerCase() === 'dhaka';
  return toNumber(isDhaka ? store.shippingInsideDhaka : store.shippingOutsideDhaka);
}

export async function checkout(storeSlug: string, input: unknown) {
  const store = await resolveStoreBySlug(storeSlug);
  if (store.status !== StoreStatus.ACTIVE) {
    throw AppError.forbidden('Store is not accepting orders');
  }
  const data = storefrontCheckoutSchema.parse(input);

  const lineDetails: Array<{
    productId: string;
    variantId: string;
    productName: string;
    variantLabel: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
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

    const unitPrice = toNumber(variant.priceOverride ?? product.basePrice);
    lineDetails.push({
      productId: product.id,
      variantId: variant.id,
      productName: product.name,
      variantLabel: [variant.size, variant.color].filter(Boolean).join(' / ') ||
        variant.sku,
      unitPrice,
      quantity: item.quantity,
      lineTotal: unitPrice * item.quantity,
    });
  }

  const subtotal = lineDetails.reduce((s, l) => s + l.lineTotal, 0);
  const deliveryCharge = computeShippingCharge(store, data.deliveryAddress.division, subtotal);

  const isBkash = data.paymentMethod === PaymentMethod.MANUAL_BKASH;

  const order = await prisma.$transaction(async (tx) => {
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

    let discountAmount = 0;
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
    const total = Math.max(subtotal + deliveryCharge - discountAmount, 0);

    let orderNumber = nextOrderNumber();
    for (let i = 0; i < 3; i++) {
      const clash = await tx.order.findUnique({
        where: {
          storeId_orderNumber: { storeId: store.id, orderNumber },
        },
      });
      if (!clash) break;
      orderNumber = nextOrderNumber();
    }

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
      include: { items: true, customer: true },
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

export async function requestOtp(storeSlug: string, phone: string) {
  await resolveStoreBySlug(storeSlug);
  if (!BANGLADESH_PHONE_REGEX.test(phone)) {
    throw AppError.badRequest('Invalid Bangladesh phone number');
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await kvSet(`otp:${storeSlug}:${phone}`, code, 60 * 10);
  return {
    ok: true,
    message: 'OTP sent',
    ...(env.NODE_ENV === 'development' ? { devCode: code } : {}),
  };
}

export async function verifyOtp(
  storeSlug: string,
  phone: string,
  code: string,
) {
  const store = await resolveStoreBySlug(storeSlug);
  const stored = await kvGet(`otp:${storeSlug}:${phone}`);
  if (!stored || stored !== code) {
    throw AppError.unauthorized('Invalid or expired OTP');
  }
  await kvDel(`otp:${storeSlug}:${phone}`);

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
