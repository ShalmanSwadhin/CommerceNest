import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { hasDatabase } from './test/setup.js';
import { initRedis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import * as trialService from './services/trial.service.js';
import * as invoiceService from './services/invoice.service.js';
import * as merchantPaymentService from './services/merchant-payment.service.js';
import * as storeService from './services/store.service.js';

const app = createApp();

let periodCounter = 1000; // offset from invoice-payment-billing.test.ts's own counter

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

async function makeStore() {
  const slug = uniqueSlug('billnotif');
  const { store } = await trialService.createTrialLead({
    prospectName: 'Test Owner',
    businessName: `Billing Notif Test ${slug}`,
    phone: `018${String(Math.floor(10000000 + Math.random() * 89999999))}`,
    email: `${slug}@example.com`,
    password: 'TestPass123!',
    confirmPassword: 'TestPass123!',
  });
  await prisma.store.update({ where: { id: store.id }, data: { isTrial: false } });
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: store.ownerUserId } });
  return { storeId: store.id, ownerId: owner.id, ownerEmail: owner.email };
}

async function makeClosedPeriod(
  storeId: string,
  amounts: { subscriptionPrice: number; platformFeeAmount: number },
) {
  periodCounter += 1;
  const periodStart = new Date(Date.UTC(2016, periodCounter % 12, 1));
  const periodEnd = new Date(Date.UTC(2016, (periodCounter % 12) + 1, 1));
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
      currency: 'BDT',
    },
  });
}

/** emitAfterCommit runs its subscriber via queueMicrotask + real DB I/O
 * inside the handler — not synchronously awaited by the caller. Poll
 * instead of a fixed sleep, since a fixed delay is either flaky (too
 * short) or wastes real test time (too long, "just in case"). */
async function waitForNotification(
  where: Parameters<typeof prisma.notification.findFirst>[0]['where'],
  timeoutMs = 3000,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await prisma.notification.findFirst({ where });
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

describe.skipIf(!hasDatabase)('Store-facing notifications — overdue invoices', () => {
  beforeAll(async () => {
    await initRedis();
  });

  it('the store owner (not just Master Admin) is notified when their invoice goes OVERDUE', async () => {
    const { storeId, ownerId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 400, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { dueDate: new Date(Date.now() - 1000) } });

    await invoiceService.getInvoiceDetail(storeId, invoice.id); // triggers the OVERDUE transition

    const ownerNotification = await prisma.notification.findFirst({
      where: { userId: ownerId, type: 'INVOICE_OVERDUE', body: { contains: invoice.invoiceNumber } },
    });
    expect(ownerNotification).not.toBeNull();
    expect(ownerNotification!.storeId).toBe(storeId);

    const admin = await masterAdminActor();
    const adminNotification = await prisma.notification.findFirst({
      where: { userId: admin.id, type: 'INVOICE_OVERDUE', body: { contains: invoice.invoiceNumber } },
    });
    expect(adminNotification).not.toBeNull();
  });

  it('a store staff member with no billing role does NOT get the overdue notification (matches BILLING_ROLES)', async () => {
    const { storeId } = await makeStore();
    const inventoryManager = await prisma.user.create({
      data: {
        email: `${uniqueSlug('inv-mgr')}@example.com`,
        name: 'Inventory Manager',
        role: 'INVENTORY_MANAGER',
        status: 'ACTIVE',
        storeId,
        passwordHash: 'x',
      },
    });
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 250, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { dueDate: new Date(Date.now() - 1000) } });

    await invoiceService.getInvoiceDetail(storeId, invoice.id);

    const notified = await prisma.notification.findFirst({
      where: { userId: inventoryManager.id, type: 'INVOICE_OVERDUE' },
    });
    expect(notified).toBeNull();
  });
});

