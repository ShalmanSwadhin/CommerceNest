import { z } from 'zod';
import { Prisma } from '@commercenest/prisma';
import { InvoiceStatus } from '@commercenest/types';
import { prisma, isUniqueConstraintError } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { withStoreLock } from './subscription.service.js';
import {
  getOrCreateCurrentBillingPeriod,
  issueCredit,
  consumeCredit,
  getAvailableCredit,
  toDecimal,
  roundMoney,
  type Db,
  type Decimal,
} from './billing.service.js';
import { toNumber } from './order.service.js';

const ZERO = new Prisma.Decimal(0);

// ---------------------------------------------------------------------------
// Payment term (days to pay) — configurable via the existing generic
// PlatformSettings mechanism (already reachable through GET/PATCH
// /admin/settings, audit-logged), mirroring trial.service.ts's
// getDefaultTrialDurationDays/setDefaultTrialDurationDays exactly rather
// than inventing a new configuration system.
// ---------------------------------------------------------------------------

const DEFAULT_PAYMENT_TERM_DAYS = 7;
const PAYMENT_TERM_SETTING_KEY = 'billing.invoicePaymentTermDays';

export async function getInvoicePaymentTermDays(): Promise<number> {
  const setting = await prisma.platformSettings.findUnique({
    where: { key: PAYMENT_TERM_SETTING_KEY },
  });
  const value = setting?.value;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return DEFAULT_PAYMENT_TERM_DAYS;
}

export async function setInvoicePaymentTermDays(days: number) {
  const parsed = z.number().int().min(1).max(90).parse(days);
  return prisma.platformSettings.upsert({
    where: { key: PAYMENT_TERM_SETTING_KEY },
    create: { key: PAYMENT_TERM_SETTING_KEY, value: parsed },
    update: { value: parsed },
  });
}

// ---------------------------------------------------------------------------
// Payment instructions — where a merchant sends manual bKash/bank payments.
// Same generic PlatformSettings mechanism, read-only from the store side
// (the existing /admin/settings/:key route already lets Master Admin write
// it — no new admin route needed).
// ---------------------------------------------------------------------------

const PAYMENT_INSTRUCTIONS_KEY = 'billing.paymentInstructions';

export interface PaymentInstructions {
  bkashNumber: string;
  bkashType: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankRoutingNumber: string;
  notes: string;
}

const DEFAULT_PAYMENT_INSTRUCTIONS: PaymentInstructions = {
  bkashNumber: '',
  bkashType: 'Merchant/Send Money',
  bankName: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankRoutingNumber: '',
  notes: '',
};

export async function getPaymentInstructions(): Promise<PaymentInstructions> {
  const setting = await prisma.platformSettings.findUnique({ where: { key: PAYMENT_INSTRUCTIONS_KEY } });
  if (!setting || typeof setting.value !== 'object' || setting.value === null) {
    return DEFAULT_PAYMENT_INSTRUCTIONS;
  }
  return { ...DEFAULT_PAYMENT_INSTRUCTIONS, ...(setting.value as Partial<PaymentInstructions>) };
}

// ---------------------------------------------------------------------------
// Invoice numbers — CN-YYYY-MM-NNNNNN, backed by a real Postgres SEQUENCE
// (see the migration), not a read-modify-write counter. nextval() is
// atomic and collision-free under any concurrency with no locking needed.
// ---------------------------------------------------------------------------

