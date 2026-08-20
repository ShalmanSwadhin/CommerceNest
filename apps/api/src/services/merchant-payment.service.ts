import { ApiErrorCode, MerchantPaymentStatus, InvoiceStatus } from '@commercenest/types';
import { prisma, isUniqueConstraintError } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { withStoreLock } from './subscription.service.js';
import { toDecimal, bookMerchantPaymentReceived } from './billing.service.js';
import { applyVerifiedPaymentToInvoice, serializeMerchantPayment } from './invoice.service.js';
import { toNumber } from './order.service.js';
import { notifyMasterAdmins } from './notification.service.js';

// ---------------------------------------------------------------------------
// Merchant → CommerceNest payment claims (manual bKash / bank transfer only
// in V1). Entirely separate from Order's customer→merchant payment fields —
// never reuses Order.bkashTxnId or any customer-checkout payment machinery.
// ---------------------------------------------------------------------------

export async function submitPaymentClaim(
  storeId: string,
  params: {
    invoiceId: string;
    method: 'MANUAL_BKASH' | 'MANUAL_BANK_TRANSFER';
    amount: number;
    referenceId: string;
    transferDate: Date;
    note?: string;
  },
) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, storeId },
    include: { store: { select: { name: true } } },
  });
  if (!invoice) throw AppError.notFound('Invoice not found');
  if (invoice.status === InvoiceStatus.VOID) {
    throw AppError.badRequest('This invoice has been voided and cannot accept payment.');
  }
  if (invoice.status === InvoiceStatus.PAID) {
    throw new AppError(400, ApiErrorCode.INVOICE_ALREADY_PAID, 'This invoice has already been paid in full.');
  }

  const amount = toDecimal(params.amount);
  if (amount.lte(0)) throw AppError.badRequest('Payment amount must be greater than zero.');

  try {
    const payment = await prisma.merchantPayment.create({
      data: {
        storeId,
        invoiceId: invoice.id,
        method: params.method,
        amount,
        currency: invoice.currency,
        referenceId: params.referenceId,
        transferDate: params.transferDate,
        note: params.note,
        status: MerchantPaymentStatus.PENDING_VERIFICATION,
      },
    });
    // Best-effort — a merchant's payment claim must succeed even if the
    // admin-inbox notification write fails for some reason.
    await notifyMasterAdmins({
      type: 'MERCHANT_PAYMENT_SUBMITTED',
      title: 'New merchant payment claim',
      body: `${invoice.store.name} submitted a ${payment.method === 'MANUAL_BKASH' ? 'bKash' : 'bank transfer'} claim for ${invoice.currency} ${amount.toFixed(2)} against invoice ${invoice.invoiceNumber}.`,
      storeId,
    }).catch(() => undefined);
    return serializeMerchantPayment(payment);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw AppError.conflict(
        'This transaction/reference ID is already attached to another pending or approved payment claim.',
      );
    }
    throw err;
  }
}

/** Merchant can cancel their own claim while it's still awaiting
 * verification — never after Master Admin has acted on it. */
export async function cancelPaymentClaim(storeId: string, paymentId: string) {
  const payment = await prisma.merchantPayment.findFirst({ where: { id: paymentId, storeId } });
  if (!payment) throw AppError.notFound('Payment claim not found');

  return withStoreLock(storeId, async (tx) => {
    const current = await tx.merchantPayment.findUniqueOrThrow({ where: { id: paymentId } });
    if (current.status !== MerchantPaymentStatus.PENDING_VERIFICATION) {
      throw AppError.conflict('Only a payment claim still awaiting verification can be cancelled.');
    }
    const updated = await tx.merchantPayment.update({
      where: { id: paymentId },
      data: { status: MerchantPaymentStatus.CANCELLED },
    });
    return serializeMerchantPayment(updated);
  });
}

export async function listPaymentsForStore(storeId: string) {
  const payments = await prisma.merchantPayment.findMany({
    where: { storeId },
    orderBy: { submittedAt: 'desc' },
  });
  return payments.map(serializeMerchantPayment);
}

