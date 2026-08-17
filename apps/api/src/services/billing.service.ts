import type { Prisma } from '@commercenest/prisma';
import { BillingEntryType, BillingPeriodStatus } from '@commercenest/types';
import { prisma, isUniqueConstraintError } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { limitsFor } from './subscription.service.js';
import { toNumber } from './order.service.js';

type Db = Prisma.TransactionClient | typeof prisma;

// ---------------------------------------------------------------------------
// Billing periods — one calendar-month window per store. Pricing fields are
// snapshotted from the store's Package at the moment the period opens, so a
// later price/fee-rate change never rewrites a historical invoice. Periods
// are rolled over lazily (whenever billing is next touched for that store),
// not by a scheduled job — see BILLING_ARCHITECTURE.md "Billing periods".
// ---------------------------------------------------------------------------

function monthBounds(at: Date) {
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

/** Returns the store's currently-open BillingPeriod, opening a fresh one
 * (and closing any prior period whose window has passed) if needed. Also
 * books that new period's SUBSCRIPTION_CHARGE exactly once. Safe to call
 * as often as needed — it's the entry point every other billing function
 * goes through. */
export async function getOrCreateCurrentBillingPeriod(storeId: string, db: Db = prisma) {
  const now = new Date();
  const { start, end } = monthBounds(now);

  const existing = await db.billingPeriod.findUnique({
    where: { storeId_periodStart: { storeId, periodStart: start } },
  });
  if (existing) return existing;

  const store = await db.store.findUnique({ where: { id: storeId }, select: { planTier: true } });
  if (!store) throw AppError.notFound('Store not found');
  const plan = await limitsFor(store.planTier);
  const pkg = await db.package.findUnique({ where: { slug: store.planTier } });

  // Close out any still-OPEN period whose window has already ended — this
  // is what makes rollover "lazy": it happens the next time anyone touches
  // billing for this store, not on a clock.
  await db.billingPeriod.updateMany({
    where: { storeId, status: BillingPeriodStatus.OPEN, periodEnd: { lte: start } },
    data: { status: BillingPeriodStatus.CLOSED },
  });

  const period = await db.billingPeriod.create({
    data: {
      storeId,
      periodStart: start,
      periodEnd: end,
      status: BillingPeriodStatus.OPEN,
      planSlug: plan.planTier,
      planName: plan.planName,
      subscriptionPrice: pkg ? pkg.monthlyPrice : 0,
      platformFeeRate: plan.platformFeeRate,
      currency: pkg?.currency ?? 'BDT',
    },
  });

  const subscriptionPrice = toNumber(period.subscriptionPrice);
  if (subscriptionPrice > 0) {
    await createLedgerEntry(db, {
      storeId,
      billingPeriodId: period.id,
      type: BillingEntryType.SUBSCRIPTION_CHARGE,
      amount: subscriptionPrice,
      currency: period.currency,
      description: `${period.planName} plan — ${start.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`,
      referenceType: 'BillingPeriod',
      referenceId: period.id,
    });
  }

  return period;
}

// ---------------------------------------------------------------------------
// Ledger — append-only. createLedgerEntry is idempotent: a duplicate call
// for the same (storeId, referenceType, referenceId, type) is a silent
// no-op, not an error, since retries/duplicate event delivery must never
// double-charge (see BILLING_ARCHITECTURE.md "Idempotency").
// ---------------------------------------------------------------------------

async function createLedgerEntry(
  db: Db,
  entry: {
    storeId: string;
    billingPeriodId: string | null;
    type: string;
    amount: number;
    currency: string;
    description: string;
    referenceType: string;
    referenceId: string;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<boolean> {
  try {
    await db.billingLedgerEntry.create({
      data: {
        storeId: entry.storeId,
        billingPeriodId: entry.billingPeriodId,
        type: entry.type as never,
        amount: entry.amount,
        currency: entry.currency,
        description: entry.description,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        metadata: entry.metadata ?? undefined,
      },
    });
    return true;
  } catch (err) {
    if (isUniqueConstraintError(err)) return false; // already booked — no-op
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Platform fee — "Eligible Order Value" = subtotal − discountAmount.
// Delivery charge is excluded (it's a pass-through logistics cost, not
// merchandise revenue). Merchant-funded discounts reduce the fee base since
// they reduce what the merchant actually collects; there is no separate
// "platform-funded" discount concept in this system. See
// BILLING_ARCHITECTURE.md "Eligible GMV" for the full rule.
// ---------------------------------------------------------------------------

export function eligibleOrderValue(order: {
  subtotal: unknown;
  discountAmount: unknown;
}): number {
  const value = toNumber(order.subtotal as never) - toNumber(order.discountAmount as never);
  return Math.max(0, value);
}

/**
 * Books the platform fee for one order. MUST be called from inside the same
 * transaction that marks the order DELIVERED (the one point in the existing
 * order lifecycle where `isPaid` becomes true, for every payment method —
 * COD and MANUAL_BKASH alike). That single hook point is deliberate: an
 * order that's cancelled, fails payment, or is returned before delivery
 * never reaches here, so it never generates a fee that would later need
 * reversing.
 */
export async function bookPlatformFeeForOrder(
  db: Db,
  order: { id: string; storeId: string; subtotal: unknown; discountAmount: unknown },
) {
  const period = await getOrCreateCurrentBillingPeriod(order.storeId, db);
  const eligible = eligibleOrderValue(order);
  const feeAmount = round2(eligible * toNumber(period.platformFeeRate));
  if (feeAmount <= 0) return;

  const booked = await createLedgerEntry(db, {
    storeId: order.storeId,
    billingPeriodId: period.id,
    type: BillingEntryType.PLATFORM_FEE,
    amount: feeAmount,
    currency: period.currency,
    description: `Platform fee (${(toNumber(period.platformFeeRate) * 100).toFixed(2)}%) — order ${order.id}`,
    referenceType: 'Order',
    referenceId: order.id,
    metadata: { eligibleOrderValue: eligible, feeRate: toNumber(period.platformFeeRate) },
  });
  if (!booked) return;

  await db.billingPeriod.update({
    where: { id: period.id },
    data: {
      eligibleGmv: { increment: eligible },
      platformFeeAmount: { increment: feeAmount },
    },
  });
}

/**
 * Books a proportional fee reversal when a return is refunded. Keyed by the
 * ReturnRequest's own id, so processing the same refund twice (retry,
 * duplicate admin click) never double-adjusts. If the order never generated
 * a fee in the first place (e.g. it was refunded via a path that skipped
 * DELIVERED), this is a safe no-op — there's nothing to reverse.
 */
export async function bookRefundAdjustment(
  db: Db,
  params: { returnRequestId: string; orderId: string; storeId: string; refundAmount: number; orderTotal: number },
) {
  const originalFee = await db.billingLedgerEntry.findFirst({
    where: { storeId: params.storeId, referenceType: 'Order', referenceId: params.orderId, type: BillingEntryType.PLATFORM_FEE },
  });
  if (!originalFee) return; // no fee was ever booked for this order — nothing to reverse

  const ratio = params.orderTotal > 0 ? Math.min(1, params.refundAmount / params.orderTotal) : 0;
  const adjustment = round2(toNumber(originalFee.amount) * ratio);
  if (adjustment <= 0) return;

  const booked = await createLedgerEntry(db, {
    storeId: params.storeId,
    billingPeriodId: originalFee.billingPeriodId,
    type: BillingEntryType.ADJUSTMENT,
    amount: -adjustment,
    currency: originalFee.currency,
    description: `Platform fee refund adjustment — return ${params.returnRequestId}`,
    referenceType: 'ReturnRequest',
    referenceId: params.returnRequestId,
    metadata: { refundAmount: params.refundAmount, orderTotal: params.orderTotal, ratio },
  });
  if (!booked || !originalFee.billingPeriodId) return;

  await db.billingPeriod.update({
    where: { id: originalFee.billingPeriodId },
    data: { platformFeeAmount: { decrement: adjustment } },
  });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Read views
// ---------------------------------------------------------------------------

export async function getStoreBillingSummary(storeId: string) {
  const period = await getOrCreateCurrentBillingPeriod(storeId);
  return {
    period: serializePeriod(period),
    entries: (
      await prisma.billingLedgerEntry.findMany({
        where: { billingPeriodId: period.id },
        orderBy: { createdAt: 'desc' },
      })
    ).map(serializeEntry),
  };
}

export async function listBillingPeriods(storeId: string, params: { page?: number; limit?: number } = {}) {
  // Ensure the current period exists so it always appears in history too.
  await getOrCreateCurrentBillingPeriod(storeId);
  const page = params.page ?? 1;
  const limit = params.limit ?? 12;
  const [items, total] = await Promise.all([
    prisma.billingPeriod.findMany({
      where: { storeId },
      orderBy: { periodStart: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.billingPeriod.count({ where: { storeId } }),
  ]);
  return { items: items.map(serializePeriod), total, page, limit };
}

export async function getBillingPeriodDetail(storeId: string, periodId: string) {
  const period = await prisma.billingPeriod.findFirst({ where: { id: periodId, storeId } });
  if (!period) throw AppError.notFound('Billing period not found');
  const entries = await prisma.billingLedgerEntry.findMany({
    where: { billingPeriodId: periodId },
    orderBy: { createdAt: 'desc' },
  });
  return { period: serializePeriod(period), entries: entries.map(serializeEntry) };
}

function serializePeriod(period: {
  id: string;
  storeId: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  planSlug: string;
  planName: string;
  subscriptionPrice: unknown;
  platformFeeRate: unknown;
  currency: string;
  eligibleGmv: unknown;
  platformFeeAmount: unknown;
}) {
  const subscriptionPrice = toNumber(period.subscriptionPrice as never);
  const platformFeeAmount = toNumber(period.platformFeeAmount as never);
  return {
    id: period.id,
    storeId: period.storeId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    status: period.status,
    planSlug: period.planSlug,
    planName: period.planName,
    subscriptionPrice,
    platformFeeRate: toNumber(period.platformFeeRate as never),
    currency: period.currency,
    eligibleGmv: toNumber(period.eligibleGmv as never),
    platformFeeAmount,
    totalDue: round2(subscriptionPrice + platformFeeAmount),
  };
}

function serializeEntry(entry: {
  id: string;
  type: string;
  amount: unknown;
  currency: string;
  description: string;
  referenceType: string;
  referenceId: string;
  createdAt: Date;
}) {
  return {
    id: entry.id,
    type: entry.type,
    amount: toNumber(entry.amount as never),
    currency: entry.currency,
    description: entry.description,
    referenceType: entry.referenceType,
    referenceId: entry.referenceId,
    createdAt: entry.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Master Admin — platform-wide billing
// ---------------------------------------------------------------------------

export async function listAllStoreBilling(params: { page?: number; limit?: number; storeId?: string } = {}) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const where: Prisma.BillingPeriodWhereInput = params.storeId ? { storeId: params.storeId } : {};
  const [items, total] = await Promise.all([
    prisma.billingPeriod.findMany({
      where,
      include: { store: { select: { id: true, name: true, slug: true } } },
      orderBy: [{ periodStart: 'desc' }, { storeId: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.billingPeriod.count({ where }),
  ]);
  return {
    items: items.map((p) => ({ ...serializePeriod(p), store: p.store })),
    total,
    page,
    limit,
  };
}
