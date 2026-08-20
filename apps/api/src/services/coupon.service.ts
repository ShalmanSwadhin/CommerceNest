import { z } from 'zod';
import { Prisma } from '@commercenest/prisma';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { toNumber } from './order.service.js';
import { toDecimal, roundMoney, type Decimal } from './billing.service.js';

const couponCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[A-Z0-9_-]+$/i, {
    message: 'Coupon code may only contain letters, numbers, hyphens, and underscores',
  })
  .transform((v) => v.toUpperCase());

const baseCouponSchema = z.object({
  code: couponCodeSchema,
  discountType: z.enum(['PERCENTAGE', 'FIXED']),
  discountValue: z.number().positive(),
  minOrderValue: z.number().nonnegative().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  active: z.boolean().default(true),
  usageLimit: z.number().int().positive().optional(),
  perCustomerLimit: z.number().int().positive().optional(),
});

const createCouponSchema = baseCouponSchema.strict().superRefine((data, ctx) => {
  if (data.discountType === 'PERCENTAGE' && data.discountValue > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Percentage discount cannot exceed 100',
      path: ['discountValue'],
    });
  }
  if (data.startsAt && data.endsAt && new Date(data.endsAt) <= new Date(data.startsAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date must be after start date',
      path: ['endsAt'],
    });
  }
});

const updateCouponSchema = baseCouponSchema.partial().strict();

export async function listCoupons(storeId: string, query: unknown) {
  const q = z
    .object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .parse(query);
  const where: Prisma.CouponWhereInput = { storeId };
  const [items, total] = await Promise.all([
    prisma.coupon.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.coupon.count({ where }),
  ]);
  return { items, total, page: q.page, limit: q.limit };
}

export async function createCoupon(storeId: string, input: unknown) {
  const data = createCouponSchema.parse(input);
  const existing = await prisma.coupon.findUnique({
    where: { storeId_code: { storeId, code: data.code } },
  });
  if (existing) throw AppError.conflict('A coupon with this code already exists');

  return prisma.coupon.create({
    data: {
      storeId,
      code: data.code,
      discountType: data.discountType,
      discountValue: data.discountValue,
      minOrderValue: data.minOrderValue,
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      active: data.active,
      usageLimit: data.usageLimit,
      perCustomerLimit: data.perCustomerLimit,
    },
  });
}

async function getOwnedCoupon(storeId: string, couponId: string) {
  const coupon = await prisma.coupon.findFirst({ where: { id: couponId, storeId } });
  if (!coupon) throw AppError.notFound('Coupon not found');
  return coupon;
}

export async function updateCoupon(storeId: string, couponId: string, input: unknown) {
  const data = updateCouponSchema.parse(input);
  await getOwnedCoupon(storeId, couponId);

  if (data.code) {
    const existing = await prisma.coupon.findUnique({
      where: { storeId_code: { storeId, code: data.code } },
    });
    if (existing && existing.id !== couponId) {
      throw AppError.conflict('A coupon with this code already exists');
    }
  }

  return prisma.coupon.update({
    where: { id: couponId },
    data: {
      ...(data.code !== undefined ? { code: data.code } : {}),
      ...(data.discountType !== undefined ? { discountType: data.discountType } : {}),
      ...(data.discountValue !== undefined ? { discountValue: data.discountValue } : {}),
      ...(data.minOrderValue !== undefined ? { minOrderValue: data.minOrderValue } : {}),
      ...(data.startsAt !== undefined
        ? { startsAt: data.startsAt ? new Date(data.startsAt) : null }
        : {}),
      ...(data.endsAt !== undefined
        ? { endsAt: data.endsAt ? new Date(data.endsAt) : null }
        : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      ...(data.usageLimit !== undefined ? { usageLimit: data.usageLimit } : {}),
      ...(data.perCustomerLimit !== undefined
        ? { perCustomerLimit: data.perCustomerLimit }
        : {}),
    },
  });
}

export async function deleteCoupon(storeId: string, couponId: string) {
  const coupon = await getOwnedCoupon(storeId, couponId);
  const redemptions = await prisma.couponRedemption.count({ where: { couponId } });
  if (redemptions > 0) {
    // Preserve redemption history — deactivate instead of a destructive delete.
    return prisma.coupon.update({ where: { id: coupon.id }, data: { active: false } });
  }
  await prisma.coupon.delete({ where: { id: coupon.id } });
  return { ok: true };
}

/**
 * Validates a coupon code for a specific customer/order within an active
 * checkout transaction. Must run inside the same `$transaction` as order
 * creation so the usage-limit/per-customer-limit checks and the eventual
 * `CouponRedemption` insert + `usedCount` increment are atomic — otherwise
 * two concurrent checkouts could both pass a usageLimit=1 check.
 */
export async function validateCouponForOrder(
  tx: Prisma.TransactionClient,
  storeId: string,
  rawCode: string,
  customerId: string,
  subtotal: Decimal,
) {
  const code = rawCode.trim().toUpperCase();

  // Lock the coupon row for the rest of this transaction before reading it.
  // Without this, "run inside the same transaction" alone does NOT make the
  // usageLimit/perCustomerLimit checks below atomic — two concurrent
  // checkouts redeeming the same coupon can both read usedCount below the
  // limit before either commits its redemption, over-redeeming a capped
  // coupon. The lock forces the second transaction to wait until the first
  // commits, so it re-reads the coupon with the first redemption already
  // counted. Mirrors subscription.service.ts's withStoreLock pattern. A
  // nonexistent code locks nothing and falls through to the "not found"
  // error below, unchanged.
  await tx.$queryRaw`SELECT id FROM "coupons" WHERE "storeId" = ${storeId} AND code = ${code} FOR UPDATE`;

  const coupon = await tx.coupon.findUnique({
    where: { storeId_code: { storeId, code } },
  });
  if (!coupon || !coupon.active) {
    throw AppError.badRequest('Invalid or inactive coupon code', {
      field: 'couponCode',
      code: 'COUPON_INVALID',
    });
  }
  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt) {
    throw AppError.badRequest('This coupon is not active yet', {
      field: 'couponCode',
      code: 'COUPON_NOT_STARTED',
    });
  }
  if (coupon.endsAt && now > coupon.endsAt) {
    throw AppError.badRequest('This coupon has expired', {
      field: 'couponCode',
      code: 'COUPON_EXPIRED',
    });
  }
  if (coupon.minOrderValue && subtotal.lt(toDecimal(coupon.minOrderValue))) {
    throw AppError.badRequest(
      `This coupon requires a minimum order of ${toNumber(coupon.minOrderValue)}`,
      { field: 'couponCode', code: 'COUPON_MIN_ORDER' },
    );
  }
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw AppError.badRequest('This coupon has reached its usage limit', {
      field: 'couponCode',
      code: 'COUPON_LIMIT_REACHED',
    });
  }
  if (coupon.perCustomerLimit !== null) {
    const customerUses = await tx.couponRedemption.count({
      where: { couponId: coupon.id, customerId },
    });
    if (customerUses >= coupon.perCustomerLimit) {
      throw AppError.badRequest('You have already used this coupon', {
        field: 'couponCode',
        code: 'COUPON_CUSTOMER_LIMIT',
      });
    }
  }

  const rawDiscount =
    coupon.discountType === 'PERCENTAGE'
      ? subtotal.mul(toDecimal(coupon.discountValue)).div(100)
      : toDecimal(coupon.discountValue);
  const discountAmount = roundMoney(Prisma.Decimal.min(rawDiscount, subtotal));

  return { coupon, discountAmount };
}
