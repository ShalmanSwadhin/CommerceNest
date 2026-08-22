import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { hasDatabase } from './test/setup.js';
import { initRedis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import * as trialService from './services/trial.service.js';
import * as packageService from './services/package.service.js';
import * as orderService from './services/order.service.js';
import * as returnService from './services/return.service.js';
import * as invoiceService from './services/invoice.service.js';
import * as merchantPaymentService from './services/merchant-payment.service.js';
import { toDecimal } from './services/billing.service.js';

const app = createApp();

let periodCounter = 0;

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

async function makeStore(overrides: { planTier?: string } = {}) {
  const slug = uniqueSlug('invtest');
  const { store } = await trialService.createTrialLead({
    prospectName: 'Test Owner',
    businessName: `Invoice Test ${slug}`,
    phone: `018${String(Math.floor(10000000 + Math.random() * 89999999))}`,
    email: `${slug}@example.com`,
    password: 'TestPass123!',
    confirmPassword: 'TestPass123!',
  });
  // Most of this file's tests insert BillingPeriod rows directly
  // (makeClosedPeriod), bypassing getOrCreateCurrentBillingPeriod entirely
  // — but the end-to-end return.service.ts test drives a real order through
  // real delivery, which does go through it for real. Trial stores are
  // correctly billed nothing (see billing-usage.test.ts's dedicated trial
  // suite), so these need to be converted stores to exercise real fee
  // booking, matching what a real paying merchant looks like.
  await prisma.store.update({
    where: { id: store.id },
    data: { isTrial: false, ...(overrides.planTier ? { planTier: overrides.planTier } : {}) },
  });
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: store.ownerUserId } });
  return { storeId: store.id, ownerId: owner.id };
}

async function makeTestPlan(params: { monthlyPrice?: number; platformFeeRate?: number } = {}) {
  const slug = uniqueSlug('invplan');
  const pkg = await packageService.createPackage(
    {
      name: `Invoice Test Plan ${slug}`,
      slug,
      monthlyPrice: params.monthlyPrice ?? 0,
      maxProducts: null,
      maxStaff: null,
      storageLimitMb: null,
      platformFeeRate: params.platformFeeRate ?? 0,
    },
    await masterAdminActor(),
  );
  return pkg.slug;
}

/** Directly inserts an already-CLOSED BillingPeriod with caller-controlled
 * snapshot amounts, bypassing the calendar-driven rollover in
 * getOrCreateCurrentBillingPeriod — the fastest, most exact way to get a
 * period ready for invoice generation without waiting for real time to
 * pass. Each call uses a distinct historical periodStart so the
 * (storeId, periodStart) unique constraint never collides across tests. */
async function makeClosedPeriod(
  storeId: string,
  amounts: { subscriptionPrice: number; platformFeeAmount: number; currency?: string },
) {
  periodCounter += 1;
  const periodStart = new Date(Date.UTC(2015, periodCounter, 1));
  const periodEnd = new Date(Date.UTC(2015, periodCounter + 1, 1));
  return prisma.billingPeriod.create({
    data: {
      storeId,
      periodStart,
      periodEnd,
      status: 'CLOSED',
      planSlug: 'test-plan',
      planName: 'Test Plan',
      subscriptionPrice: amounts.subscriptionPrice,
      platformFeeRate: 0,
      platformFeeAmount: amounts.platformFeeAmount,
      currency: amounts.currency ?? 'BDT',
    },
  });
}