describe.skipIf(!hasDatabase)('Store-facing notifications — payment claim outcome', () => {
  it('the store owner is notified when their payment claim is APPROVED', async () => {
    const { storeId, ownerId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 700, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BKASH',
      amount: 700,
      referenceId: uniqueSlug('approve-notif-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await merchantPaymentService.approvePayment(payment.id, admin.id);

    const notified = await prisma.notification.findFirst({
      where: { userId: ownerId, type: 'MERCHANT_PAYMENT_APPROVED', body: { contains: invoice.invoiceNumber } },
    });
    expect(notified).not.toBeNull();
    expect(notified!.body).toContain('approved');
  });

  it('the store owner is notified WHY when their payment claim is REJECTED', async () => {
    const { storeId, ownerId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 500, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    const payment = await merchantPaymentService.submitPaymentClaim(storeId, {
      invoiceId: invoice.id,
      method: 'MANUAL_BANK_TRANSFER',
      amount: 500,
      referenceId: uniqueSlug('reject-notif-ref'),
      transferDate: new Date(),
    });
    const admin = await masterAdminActor();
    await merchantPaymentService.rejectPayment(payment.id, admin.id, 'Bank reference does not match our records');

    const notified = await prisma.notification.findFirst({
      where: { userId: ownerId, type: 'MERCHANT_PAYMENT_REJECTED' },
    });
    expect(notified).not.toBeNull();
    expect(notified!.body).toContain('Bank reference does not match our records');
  });
});

describe.skipIf(!hasDatabase)('Suspension eligibility list (manual review only — never auto-suspends)', () => {
  afterEach(async () => {
    await invoiceService.setOverdueGraceDays(14); // restore default for other tests
  });

  it('reflects the configured grace period — a store overdue for FEWER days than the grace period is not listed', async () => {
    await invoiceService.setOverdueGraceDays(30);
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 1000, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    // Overdue by 10 days — less than the 30-day grace period just configured.
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    });
    await invoiceService.getInvoiceDetail(storeId, invoice.id); // triggers OVERDUE

    const eligible = await invoiceService.getSuspensionEligibleStores();
    expect(eligible.some((e) => e.storeId === storeId)).toBe(false);
  });

  it('lists a store overdue for MORE days than the grace period, with the correct amount and day count', async () => {
    await invoiceService.setOverdueGraceDays(5);
    const { storeId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 1500, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    const overdueDays = 20;
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { dueDate: new Date(Date.now() - overdueDays * 24 * 60 * 60 * 1000) },
    });
    await invoiceService.getInvoiceDetail(storeId, invoice.id);

    const eligible = await invoiceService.getSuspensionEligibleStores();
    const row = eligible.find((e) => e.storeId === storeId);
    expect(row).toBeTruthy();
    expect(row!.totalOverdue).toBeCloseTo(1500, 2);
    expect(row!.daysOverdue).toBeGreaterThanOrEqual(overdueDays - 1); // day-boundary tolerance
    expect(row!.invoiceNumbers).toContain(invoice.invoiceNumber);
  });

  it('never lists a store that is already SUSPENDED or ARCHIVED', async () => {
    await invoiceService.setOverdueGraceDays(1);
    const { storeId, ownerId } = await makeStore();
    const period = await makeClosedPeriod(storeId, { subscriptionPrice: 900, platformFeeAmount: 0 });
    await invoiceService.ensureInvoicesForClosedPeriods(storeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { billingPeriodId: period.id } });
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    });
    await invoiceService.getInvoiceDetail(storeId, invoice.id);

    const admin = await masterAdminActor();
    await storeService.suspendStore(storeId, 'Test suspension for eligibility-list check', {
      id: admin.id,
      role: admin.role,
    });

    const eligible = await invoiceService.getSuspensionEligibleStores();
    expect(eligible.some((e) => e.storeId === storeId)).toBe(false);
    void ownerId; // used only to keep makeStore's destructure symmetric with other tests
  });
});

describe.skipIf(!hasDatabase)('Manual suspension notifies the store owner why (not a silent status flip)', () => {
  it('suspending a store notifies its owner with the exact reason given', async () => {
    const { storeId, ownerId } = await makeStore();
    const admin = await masterAdminActor();
    const reason = 'Non-payment — 1959.00 overdue by 20 days across invoice(s) CN-TEST-000001.';

    await storeService.suspendStore(storeId, reason, { id: admin.id, role: admin.role });

    const notified = await waitForNotification({ userId: ownerId, type: 'STORE_SUSPENDED' });
    expect(notified).not.toBeNull();
    expect(notified!.body).toBe(reason);
    expect(notified!.storeId).toBe(storeId);
  });
});

describe.skipIf(!hasDatabase)('Suspension access control', () => {
  beforeAll(async () => {
    await initRedis();
  });

  it('a non-master-admin (store owner) cannot see the suspension-eligibility list or trigger a suspension', async () => {
    const loginOwner = await request(app).post('/api/auth/login').send({
      email: 'owner@techworld.bd',
      password: 'Owner123!',
    });
    expect(loginOwner.status).toBe(200);
    const ownerToken = loginOwner.body.accessToken as string;
    const ownerStoreId = loginOwner.body.user.storeId as string;

    const eligibleList = await request(app)
      .get('/api/admin/billing/suspension-eligible')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(eligibleList.status).toBe(403);

    const suspend = await request(app)
      .post(`/api/admin/stores/${ownerStoreId}/suspend`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reason: 'Attempting self-suspend as a non-admin' });
    expect(suspend.status).toBe(403);
  });
});