// ---------------------------------------------------------------------------
// Master Admin verification — "critical" idempotency: protects against
// double-click, repeated approval requests, and concurrent approval
// attempts by re-reading the payment's status INSIDE a store-row lock
// (withStoreLock, the same primitive used for product/staff/storage limit
// races) before doing anything financial. Duplicate transaction/reference
// IDs are additionally blocked at the database level (see the migration's
// partial unique index) — this lock alone would not be enough on its own.
// ---------------------------------------------------------------------------

export async function listPendingPayments(params: { page?: number; limit?: number } = {}) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const [items, total] = await Promise.all([
    prisma.merchantPayment.findMany({
      where: { status: MerchantPaymentStatus.PENDING_VERIFICATION },
      include: {
        store: { select: { id: true, name: true, slug: true } },
        invoice: { select: { id: true, invoiceNumber: true, totalAmount: true, dueDate: true } },
      },
      orderBy: { submittedAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.merchantPayment.count({ where: { status: MerchantPaymentStatus.PENDING_VERIFICATION } }),
  ]);
  return {
    items: items.map((p) => ({
      ...serializeMerchantPayment(p),
      store: p.store,
      invoice: { ...p.invoice, totalAmount: toNumber(p.invoice.totalAmount as never) },
    })),
    total,
    page,
    limit,
  };
}

export async function approvePayment(paymentId: string, verifiedById: string) {
  const existing = await prisma.merchantPayment.findUnique({ where: { id: paymentId } });
  if (!existing) throw AppError.notFound('Payment claim not found');

  return withStoreLock(existing.storeId, async (tx) => {
    const payment = await tx.merchantPayment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.status !== MerchantPaymentStatus.PENDING_VERIFICATION) {
      throw new AppError(
        409,
        ApiErrorCode.PAYMENT_ALREADY_VERIFIED,
        'This payment claim has already been verified — it cannot be approved twice.',
      );
    }

    const amount = toDecimal(payment.amount);
    const booked = await bookMerchantPaymentReceived(tx, {
      storeId: payment.storeId,
      amount,
      currency: payment.currency,
      referenceId: payment.id,
      description: `Payment received — ${payment.method} — ref ${payment.referenceId}`,
    });
    if (!booked) {
      // Ledger entry already exists for this payment (should be unreachable
      // given the PENDING_VERIFICATION check above, but the ledger's own
      // idempotency is the real safety net) — refuse to double-approve.
      throw AppError.conflict('This payment has already been recorded.');
    }

    await applyVerifiedPaymentToInvoice(tx, {
      invoiceId: payment.invoiceId,
      paymentId: payment.id,
      paymentAmount: amount,
    });

    const updated = await tx.merchantPayment.update({
      where: { id: paymentId },
      data: {
        status: MerchantPaymentStatus.APPROVED,
        verifiedAt: new Date(),
        verifiedById,
      },
    });
    return serializeMerchantPayment(updated);
  });
}

export async function rejectPayment(paymentId: string, verifiedById: string, rejectionReason: string) {
  if (!rejectionReason.trim()) throw AppError.badRequest('A rejection reason is required.');

  const existing = await prisma.merchantPayment.findUnique({ where: { id: paymentId } });
  if (!existing) throw AppError.notFound('Payment claim not found');

  return withStoreLock(existing.storeId, async (tx) => {
    const payment = await tx.merchantPayment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.status !== MerchantPaymentStatus.PENDING_VERIFICATION) {
      throw new AppError(
        409,
        ApiErrorCode.PAYMENT_ALREADY_VERIFIED,
        'This payment claim has already been verified.',
      );
    }

    // Rejected claims never touch the ledger or the invoice balance — the
    // claim itself is kept (never deleted) as an audit record.
    const updated = await tx.merchantPayment.update({
      where: { id: paymentId },
      data: {
        status: MerchantPaymentStatus.REJECTED,
        verifiedAt: new Date(),
        verifiedById,
        rejectionReason,
      },
    });
    return serializeMerchantPayment(updated);
  });
}