describe.skipIf(!hasDatabase)('Invoice generation', () => {
  beforeAll(async () => {
    await initRedis();
  });

  it('generates an invoice for a closed period with the correct frozen snapshot amounts', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 1500, platformFeeAmount: 45.5 });

    await invoiceService.ensureInvoicesForClosedPeriods(storeId);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    expect(Number(invoice.subscriptionAmount)).toBeCloseTo(1500, 2);
    expect(Number(invoice.platformFeeAmount)).toBeCloseTo(45.5, 2);
    expect(Number(invoice.totalAmount)).toBeCloseTo(1545.5, 2);
    expect(invoice.status).toBe('ISSUED');
  });

  it('invoice number is unique and human-readable (CN-YYYY-MM-NNNNNN)', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 100, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    expect(invoice.invoiceNumber).toMatch(/^CN-\d{4}-\d{2}-\d{6}$/);
  });

  it('is idempotent — generating twice never creates a second invoice for the same period', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 200, platformFeeAmount: 10 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);

    const invoices = await prisma.invoice.findMany({ where: { billingPeriodId: period.id } });
    expect(invoices).toHaveLength(1);
  });

  it('database-level uniqueness holds even under concurrent generation attempts', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 300, platformFeeAmount: 15 });

    await Promise.all(
      Array.from({ length: 5 }, () => invoiceService.ensureInvoicesForClosedPeriods(storeId)),
    );

    const invoices = await prisma.invoice.findMany({ where: { billingPeriodId: period.id } });
    expect(invoices).toHaveLength(1);
  });

  it('due date defaults to issuance + 7 days, is configurable, and never rewrites an already-issued invoice', async () => {
    const { storeId } = await makeStore();
    const periodA = await makeClosedPeriod(storeId, { subscriptionPrice: 100, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoiceA = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: periodA.id } });
    const daysA = Math.round(
      (invoiceA.dueDate.getTime() - invoiceA.issueDate.getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(daysA).toBe(7);

    await invoiceService.setInvoicePaymentTermDays(14);
    const periodB = await makeClosedPeriod(storeId, { subscriptionPrice: 100, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoiceB = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: periodB.id } });
    const daysB = Math.round(
      (invoiceB.dueDate.getTime() - invoiceB.issueDate.getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(daysB).toBe(14);

    // The config change must not retroactively touch invoiceA's already-issued due date.
    const invoiceAReloaded = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceA.id } });
    expect(invoiceAReloaded.dueDate.getTime()).toBe(invoiceA.dueDate.getTime());

    await invoiceService.setInvoicePaymentTermDays(7); // restore default for other tests
  });

  it('a later Package price change never alters an already-issued invoice', async () => {
    const planSlug = await makeTestPlan({ monthlyPrice: 999 });
    const { storeId } = await makeStore({ planTier: planSlug });
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 999, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });

    await prisma.package.update({ where: { slug: planSlug }, data: { monthlyPrice: 5000 } });

    const reloaded = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(Number(reloaded.subscriptionAmount)).toBeCloseTo(999, 2);
  });

  it('Master Admin platform-wide views generate invoices for stores nobody has individually touched', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 321, platformFeeAmount: 0 });

    // Deliberately never call ensureInvoicesForClosedPeriods(storeId) or any
    // store-scoped read for this store first — simulates a store whose
    // merchant never opened their own billing page and whose Master Admin
    // never drilled into that specific store's detail page either.
    const invoiceBefore = await prisma.invoice.findUnique({ where: { billingPeriodId: period.id } });
    expect(invoiceBefore).toBeNull();

    const summary = await invoiceService.getPlatformBillingSummary();
    expect(summary.totalInvoiced).toBeGreaterThanOrEqual(321);

    const invoiceAfter = await prisma.invoice.findUnique({ where: { billingPeriodId: period.id } });
    expect(invoiceAfter).not.toBeNull();
    expect(Number(invoiceAfter!.totalAmount)).toBeCloseTo(321, 2);

    const list = await invoiceService.listAllInvoices({ storeId, limit: 10 });
    expect(list.items.some((inv) => inv.billingPeriodId === period.id)).toBe(true);
  });
});

