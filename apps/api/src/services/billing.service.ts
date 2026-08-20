import { Prisma } from '@commercenest/prisma';
import { BillingEntryType, BillingPeriodStatus } from '@commercenest/types';
import { prisma, isUniqueConstraintError } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { limitsFor } from './subscription.service.js';
import { toNumber } from './order.service.js';

export type Db = Prisma.TransactionClient | typeof prisma;
export type Decimal = Prisma.Decimal;

const ZERO = new Prisma.Decimal(0);

/** Converts any Decimal-ish value (a Prisma.Decimal instance already, or a
 * DB-returned string/number) into a Prisma.Decimal — the same decimal.js
 * class Prisma itself uses for `Decimal` columns, already a dependency of
 * this project, so no new package was added for this. Every billing
 * calculation (fee, adjustment, ratio) is done in this exact decimal space,
 * never in plain JS `number`, and only converted to `number` at the very
 * end for read-only API/JSON display — never as an input to further math. */
export function toDecimal(value: unknown): Decimal {
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(value as Prisma.Decimal.Value);
}

/**
 * Every CommerceNest currency used today (BDT) has 2 fractional digits
 * (paisa). Money is rounded to exactly 2 decimal places using round-half-up
 * (e.g. 10.005 → 10.01) — the standard financial rounding rule, and
 * deliberately not JS's native float `toFixed`, which mis-rounds cases like
 * this exact one because 10.005 isn't exactly representable as a binary
 * float. Rounding happens exactly once, at the point each ledger-entry
 * amount is computed; nothing downstream re-rounds an already-rounded value.
 */