async function nextInvoiceNumber(db: Db): Promise<string> {
  const rows = await db.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('invoice_number_seq') AS nextval`;
  const seq = rows[0]!.nextval;
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const padded = String(seq).padStart(6, '0');
  return `CN-${year}-${month}-${padded}`;
}

// ---------------------------------------------------------------------------
// Invoice generation — "Billing Period CLOSE → Invoice ISSUED", triggered
// lazily (the next time anything reads this store's billing), mirroring how
// BillingPeriod's own rollover is already lazy — no scheduled job.
// Idempotent at the database level via Invoice.billingPeriodId's unique
// constraint: a duplicate generation attempt (concurrent call, or invoked
// twice) hits that constraint and returns the already-existing invoice
// instead of creating a second one.
// ---------------------------------------------------------------------------

async function generateInvoiceForPeriod(
  db: Db,
  period: {
    id: string;
    storeId: string;
    subscriptionPrice: unknown;
    platformFeeAmount: unknown;
    currency: string;
  },
) {
  const subscriptionAmount = toDecimal(period.subscriptionPrice);
  const platformFeeAmount = toDecimal(period.platformFeeAmount);
  const totalAmount = roundMoney(subscriptionAmount.plus(platformFeeAmount));
  const paymentTermDays = await getInvoicePaymentTermDays();
  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime() + paymentTermDays * 24 * 60 * 60 * 1000);

  let invoice;
  try {
    const invoiceNumber = await nextInvoiceNumber(db);
    invoice = await db.invoice.create({
      data: {
        storeId: period.storeId,
        billingPeriodId: period.id,
        invoiceNumber,
        issueDate,
        dueDate,
        currency: period.currency,
        subscriptionAmount,
        platformFeeAmount,
        adjustmentAmount: 0,
        totalAmount,
        status: InvoiceStatus.ISSUED,
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      // Already generated by a concurrent caller — idempotent no-op. A
      // failed create() inside a transaction poisons that transaction (Postgres
      // rejects every further statement on it until rollback), so this can't
      // requery on the same `db` here; the caller is responsible for
      // re-reading afterward with a fresh client if it needs the row.
      return null;
    }
    throw err;
  }

  await applyAvailableCreditToInvoice(db, invoice);
  return db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
}

/** The actual "closes automatically" entry point — call this wherever a
 * store's invoices/billing are about to be read. Closes any stale open
 * period first (BillingPeriod's own existing lazy-rollover), then
 * generates an invoice for any CLOSED period that doesn't have one yet. */
export async function ensureInvoicesForClosedPeriods(storeId: string) {
  await getOrCreateCurrentBillingPeriod(storeId);
  const uninvoiced = await prisma.billingPeriod.findMany({
    where: { storeId, status: 'CLOSED', invoice: null },
    select: { id: true, storeId: true, subscriptionPrice: true, platformFeeAmount: true, currency: true },
  });
  for (const period of uninvoiced) {
    await withStoreLock(storeId, (tx) => generateInvoiceForPeriod(tx, period));
  }
}

/** Platform-wide equivalent of ensureInvoicesForClosedPeriods, for Master
 * Admin's cross-store views (listAllInvoices, getPlatformBillingSummary).
 * Without this, a store whose merchant never opens their own billing page
 * — and whose Master Admin never opens that specific store's detail page
 * either — would have closed periods that never generate an invoice, so
 * platform-wide totals would silently understate reality. Still fully lazy
 * (triggered by Master Admin viewing platform billing, not a scheduled
 * job), just widened from "one store" to "every store with a closed,
 * uninvoiced period." */
async function ensureInvoicesForAllClosedPeriods() {
  const uninvoiced = await prisma.billingPeriod.findMany({
    where: { status: 'CLOSED', invoice: null },
    select: { id: true, storeId: true, subscriptionPrice: true, platformFeeAmount: true, currency: true },
  });
  for (const period of uninvoiced) {
    await withStoreLock(period.storeId, (tx) => generateInvoiceForPeriod(tx, period));
  }
}

// ---------------------------------------------------------------------------
// Credit application at issuance — "When the next invoice is generated,
// available merchant credit may be applied automatically." Caps at
// amountDue, so this can never itself create an overpayment.
// ---------------------------------------------------------------------------

async function applyAvailableCreditToInvoice(
  db: Db,
  invoice: { id: string; storeId: string; totalAmount: unknown; amountPaid: unknown; creditApplied: unknown; currency: string; invoiceNumber: string },
) {
  const available = await getAvailableCredit(db, invoice.storeId);
  if (available.lte(0)) return;

  const amountDue = Prisma.Decimal.max(
    toDecimal(invoice.totalAmount).minus(toDecimal(invoice.amountPaid)).minus(toDecimal(invoice.creditApplied)),
    ZERO,
  );
  if (amountDue.lte(0)) return;

  const toApply = Prisma.Decimal.min(available, amountDue);
  const consumed = await consumeCredit(db, {
    storeId: invoice.storeId,
    amount: toApply,
    currency: invoice.currency,
    referenceType: 'Invoice',
    referenceId: invoice.id,
    description: `Credit applied to invoice ${invoice.invoiceNumber}`,
  });
  if (!consumed) return;

  await db.invoice.update({ where: { id: invoice.id }, data: { creditApplied: { increment: toApply } } });
  await recomputeInvoiceStatus(db, invoice.id);
}

// ---------------------------------------------------------------------------
// Status — derived from amountPaid + creditApplied vs. totalAmount, never
// set directly by any "mark paid" shortcut. VOID/DRAFT are never
// auto-transitioned out of by this function.
// ---------------------------------------------------------------------------

async function recomputeInvoiceStatus(db: Db, invoiceId: string) {
  const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.DRAFT) return invoice;

  const totalAmount = toDecimal(invoice.totalAmount);
  const settled = toDecimal(invoice.amountPaid).plus(toDecimal(invoice.creditApplied));
  const newStatus = settled.gte(totalAmount)
    ? InvoiceStatus.PAID
    : settled.gt(0)
      ? InvoiceStatus.PARTIALLY_PAID
      : invoice.status === InvoiceStatus.OVERDUE
        ? InvoiceStatus.OVERDUE
        : InvoiceStatus.ISSUED;

  if (newStatus === invoice.status) return invoice;
  return db.invoice.update({ where: { id: invoiceId }, data: { status: newStatus } });
}

/** Lazy OVERDUE transition, mirroring BillingPeriod's own lazy-rollover
 * philosophy — checked whenever an invoice is read for display, not on a
 * clock. Preserves any extra fields already present on `invoice` (e.g. a
 * joined `store`) by only touching `.status` on the returned object. */
async function syncOverdueStatus<T extends { id: string; status: string; dueDate: Date }>(
  db: Db,
  invoice: T,
): Promise<T> {
  if (
    (invoice.status === InvoiceStatus.ISSUED || invoice.status === InvoiceStatus.PARTIALLY_PAID) &&
    invoice.dueDate.getTime() < Date.now()
  ) {
    await db.invoice.update({ where: { id: invoice.id }, data: { status: InvoiceStatus.OVERDUE } });
    return { ...invoice, status: InvoiceStatus.OVERDUE };
  }
  return invoice;
}

// ---------------------------------------------------------------------------
// Payment application — called by merchant-payment.service.ts once Master
// Admin verifies a MerchantPayment. Caps what's applied to the invoice at
// amountDue; any excess becomes credit (overpayment policy), keyed by the
// payment's own id so this can never double-issue.
// ---------------------------------------------------------------------------

export async function applyVerifiedPaymentToInvoice(
  db: Db,
  params: { invoiceId: string; paymentId: string; paymentAmount: Decimal },
) {
  const invoice = await db.invoice.findUniqueOrThrow({ where: { id: params.invoiceId } });
  const amountDue = Prisma.Decimal.max(
    toDecimal(invoice.totalAmount).minus(toDecimal(invoice.amountPaid)).minus(toDecimal(invoice.creditApplied)),
    ZERO,
  );

  const applied = Prisma.Decimal.min(params.paymentAmount, amountDue);
  const excess = params.paymentAmount.minus(applied);

  if (applied.gt(0)) {
    await db.invoice.update({ where: { id: invoice.id }, data: { amountPaid: { increment: applied } } });
  }
  if (excess.gt(0)) {
    await issueCredit(db, {
      storeId: invoice.storeId,
      amount: excess,
      currency: invoice.currency,
      referenceType: 'MerchantPayment',
      referenceId: params.paymentId,
      description: `Overpayment credit — invoice ${invoice.invoiceNumber}`,
    });
  }

  await recomputeInvoiceStatus(db, invoice.id);
}

// ---------------------------------------------------------------------------
// Late refund adjustment — called by return.service.ts after
// billing.service.ts#bookRefundAdjustment reports a real (non-null)
// adjustment, i.e. an order from a previous period was just refunded and
// that period's platform fee was reduced. Reacts according to that
// period's invoice, if one already exists:
//   no invoice yet   → nothing to do; the eventual invoice will already
//                      reflect the (now-reduced) period total.
//   VOID             → not adjusted.
//   unpaid/partial   → reduce what's owed (adjustmentAmount/totalAmount).
//   already PAID     → never rewrite a paid invoice; issue credit instead.
// ---------------------------------------------------------------------------

export async function applyLateRefundAdjustment(
  db: Db,
  params: { storeId: string; billingPeriodId: string; adjustmentAmount: Decimal; returnRequestId: string },
) {
  const invoice = await db.invoice.findUnique({ where: { billingPeriodId: params.billingPeriodId } });
  if (!invoice || invoice.status === InvoiceStatus.VOID) return;

  if (invoice.status === InvoiceStatus.PAID) {
    await issueCredit(db, {
      storeId: params.storeId,
      amount: params.adjustmentAmount,
      currency: invoice.currency,
      referenceType: 'ReturnRequest',
      referenceId: params.returnRequestId,
      description: `Refund credit — invoice ${invoice.invoiceNumber} was already fully paid`,
    });
    return;
  }

  // adjustmentAmount is a positive reduction magnitude — applied as an
  // atomic relative decrement (never a read-then-write of an absolute
  // value), so two refunds landing on the same invoice concurrently can
  // never clobber one another the way a stale-read absolute write would.
  await db.invoice.update({
    where: { id: invoice.id },
    data: {
      adjustmentAmount: { decrement: params.adjustmentAmount },
      totalAmount: { decrement: params.adjustmentAmount },
    },
  });

  const reloaded = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  let totalAmount = toDecimal(reloaded.totalAmount);
  if (totalAmount.isNegative()) {
    // Defensive floor — bookRefundAdjustment's own ratio-capping should
    // make this unreachable, but an invoice must never show a negative
    // total. Also applied as a relative fix-up, for the same reason.
    const floorFix = totalAmount.negated();
    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        adjustmentAmount: { increment: floorFix },
        totalAmount: { increment: floorFix },
      },
    });
    totalAmount = ZERO;
  }

  // If the reduction leaves the invoice owing less than what's already
  // been paid/credited toward it, the excess becomes credit — keyed by
  // this specific refund event, so it can never double-issue.
  const settled = toDecimal(reloaded.amountPaid).plus(toDecimal(reloaded.creditApplied));
  if (settled.gt(totalAmount)) {
    const excess = roundMoney(settled.minus(totalAmount));
    if (excess.gt(0)) {
      await issueCredit(db, {
        storeId: params.storeId,
        amount: excess,
        currency: invoice.currency,
        referenceType: 'ReturnRequest',
        referenceId: params.returnRequestId,
        description: `Credit — a refund adjustment reduced invoice ${invoice.invoiceNumber} below what was already paid`,
      });
    }
  }

  await recomputeInvoiceStatus(db, invoice.id);
}

// ---------------------------------------------------------------------------
// Read views
// ---------------------------------------------------------------------------

// Platform-fee transparency (Phase 4 audit): the invoice only ever stored
// the computed fee *amount*, not the rate/eligible-GMV that produced it, so
// the merchant had no way to understand "why is this my platform fee"
// without doing their own math. The rate and eligible GMV already live on
// the linked BillingPeriod (frozen at period-open the same way the
// invoice's own amounts are frozen at issuance) — joining it in for display
// is read-only and changes no calculation.
const BILLING_PERIOD_RATE_SELECT = {
  billingPeriod: { select: { platformFeeRate: true, eligibleGmv: true } },
} satisfies Prisma.InvoiceInclude;

export async function getCurrentInvoiceForStore(storeId: string) {
  await ensureInvoicesForClosedPeriods(storeId);
  const invoice = await prisma.invoice.findFirst({
    where: { storeId },
    orderBy: { issueDate: 'desc' },
    include: BILLING_PERIOD_RATE_SELECT,
  });
  if (!invoice) return null;
  const synced = await syncOverdueStatus(prisma, invoice);
  return serializeInvoice(synced);
}

export async function listInvoicesForStore(storeId: string, params: { page?: number; limit?: number } = {}) {
  await ensureInvoicesForClosedPeriods(storeId);
  const page = params.page ?? 1;
  const limit = params.limit ?? 12;
  const [items, total] = await Promise.all([
    prisma.invoice.findMany({
      where: { storeId },
      orderBy: { issueDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: BILLING_PERIOD_RATE_SELECT,
    }),
    prisma.invoice.count({ where: { storeId } }),
  ]);
  const synced = await Promise.all(items.map((i) => syncOverdueStatus(prisma, i)));
  return { items: synced.map(serializeInvoice), total, page, limit };
}

export async function getInvoiceDetail(storeId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, storeId },
    include: BILLING_PERIOD_RATE_SELECT,
  });
  if (!invoice) throw AppError.notFound('Invoice not found');
  const synced = await syncOverdueStatus(prisma, invoice);
  const [payments, availableCredit] = await Promise.all([
    prisma.merchantPayment.findMany({ where: { invoiceId }, orderBy: { submittedAt: 'desc' } }),
    getAvailableCredit(prisma, storeId),
  ]);
  return {
    invoice: serializeInvoice(synced),
    payments: payments.map(serializeMerchantPayment),
    availableCredit: availableCredit.toNumber(),
  };
}

export async function getStoreCreditBalance(storeId: string) {
  const balance = await getAvailableCredit(prisma, storeId);
  return balance.toNumber();
}

function serializeInvoice(invoice: {
  id: string;
  storeId: string;
  billingPeriodId: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  subscriptionAmount: unknown;
  platformFeeAmount: unknown;
  adjustmentAmount: unknown;
  totalAmount: unknown;
  amountPaid: unknown;
  creditApplied: unknown;
  status: string;
  store?: { id: string; name: string; slug: string };
  billingPeriod?: { platformFeeRate: unknown; eligibleGmv: unknown } | null;
}) {
  const totalAmount = toDecimal(invoice.totalAmount);
  const amountPaid = toDecimal(invoice.amountPaid);
  const creditApplied = toDecimal(invoice.creditApplied);
  const amountDue = Prisma.Decimal.max(totalAmount.minus(amountPaid).minus(creditApplied), ZERO);
  return {
    id: invoice.id,
    storeId: invoice.storeId,
    billingPeriodId: invoice.billingPeriodId,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    subscriptionAmount: toNumber(invoice.subscriptionAmount as never),
    platformFeeAmount: toNumber(invoice.platformFeeAmount as never),
    adjustmentAmount: toNumber(invoice.adjustmentAmount as never),
    totalAmount: totalAmount.toNumber(),
    amountPaid: amountPaid.toNumber(),
    creditApplied: creditApplied.toNumber(),
    amountDue: amountDue.toNumber(),
    status: invoice.status,
    store: invoice.store,
    // Read-only context for "why is my platform fee what it is" — the rate
    // and eligible GMV that produced platformFeeAmount, frozen the same way
    // the amount itself is. Not present on invoices generated before this
    // field was added to the response (billingPeriod already deleted, or a
    // pre-Phase-4 invoice) — null in that case, handled by the UI.
    platformFeeRate: invoice.billingPeriod ? toNumber(invoice.billingPeriod.platformFeeRate as never) : null,
    eligibleGmv: invoice.billingPeriod ? toNumber(invoice.billingPeriod.eligibleGmv as never) : null,
  };
}

export function serializeMerchantPayment(payment: {
  id: string;
  storeId: string;
  invoiceId: string;
  method: string;
  amount: unknown;
  currency: string;
  referenceId: string;
  transferDate: Date;
  note: string | null;
  status: string;
  submittedAt: Date;
  verifiedAt: Date | null;
  verifiedById: string | null;
  rejectionReason: string | null;
}) {
  return {
    id: payment.id,
    storeId: payment.storeId,
    invoiceId: payment.invoiceId,
    method: payment.method,
    amount: toNumber(payment.amount as never),
    currency: payment.currency,
    referenceId: payment.referenceId,
    transferDate: payment.transferDate,
    note: payment.note,
    status: payment.status,
    submittedAt: payment.submittedAt,
    verifiedAt: payment.verifiedAt,
    verifiedById: payment.verifiedById,
    rejectionReason: payment.rejectionReason,
  };
}

// ---------------------------------------------------------------------------
// Master Admin — platform-wide invoice views
// ---------------------------------------------------------------------------

export async function listAllInvoices(
  params: { page?: number; limit?: number; storeId?: string; status?: string } = {},
) {
  await ensureInvoicesForAllClosedPeriods();
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const where: Prisma.InvoiceWhereInput = {
    ...(params.storeId ? { storeId: params.storeId } : {}),
    ...(params.status ? { status: params.status as never } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { store: { select: { id: true, name: true, slug: true } } },
      orderBy: { issueDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.invoice.count({ where }),
  ]);
  const synced = await Promise.all(items.map((i) => syncOverdueStatus(prisma, i)));
  return { items: synced.map(serializeInvoice), total, page, limit };
}

export async function getPlatformBillingSummary() {
  await ensureInvoicesForAllClosedPeriods();
  const [invoiceAgg, overdueCount, pendingPaymentsCount, creditAgg] = await Promise.all([
    prisma.invoice.aggregate({ _sum: { totalAmount: true, amountPaid: true, creditApplied: true } }),
    prisma.invoice.count({ where: { status: InvoiceStatus.OVERDUE } }),
    prisma.merchantPayment.count({ where: { status: 'PENDING_VERIFICATION' } }),
    prisma.billingLedgerEntry.aggregate({ where: { type: 'CREDIT' }, _sum: { amount: true } }),
  ]);
  const totalInvoiced = toDecimal(invoiceAgg._sum.totalAmount ?? 0);
  const totalCollected = toDecimal(invoiceAgg._sum.amountPaid ?? 0);
  const totalCreditApplied = toDecimal(invoiceAgg._sum.creditApplied ?? 0);
  const totalOutstanding = Prisma.Decimal.max(
    totalInvoiced.minus(totalCollected).minus(totalCreditApplied),
    ZERO,
  );
  const totalMerchantCredit = toDecimal(creditAgg._sum.amount ?? 0);
  return {
    totalInvoiced: totalInvoiced.toNumber(),
    totalCollected: totalCollected.toNumber(),
    totalOutstanding: totalOutstanding.toNumber(),
    totalMerchantCredit: totalMerchantCredit.toNumber(),
    pendingPaymentClaims: pendingPaymentsCount,
    overdueInvoices: overdueCount,
  };
}