describe.skipIf(!hasDatabase)('Merchant payment claims', () => {
  it('a bKash claim is created PENDING_VERIFICATION and does not mark the invoice paid', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 1000, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });

    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 1000,
      referenceId: uniqueSlug('bkash-ref'),
      transferDate: new Date(),
    });
    expect(payment.status).toBe('PENDING_VERIFICATION');

    const stillInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stillInvoice.status).toBe('ISSUED');
    expect(Number(stillInvoice.amountPaid)).toBe(0);
  });

  it('a bank transfer claim is created the same way', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 500, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });

    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BANK_TRANSFER',
      amount: 500,
      referenceId: uniqueSlug('bank-ref'),
      transferDate: new Date(),
    });
    expect(payment.method).toBe('MANUAL_BANK_TRANSFER');
    expect(payment.status).toBe('PENDING_VERIFICATION');
  });

  it('rejects a duplicate transaction reference while the first claim is still live, but allows resubmission after rejection', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 800, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    const referenceId = uniqueSlug('dup-ref');

    const first = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 800,
      referenceId,
      transferDate: new Date(),
    });

    await expect(
      merchantPaymentService.submitPaymentClaim(storeId, {
        invoiceId: invoice.id,
        method: 'MANUAL_BKASH',
        amount: 800,
        referenceId,
        transferDate: new Date(),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const admin = await masterAdminActor();
    await merchantPaymentService.rejectPayment(first.id, admin.id, 'Could not confirm this transaction');

    await expect(
      merchantPaymentService.submitPaymentClaim(storeId, {
        invoiceId: invoice.id,
        method: 'MANUAL_BKASH',
        amount: 800,
        referenceId,
        transferDate: new Date(),
      }),
    ).resolves.toMatchObject({ status: 'PENDING_VERIFICATION' });
  });

  it('a store cannot submit a claim against, or read, another store\'s invoice', async () => {
    const { storeId: storeA } = await makeStore();
    const { storeId: storeB } = await makeStore();
    const periodB = await makeClosedPeriod(storeB, { subscriptionPrice: 700, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeB);
    const invoiceB = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: periodB.id } });

    await expect(
      merchantPaymentService.submitPaymentClaim(storeA, {
        invoiceId: invoiceB.id,
        method: 'MANUAL_BKASH',
        amount: 700,
        referenceId: uniqueSlug('cross-ref'),
        transferDate: new Date(),
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    await expect(invoiceService.getInvoiceDetail(storeA, invoiceB.id)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe.skipIf(!hasDatabase)('Payment verification — approve / reject', () => {
  async function invoicedStore(subscriptionPrice: number) {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    return { storeId, invoice };
  }

  it('exact payment: invoice becomes PAID, ledger PAYMENT entry booked exactly once', async () => {
    const { storeId, invoice } = await invoicedStore(1200);
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 1200,
      referenceId: uniqueSlug('exact-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await merchantPaymentService.approvePayment(payment.id, admin.id);

    const reloaded = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(reloaded.status).toBe('PAID');
    expect(Number(reloaded.amountPaid)).toBeCloseTo(1200, 2);

    const ledgerEntries = await prisma.billingLedgerEntry.findMany({
      where: { storeId, referenceType: 'MerchantPayment', referenceId: payment.id, type: 'PAYMENT' },
    });
    expect(ledgerEntries).toHaveLength(1);
  });

  it('underpayment leaves the invoice PARTIALLY_PAID with the correct amount due', async () => {
    const { storeId, invoice } = await invoicedStore(1000);
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 400,
      referenceId: uniqueSlug('under-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await merchantPaymentService.approvePayment(payment.id, admin.id);

    const detail = await invoiceService.getInvoiceDetail(storeId, invoice.id);
    expect(detail.invoice.status).toBe('PARTIALLY_PAID');
    expect(detail.invoice.amountDue).toBeCloseTo(600, 2);
  });

  it('overpayment marks the invoice PAID and issues the excess as merchant credit', async () => {
    const { storeId, invoice } = await invoicedStore(1000);
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 1250,
      referenceId: uniqueSlug('over-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await merchantPaymentService.approvePayment(payment.id, admin.id);

    const detail = await invoiceService.getInvoiceDetail(storeId, invoice.id);
    expect(detail.invoice.status).toBe('PAID');
    expect(Number(detail.invoice.amountPaid)).toBeCloseTo(1000, 2);
    expect(detail.availableCredit).toBeCloseTo(250, 2);
  });

  it('a rejected claim never touches the ledger or the invoice balance, and records the reason/verifier', async () => {
    const { storeId, invoice } = await invoicedStore(600);
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 600,
      referenceId: uniqueSlug('reject-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    const rejected = await merchantPaymentService.rejectPayment(payment.id, admin.id, 'Reference not found in bank statement');

    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectionReason).toBe('Reference not found in bank statement');
    expect(rejected.verifiedById).toBe(admin.id);

    const reloadedInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(reloadedInvoice.status).toBe('ISSUED');
    expect(Number(reloadedInvoice.amountPaid)).toBe(0);

    const ledgerEntries = await prisma.billingLedgerEntry.findMany({
      where: { storeId, referenceType: 'MerchantPayment', referenceId: payment.id },
    });
    expect(ledgerEntries).toHaveLength(0);

    // The claim is kept, not deleted — it remains an audit record.
    const stillExists = await prisma.merchantPayment.findUnique({ where: { id: payment.id } });
    expect(stillExists).not.toBeNull();
  });

  it('a payment cannot be approved twice, sequentially or concurrently', async () => {
    const { storeId, invoice } = await invoicedStore(900);
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 900,
      referenceId: uniqueSlug('double-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await merchantPaymentService.approvePayment(payment.id, admin.id);

    await expect(merchantPaymentService.approvePayment(payment.id, admin.id)).rejects.toMatchObject({
      statusCode: 409,
      code: 'PAYMENT_ALREADY_VERIFIED',
    });

    const reloaded = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(Number(reloaded.amountPaid)).toBeCloseTo(900, 2); // not double-applied

    const ledgerEntries = await prisma.billingLedgerEntry.findMany({
      where: { storeId, referenceType: 'MerchantPayment', referenceId: payment.id, type: 'PAYMENT' },
    });
    expect(ledgerEntries).toHaveLength(1);
  });

  it('concurrent double-click approval: exactly one of two simultaneous approvals succeeds', async () => {
    const { storeId, invoice } = await invoicedStore(750);
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 750,
      referenceId: uniqueSlug('concurrent-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();

    const results = await Promise.allSettled([
      merchantPaymentService.approvePayment(payment.id, admin.id),
      merchantPaymentService.approvePayment(payment.id, admin.id),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const reloaded = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(Number(reloaded.amountPaid)).toBeCloseTo(750, 2);

    const ledgerEntries = await prisma.billingLedgerEntry.findMany({
      where: { storeId, referenceType: 'MerchantPayment', referenceId: payment.id, type: 'PAYMENT' },
    });
    expect(ledgerEntries).toHaveLength(1);
  });

  it('approving a payment never modifies the period\'s original SUBSCRIPTION_CHARGE ledger entry', async () => {
    const { storeId, invoice } = await invoicedStore(333.33);
    // makeClosedPeriod inserts the period directly (bypassing
    // getOrCreateCurrentBillingPeriod), so seed the SUBSCRIPTION_CHARGE
    // entry that a real period-open would have booked, to assert against.
    await prisma.billingLedgerEntry.create({
      data: {
        storeId,
        billingPeriodId: invoice.billingPeriodId,
        type: 'SUBSCRIPTION_CHARGE',
        amount: 333.33,
        currency: 'BDT',
        description: 'Test Plan — seeded subscription charge',
        referenceType: 'BillingPeriod',
        referenceId: invoice.billingPeriodId,
      },
    });
    const before = await prisma.billingLedgerEntry.findFirst({
      where: { storeId, billingPeriodId: invoice.billingPeriodId, type: 'SUBSCRIPTION_CHARGE' },
    });
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 333.33,
      referenceId: uniqueSlug('append-only-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await merchantPaymentService.approvePayment(payment.id, admin.id);

    const after = await prisma.billingLedgerEntry.findFirst({
      where: { storeId, billingPeriodId: invoice.billingPeriodId, type: 'SUBSCRIPTION_CHARGE' },
    });
    expect(after?.id).toBe(before?.id);
    expect(Number(after?.amount)).toBeCloseTo(Number(before?.amount), 2);
  });

  it('rejects a rejection with no reason', async () => {
    const { storeId, invoice } = await invoicedStore(200);
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 200,
      referenceId: uniqueSlug('noreason-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await expect(merchantPaymentService.rejectPayment(payment.id, admin.id, '')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe.skipIf(!hasDatabase)('Merchant credit — forward, not refunded', () => {
  it('applies automatically to the next invoice generated for that store', async () => {
    const { storeId } = await makeStore();
    const period1 = await makeClosedPeriod(storeId, { subscriptionPrice: 1000, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice1 = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period1.id } });

    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice1.id,
      method: 'MANUAL_BKASH',
      amount: 1200, // 200 overpayment
      referenceId: uniqueSlug('credit-src-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await merchantPaymentService.approvePayment(payment.id, admin.id);
    expect(await invoiceService.getStoreCreditBalance(storeId)).toBeCloseTo(200, 2);

    const period2 = await makeClosedPeriod(storeId, { subscriptionPrice: 500, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice2 = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period2.id } });

    expect(Number(invoice2.creditApplied)).toBeCloseTo(200, 2);
    expect(invoice2.status).toBe('PARTIALLY_PAID');
    expect(await invoiceService.getStoreCreditBalance(storeId)).toBeCloseTo(0, 2);

    // Generating again must never re-apply the credit a second time.
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice2Reloaded = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice2.id } });
    expect(Number(invoice2Reloaded.creditApplied)).toBeCloseTo(200, 2);
  });

  it('credit is strictly tenant-scoped — one store\'s credit never affects another\'s invoice', async () => {
    const { storeId: storeA } = await makeStore();
    const { storeId: storeB } = await makeStore();

    const periodA = await makeClosedPeriod(storeA, { subscriptionPrice: 1000, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeA);
    const invoiceA = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: periodA.id } });
    const paymentA = await merchantPaymentService.submitPaymentClaim(storeA, {
      invoiceId: invoiceA.id,
      method: 'MANUAL_BKASH',
      amount: 1500, // 500 overpayment on store A
      referenceId: uniqueSlug('tenant-credit-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await merchantPaymentService.approvePayment(paymentA.id, admin.id);
    expect(await invoiceService.getStoreCreditBalance(storeA)).toBeCloseTo(500, 2);
    expect(await invoiceService.getStoreCreditBalance(storeB)).toBe(0);

    const periodB = await makeClosedPeriod(storeB, { subscriptionPrice: 300, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeB);
    const invoiceB = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: periodB.id } });

    expect(Number(invoiceB.creditApplied)).toBe(0);
    expect(invoiceB.status).toBe('ISSUED');
  });

  it('CASE A — a late refund adjustment on an unpaid invoice reduces what is owed, no credit issued', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 0, platformFeeAmount: 1000 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });

    await invoiceService.applyLateRefundAdjustment(prisma, {
      storeId,
      billingPeriodId: period.id,
      adjustmentAmount: toDecimal(200),
      returnRequestId: uniqueSlug('case-a-rr'),
    });

    const reloaded = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(Number(reloaded.adjustmentAmount)).toBeCloseTo(-200, 2);
    expect(Number(reloaded.totalAmount)).toBeCloseTo(800, 2);
    expect(reloaded.status).toBe('ISSUED');
    expect(await invoiceService.getStoreCreditBalance(storeId)).toBe(0);
  });

  it('CASE B — a late refund on a partially-paid invoice that now exceeds the reduced total issues credit for the excess', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 0, platformFeeAmount: 1000 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 400,
      referenceId: uniqueSlug('case-b-pay-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await merchantPaymentService.approvePayment(payment.id, admin.id);

    // First adjustment: total drops to 800, still above the 400 already paid.
    await invoiceService.applyLateRefundAdjustment(prisma, {
      storeId,
      billingPeriodId: period.id,
      adjustmentAmount: toDecimal(200),
      returnRequestId: uniqueSlug('case-b-rr-1'),
    });
    let reloaded = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(reloaded.status).toBe('PARTIALLY_PAID');

    // Second adjustment: total drops to 300, now below the 400 already paid — the 100 excess becomes credit.
    await invoiceService.applyLateRefundAdjustment(prisma, {
      storeId,
      billingPeriodId: period.id,
      adjustmentAmount: toDecimal(500),
      returnRequestId: uniqueSlug('case-b-rr-2'),
    });
    reloaded = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(Number(reloaded.totalAmount)).toBeCloseTo(300, 2);
    expect(reloaded.status).toBe('PAID');
    expect(await invoiceService.getStoreCreditBalance(storeId)).toBeCloseTo(100, 2);
  });

  it('CASE C — a late refund on an already fully-paid invoice never rewrites it; issues credit instead, idempotently', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 0, platformFeeAmount: 300 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 300,
      referenceId: uniqueSlug('case-c-pay-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await merchantPaymentService.approvePayment(payment.id, admin.id);
    const paidSnapshot = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(paidSnapshot.status).toBe('PAID');

    const returnRequestId = uniqueSlug('case-c-rr');
    await invoiceService.applyLateRefundAdjustment(prisma, {
      storeId,
      billingPeriodId: period.id,
      adjustmentAmount: toDecimal(100),
      returnRequestId,
    });

    const untouched = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(Number(untouched.totalAmount)).toBeCloseTo(300, 2);
    expect(Number(untouched.adjustmentAmount)).toBeCloseTo(0, 2);
    expect(untouched.status).toBe('PAID');
    expect(await invoiceService.getStoreCreditBalance(storeId)).toBeCloseTo(100, 2);

    // Duplicate call with the same returnRequestId (e.g. a retried refund) must never double-credit.
    await invoiceService.applyLateRefundAdjustment(prisma, {
      storeId,
      billingPeriodId: period.id,
      adjustmentAmount: toDecimal(100),
      returnRequestId,
    });
    expect(await invoiceService.getStoreCreditBalance(storeId)).toBeCloseTo(100, 2);
  });

  it('end-to-end: a real refund on an already-invoiced, already-paid period issues credit via return.service.ts', async () => {
    const { storeId, ownerId } = await makeStore();

    const product = await prisma.product.create({
      data: {
        storeId,
        name: 'Refund Test Product',
        slug: uniqueSlug('refprod'),
        basePrice: 1000,
        status: 'ACTIVE',
        variants: { create: [{ storeId, sku: uniqueSlug('SKU'), stock: 10 }] },
      },
      include: { variants: true },
    });
    const variant = product.variants[0]!;
    const customer = await prisma.customer.create({
      data: { storeId, name: 'Refund Customer', email: `${uniqueSlug('refcust')}@example.com`, passwordHash: 'x' },
    });
    const order = await prisma.order.create({
      data: {
        storeId,
        customerId: customer.id,
        orderNumber: `TEST-${uniqueSlug('refund-ord')}`,
        status: 'CONFIRMED',
        paymentMethod: 'CASH_ON_DELIVERY',
        paymentStatus: 'PENDING',
        subtotal: 1000,
        discountAmount: 0,
        deliveryCharge: 0,
        total: 1000,
        deliveryAddress: {
          line1: 'x',
          area: 'x',
          district: 'x',
          division: 'x',
          recipientName: 'x',
          recipientPhone: '01712345678',
          label: 'Home',
        },
        items: {
          create: {
            storeId,
            productId: product.id,
            variantId: variant.id,
            productName: product.name,
            variantLabel: variant.sku,
            unitPrice: 1000,
            quantity: 1,
            lineTotal: 1000,
          },
        },
      },
    });

    await orderService.transitionOrderStatus(storeId, order.id, { status: 'PROCESSING' }, { id: ownerId });
    await orderService.transitionOrderStatus(
      storeId,
      order.id,
      { status: 'SHIPPED', courierTrackingId: 'TRK-REFUND-TEST' },
      { id: ownerId },
    );
    await orderService.transitionOrderStatus(storeId, order.id, { status: 'DELIVERED' }, { id: ownerId });

    const feeEntry = await prisma.billingLedgerEntry.findFirstOrThrow({
      where: { storeId, referenceType: 'Order', referenceId: order.id, type: 'PLATFORM_FEE' },
    });
    const billingPeriodId = feeEntry.billingPeriodId!;

    // Manually close and invoice that period, then fully pay it.
    await prisma.billingPeriod.update({ where: { id: billingPeriodId }, data: { status: 'CLOSED' } });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId } });
    const admin = await masterAdminActor();
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: Number(invoice.totalAmount),
      referenceId: uniqueSlug('e2e-pay-ref'),
      transferDate: new Date(),
    });
    await merchantPaymentService.approvePayment(payment.id, admin.id);
    const paidInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(paidInvoice.status).toBe('PAID');

    const creditBefore = await invoiceService.getStoreCreditBalance(storeId);

    // Now the store returns/refunds this order — a period that's already invoiced AND paid.
    const returnRequest = await prisma.returnRequest.create({
      data: {
        storeId,
        orderId: order.id,
        customerId: customer.id,
        reason: 'Refund credit end-to-end test',
        status: 'ITEM_RECEIVED',
      },
    });
    await returnService.completeRefund(storeId, returnRequest.id, {
      refundAmount: 1000,
      refundMethod: 'BKASH',
    });

    const invoiceAfterRefund = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(invoiceAfterRefund.status).toBe('PAID');
    expect(Number(invoiceAfterRefund.totalAmount)).toBeCloseTo(Number(paidInvoice.totalAmount), 2);

    const creditAfter = await invoiceService.getStoreCreditBalance(storeId);
    expect(creditAfter).toBeGreaterThan(creditBefore);
  });
});

describe.skipIf(!hasDatabase)('Payment verification security', () => {
  beforeAll(async () => {
    await initRedis();
  });

  it('a non-master-admin token is rejected by every merchant-payment verification route', async () => {
    const loginOwner = await request(app).post('/api/auth/login').send({
      email: 'owner@techworld.bd',
      password: 'Owner123!',
    });
    expect(loginOwner.status).toBe(200);
    const ownerToken = loginOwner.body.accessToken as string;

    const pending = await request(app)
      .get('/api/admin/merchant-payments/pending')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(pending.status).toBe(403);

    const approve = await request(app)
      .post('/api/admin/merchant-payments/nonexistent/approve')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(approve.status).toBe(403);

    const reject = await request(app)
      .post('/api/admin/merchant-payments/nonexistent/reject')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reason: 'test' });
    expect(reject.status).toBe(403);

    const allPayments = await request(app)
      .get('/api/admin/merchant-payments')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(allPayments.status).toBe(403);

    const billingSummary = await request(app)
      .get('/api/admin/billing/summary')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(billingSummary.status).toBe(403);
  });
});

describe.skipIf(!hasDatabase)('Overdue detection (computed on read, no scheduled job)', () => {
  beforeAll(async () => {
    await initRedis();
  });

  it('an invoice past its due date with nothing paid becomes OVERDUE the next time it is read', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 500, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    expect(invoice.status).toBe('ISSUED');

    // Simulate time passing — push the due date into the past directly,
    // the same way a real invoice's due date is eventually just "before
    // now" without needing to actually wait 7 real days in a test.
    await prisma.invoice.update({ where: { id: invoice.id }, data: { dueDate: new Date(Date.now() - 1000) } });

    const detail = await invoiceService.getInvoiceDetail(storeId, invoice.id);
    expect(detail.invoice.status).toBe('OVERDUE');

    const reloaded = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(reloaded.status).toBe('OVERDUE');
  });

  it('a PARTIALLY_PAID invoice past its due date also becomes OVERDUE', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 1000, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 300,
      referenceId: uniqueSlug('overdue-partial-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await merchantPaymentService.approvePayment(payment.id, admin.id);

    await prisma.invoice.update({ where: { id: invoice.id }, data: { dueDate: new Date(Date.now() - 1000) } });
    const detail = await invoiceService.getInvoiceDetail(storeId, invoice.id);
    expect(detail.invoice.status).toBe('OVERDUE');
    expect(detail.invoice.amountDue).toBeCloseTo(700, 2);
  });

  it('a PAID invoice is never marked OVERDUE even after its due date passes', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 250, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 250,
      referenceId: uniqueSlug('overdue-paid-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await merchantPaymentService.approvePayment(payment.id, admin.id);

    await prisma.invoice.update({ where: { id: invoice.id }, data: { dueDate: new Date(Date.now() - 1000) } });
    const detail = await invoiceService.getInvoiceDetail(storeId, invoice.id);
    expect(detail.invoice.status).toBe('PAID');
  });

  it('crossing into OVERDUE notifies every active Master Admin exactly once (reuses the existing Notification system)', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 600, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { dueDate: new Date(Date.now() - 1000) } });

    const admin = await masterAdminActor();
    const before = await prisma.notification.count({
      where: { userId: admin.id, type: 'INVOICE_OVERDUE', body: { contains: invoice.invoiceNumber } },
    });

    await invoiceService.getInvoiceDetail(storeId, invoice.id); // first read: triggers the transition
    await invoiceService.getInvoiceDetail(storeId, invoice.id); // second read: already OVERDUE, must not re-notify

    const after = await prisma.notification.count({
      where: { userId: admin.id, type: 'INVOICE_OVERDUE', body: { contains: invoice.invoiceNumber } },
    });
    expect(after - before).toBe(1);
  });
});