export function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

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

  const store = await db.store.findUnique({
    where: { id: storeId },
    select: { planTier: true, isTrial: true },
  });
  if (!store) throw AppError.notFound('Store not found');
  const plan = await limitsFor(store.planTier, db);
  const pkg = await db.package.findUnique({ where: { slug: store.planTier } });

  // Close out any still-OPEN period whose window has already ended — this
  // is what makes rollover "lazy": it happens the next time anyone touches
  // billing for this store, not on a clock.
  await db.billingPeriod.updateMany({
    where: { storeId, status: BillingPeriodStatus.OPEN, periodEnd: { lte: start } },
    data: { status: BillingPeriodStatus.CLOSED },
  });

  // A store on an active trial (isTrial) is not a paying customer yet — it
  // must never accrue a real subscription charge or platform fee. planSlug/
  // planName still reflect the plan they're trialing (informative), but the
  // monetary fields are zeroed, which also makes bookPlatformFeeForOrder's
  // existing feeAmount.lte(0) guard naturally skip booking anything for
  // trial-period orders too — no separate trial check needed there. Once
  // convertTrial flips isTrial to false, the NEXT period picks up real
  // pricing; the already-open trial period is never retroactively charged,
  // consistent with how a Package price change never retroactively affects
  // an already-open period either.
  const openingSubscriptionPrice = store.isTrial ? 0 : pkg ? pkg.monthlyPrice : 0;
  const openingPlatformFeeRate = store.isTrial ? 0 : plan.platformFeeRate;

  let period;
  try {
    period = await db.billingPeriod.create({
      data: {
        storeId,
        periodStart: start,
        periodEnd: end,
        status: BillingPeriodStatus.OPEN,
        planSlug: plan.planTier,
        planName: plan.planName,
        subscriptionPrice: openingSubscriptionPrice,
        platformFeeRate: openingPlatformFeeRate,
        currency: pkg?.currency ?? 'BDT',
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      // Lost the race to another concurrent caller opening the same
      // (storeId, periodStart) period — theirs already exists (and already
      // booked its own SUBSCRIPTION_CHARGE), so just return it.
      return db.billingPeriod.findUniqueOrThrow({
        where: { storeId_periodStart: { storeId, periodStart: start } },
      });
    }
    throw err;
  }

  const subscriptionPrice = toDecimal(period.subscriptionPrice);
  if (subscriptionPrice.gt(0)) {
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
    amount: Decimal;
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
}): Decimal {
  const value = toDecimal(order.subtotal).minus(toDecimal(order.discountAmount));
  return value.isNegative() ? ZERO : value;
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
  const feeRate = toDecimal(period.platformFeeRate);
  const feeAmount = roundMoney(eligible.mul(feeRate));
  if (feeAmount.lte(0)) return;

  const booked = await createLedgerEntry(db, {
    storeId: order.storeId,
    billingPeriodId: period.id,
    type: BillingEntryType.PLATFORM_FEE,
    amount: feeAmount,
    currency: period.currency,
    description: `Platform fee (${feeRate.mul(100).toFixed(2)}%) — order ${order.id}`,
    referenceType: 'Order',
    referenceId: order.id,
    metadata: { eligibleOrderValue: eligible.toFixed(2), feeRate: feeRate.toFixed(4) },
  });
  if (!booked) return;

  await db.billingPeriod.update({
    where: { id: period.id },
    data: {
      // eligibleGmv is gross — it is never reduced by a later refund. See
      // BILLING_ARCHITECTURE.md "Eligible GMV is gross, not net-of-refund".
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

  const refundAmount = toDecimal(params.refundAmount);
  const orderTotal = toDecimal(params.orderTotal);
  const ratio = orderTotal.gt(0) ? Prisma.Decimal.min(refundAmount.div(orderTotal), 1) : ZERO;
  const adjustment = roundMoney(toDecimal(originalFee.amount).mul(ratio));
  if (adjustment.lte(0)) return;

  const booked = await createLedgerEntry(db, {
    storeId: params.storeId,
    billingPeriodId: originalFee.billingPeriodId,
    type: BillingEntryType.ADJUSTMENT,
    amount: adjustment.negated(),
    currency: originalFee.currency,
    description: `Platform fee refund adjustment — return ${params.returnRequestId}`,
    referenceType: 'ReturnRequest',
    referenceId: params.returnRequestId,
    metadata: { refundAmount: params.refundAmount, orderTotal: params.orderTotal, ratio: ratio.toFixed(4) },
  });
  if (!booked || !originalFee.billingPeriodId) return null;

  // Deliberately writes to originalFee.billingPeriodId regardless of that
  // period's current status — a refund correctly adjusts the period the
  // original fee was earned in, even if that period has since closed. See
  // BILLING_ARCHITECTURE.md "Closed periods can still receive adjustments".
  await db.billingPeriod.update({
    where: { id: originalFee.billingPeriodId },
    data: { platformFeeAmount: { decrement: adjustment } },
  });

  // Reported back to the caller (return.service.ts) so invoice.service.ts
  // can react if that period has already been invoiced — billing.service.ts
  // itself stays entirely unaware of Invoice, keeping the dependency
  // one-directional (invoice.service.ts depends on this file, never the
  // reverse). See MERCHANT_PAYMENT_ARCHITECTURE_PROPOSAL.md.
  return { billingPeriodId: originalFee.billingPeriodId, adjustmentAmount: adjustment };
}

// ---------------------------------------------------------------------------
// Merchant credit — represented as signed BillingLedgerEntry rows of type
// CREDIT rather than a separate table: positive when credit is issued
// (overpayment, a refund arriving after its invoice was already paid),
// negative when consumed (applied against a later invoice). A store's
// available balance is simply the sum. This reuses the existing ledger's
// idempotency/append-only/tenant-scoping guarantees instead of building a
// second, parallel financial-events table. See BILLING_ARCHITECTURE.md.
// ---------------------------------------------------------------------------

/** Idempotent — a duplicate call for the same (referenceType, referenceId)
 * is a no-op, exactly like fee/adjustment booking. */
export async function issueCredit(
  db: Db,
  params: {
    storeId: string;
    amount: Decimal;
    currency?: string;
    referenceType: string;
    referenceId: string;
    description: string;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<boolean> {
  if (params.amount.lte(0)) return false;
  return createLedgerEntry(db, {
    storeId: params.storeId,
    billingPeriodId: null,
    type: BillingEntryType.CREDIT,
    amount: params.amount,
    currency: params.currency ?? 'BDT',
    description: params.description,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    metadata: params.metadata,
  });
}

/** Idempotent — a duplicate call for the same (referenceType, referenceId)
 * is a no-op. `referenceType`/`referenceId` should identify what consumed
 * the credit (typically `'Invoice'` + the invoice's id), so at most one
 * consumption entry can ever exist per invoice. */
export async function consumeCredit(
  db: Db,
  params: {
    storeId: string;
    amount: Decimal;
    currency?: string;
    referenceType: string;
    referenceId: string;
    description: string;
  },
): Promise<boolean> {
  if (params.amount.lte(0)) return false;
  return createLedgerEntry(db, {
    storeId: params.storeId,
    billingPeriodId: null,
    type: BillingEntryType.CREDIT,
    amount: params.amount.negated(),
    currency: params.currency ?? 'BDT',
    description: params.description,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
  });
}

/** Current available balance — the sum of every CREDIT entry (issuances
 * positive, consumptions negative) for the store. Never cached; this is a
 * single indexed aggregate, cheap enough to compute live on every read. */
export async function getAvailableCredit(db: Db, storeId: string): Promise<Decimal> {
  const agg = await db.billingLedgerEntry.aggregate({
    where: { storeId, type: BillingEntryType.CREDIT },
    _sum: { amount: true },
  });
  return toDecimal(agg._sum.amount ?? 0);
}

/** Books a PAYMENT ledger entry for a verified merchant payment. Idempotent
 * via the same (storeId, referenceType, referenceId, type) uniqueness as
 * every other ledger entry — a duplicate verification attempt for the same
 * payment is a silent no-op, never a second entry. billing.service.ts stays
 * unaware of MerchantPayment/Invoice; the caller (merchant-payment.service.ts)
 * only needs to hand this a storeId, amount, and a reference id. */
export async function bookMerchantPaymentReceived(
  db: Db,
  params: {
    storeId: string;
    amount: Decimal;
    currency?: string;
    referenceId: string;
    description: string;
  },
): Promise<boolean> {
  if (params.amount.lte(0)) return false;
  return createLedgerEntry(db, {
    storeId: params.storeId,
    billingPeriodId: null,
    type: BillingEntryType.PAYMENT,
    amount: params.amount,
    currency: params.currency ?? 'BDT',
    description: params.description,
    referenceType: 'MerchantPayment',
    referenceId: params.referenceId,
  });
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

/** Display-only conversion to plain JS numbers for JSON API responses — the
 * values here are already-rounded, final ledger amounts, never inputs to
 * further calculation, so this is not subject to the same precision
 * concerns as the arithmetic above. */
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
  const subscriptionPrice = toDecimal(period.subscriptionPrice);
  const platformFeeAmount = toDecimal(period.platformFeeAmount);
  return {
    id: period.id,
    storeId: period.storeId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    status: period.status,
    planSlug: period.planSlug,
    planName: period.planName,
    subscriptionPrice: subscriptionPrice.toNumber(),
    platformFeeRate: toNumber(period.platformFeeRate as never),
    currency: period.currency,
    eligibleGmv: toNumber(period.eligibleGmv as never),
    platformFeeAmount: platformFeeAmount.toNumber(),
    totalDue: subscriptionPrice.plus(platformFeeAmount).toNumber(),
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