describe.skipIf(!hasDatabase)('Confirmed revenue split (subscription vs. platform fee, PAID-only)', () => {
  it('getPlatformBillingSummary\'s confirmed revenue matches the sum of actually-approved payments, never unpaid invoice totals', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 800, platformFeeAmount: 200 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });

    const before = await invoiceService.getPlatformBillingSummary();

    // Fully pay this invoice — subscriptionAmount:platformFeeAmount is 800:200 (4:1),
    // so the entire 1000 settled should split 800/200 exactly.
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 1000,
      referenceId: uniqueSlug('revenue-split-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await merchantPaymentService.approvePayment(payment.id, admin.id);

    const after = await invoiceService.getPlatformBillingSummary();
    expect(after.confirmedSubscriptionRevenue - before.confirmedSubscriptionRevenue).toBeCloseTo(800, 2);
    expect(after.confirmedPlatformFeeRevenue - before.confirmedPlatformFeeRevenue).toBeCloseTo(200, 2);

    // An unpaid invoice from a second store must NOT move the confirmed total at all.
    const { storeId: storeB } = await makeStore();
    const periodB = await makeClosedPeriod(storeB, { subscriptionPrice: 5000, platformFeeAmount: 5000 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeB);
    const afterUnpaidInvoice = await invoiceService.getPlatformBillingSummary();
    expect(afterUnpaidInvoice.confirmedSubscriptionRevenue).toBeCloseTo(after.confirmedSubscriptionRevenue, 2);
    expect(afterUnpaidInvoice.confirmedPlatformFeeRevenue).toBeCloseTo(after.confirmedPlatformFeeRevenue, 2);
    // But the huge unpaid invoice IS reflected in outstanding, proving the
    // two figures are never conflated into one number.
    expect(afterUnpaidInvoice.totalOutstanding).toBeGreaterThanOrEqual(10000);
  });

  it('a partially-paid invoice prorates its settled amount across subscription/fee using its own split', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 600, platformFeeAmount: 400 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });

    const before = await invoiceService.getPlatformBillingSummary();
    // Half the invoice (500 of 1000) is paid — 60% subscription / 40% fee,
    // so 300 should land as subscription and 200 as platform fee.
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 500,
      referenceId: uniqueSlug('proration-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await merchantPaymentService.approvePayment(payment.id, admin.id);

    const after = await invoiceService.getPlatformBillingSummary();
    expect(after.confirmedSubscriptionRevenue - before.confirmedSubscriptionRevenue).toBeCloseTo(300, 2);
    expect(after.confirmedPlatformFeeRevenue - before.confirmedPlatformFeeRevenue).toBeCloseTo(200, 2);
  });
});

describe.skipIf(!hasDatabase)('Platform-wide payment history (listAllPayments)', () => {
  it('returns real payment records across every status and store, with the verifying admin\'s name joined', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 450, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    const referenceId = uniqueSlug('history-ref');
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 450,
      referenceId,
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await merchantPaymentService.approvePayment(payment.id, admin.id);

    const list = await merchantPaymentService.listAllPayments({ storeId, limit: 10 });
    const found = list.items.find((p) => p.referenceId === referenceId);
    expect(found).toBeTruthy();
    expect(found!.status).toBe('APPROVED');
    expect(found!.amount).toBeCloseTo(450, 2);
    expect(found!.store.id).toBe(storeId);
    expect(found!.invoice.invoiceNumber).toBe(invoice.invoiceNumber);
    expect(found!.verifiedBy?.id).toBe(admin.id);
  });

  it('filters by status — a rejected claim never shows up when filtering for APPROVED', async () => {
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 350, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    const referenceId = uniqueSlug('history-rejected-ref');
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 350,
      referenceId,
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await merchantPaymentService.rejectPayment(payment.id, admin.id, 'Test rejection for filter check');

    const approvedOnly = await merchantPaymentService.listAllPayments({ storeId, status: 'APPROVED', limit: 10 });
    expect(approvedOnly.items.some((p) => p.referenceId === referenceId)).toBe(false);

    const rejectedOnly = await merchantPaymentService.listAllPayments({ storeId, status: 'REJECTED', limit: 10 });
    expect(rejectedOnly.items.some((p) => p.referenceId === referenceId)).toBe(true);
  });
});
