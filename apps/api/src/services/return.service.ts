import { z } from 'zod';
import { OrderStatus, ReturnStatus, PaymentStatus } from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { emitAfterCommit } from '../events/emit.js';
import { toNumber } from './order.service.js';
import { bookRefundAdjustment, toDecimal } from './billing.service.js';
import { applyLateRefundAdjustment } from './invoice.service.js';

const createReturnSchema = z
  .object({
    orderId: z.string().cuid(),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();

/** Customer-initiated return request (storefront, requires authenticated customer). */
export async function createReturnRequest(
  storeId: string,
  customerId: string,
  input: unknown,
) {
  const data = createReturnSchema.parse(input);
  const order = await prisma.order.findFirst({
    where: { id: data.orderId, storeId, customerId },
  });
  if (!order) throw AppError.notFound('Order not found');
  if (order.status !== OrderStatus.DELIVERED) {
    throw AppError.badRequest('Only delivered orders are eligible for return');
  }

  const existing = await prisma.returnRequest.findFirst({
    where: { orderId: order.id, status: { not: ReturnStatus.REJECTED } },
  });
  if (existing) {
    throw AppError.conflict('A return request already exists for this order');
  }

  const created = await prisma.returnRequest.create({
    data: { storeId, orderId: order.id, customerId, reason: data.reason },
  });

  emitAfterCommit('ReturnRequested', {
    storeId,
    actorId: customerId,
    payload: { storeId, returnId: created.id, orderId: order.id, customerId },
  });

  return created;
}

export async function listCustomerReturns(storeId: string, customerId: string) {
  return prisma.returnRequest.findMany({
    where: { storeId, customerId },
    include: { order: { select: { orderNumber: true, total: true } } },
    orderBy: { requestedAt: 'desc' },
  });
}

const listQuerySchema = z.object({
  status: z
    .enum(['REQUESTED', 'APPROVED', 'REJECTED', 'ITEM_RECEIVED', 'REFUNDED'])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function listReturns(storeId: string, query: unknown) {
  const q = listQuerySchema.parse(query);
  const where = { storeId, ...(q.status ? { status: q.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.returnRequest.findMany({
      where,
      include: {
        order: { select: { orderNumber: true, total: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { requestedAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.returnRequest.count({ where }),
  ]);
  return { items, total, page: q.page, limit: q.limit };
}

async function getOwnedReturn(storeId: string, returnId: string) {
  const found = await prisma.returnRequest.findFirst({
    where: { id: returnId, storeId },
    include: { order: true },
  });
  if (!found) throw AppError.notFound('Return request not found');
  return found;
}

const staffNoteSchema = z.object({ staffNote: z.string().trim().max(1000).optional() }).strict();
const rejectSchema = z.object({ staffNote: z.string().trim().min(1).max(1000) }).strict();

export async function approveReturn(storeId: string, returnId: string, input: unknown) {
  const data = staffNoteSchema.parse(input ?? {});
  const found = await getOwnedReturn(storeId, returnId);
  if (found.status !== ReturnStatus.REQUESTED) {
    throw AppError.conflict('Only requested returns can be approved');
  }
  const updated = await prisma.returnRequest.update({
    where: { id: found.id },
    data: { status: ReturnStatus.APPROVED, staffNote: data.staffNote, resolvedAt: new Date() },
  });
  emitAfterCommit('ReturnApproved', {
    storeId,
    actorId: null,
    payload: { storeId, returnId: found.id, orderId: found.orderId, customerId: found.customerId },
  });
  return updated;
}

export async function rejectReturn(storeId: string, returnId: string, input: unknown) {
  const data = rejectSchema.parse(input);
  const found = await getOwnedReturn(storeId, returnId);
  if (found.status !== ReturnStatus.REQUESTED) {
    throw AppError.conflict('Only requested returns can be rejected');
  }
  const updated = await prisma.returnRequest.update({
    where: { id: found.id },
    data: { status: ReturnStatus.REJECTED, staffNote: data.staffNote, resolvedAt: new Date() },
  });
  emitAfterCommit('ReturnRejected', {
    storeId,
    actorId: null,
    payload: { storeId, returnId: found.id, orderId: found.orderId, customerId: found.customerId },
  });
  return updated;
}

/** Staff confirms the physical item has been received back at the store —
 * the natural point to restore stock for a post-delivery return: the unit
 * is now physically confirmed back in hand (unlike CANCELLED/RETURNED-
 * before-delivery in order.service.ts, which restore at the status
 * transition itself since nothing physical needs confirming there). Guarded
 * by the APPROVED status check above, which only ever lets this run once
 * per return (a second call finds status already ITEM_RECEIVED and is
 * rejected before reaching the restock) — no separate idempotency key
 * needed. */
export async function markItemReceived(storeId: string, returnId: string) {
  const found = await getOwnedReturn(storeId, returnId);
  if (found.status !== ReturnStatus.APPROVED) {
    throw AppError.conflict('Return must be approved before the item can be marked received');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.returnRequest.update({
      where: { id: found.id },
      data: { status: ReturnStatus.ITEM_RECEIVED },
    });

    const items = await tx.orderItem.findMany({ where: { orderId: found.orderId, storeId } });
    for (const item of items) {
      await tx.variant.update({
        where: { id: item.variantId },
        data: { stock: { increment: item.quantity } },
      });
    }

    return updated;
  });
}

const refundSchema = z
  .object({
    refundAmount: z.number().positive(),
    refundMethod: z.enum(['BKASH', 'CASH', 'BANK_TRANSFER', 'STORE_CREDIT']),
  })
  .strict();

/** Manual refund completion — V1 has no automated bKash refund API. */
export async function completeRefund(storeId: string, returnId: string, input: unknown) {
  const data = refundSchema.parse(input);
  const found = await getOwnedReturn(storeId, returnId);
  if (found.status !== ReturnStatus.ITEM_RECEIVED) {
    throw AppError.conflict('Item must be marked received before the refund can be completed');
  }
  const orderTotal = toNumber(found.order.total);
  if (data.refundAmount > orderTotal) {
    throw AppError.badRequest('Refund amount cannot exceed the order total');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const ret = await tx.returnRequest.update({
      where: { id: found.id },
      data: {
        status: ReturnStatus.REFUNDED,
        refundAmount: data.refundAmount,
        refundMethod: data.refundMethod,
        refundedAt: new Date(),
      },
    });
    await tx.order.update({
      where: { id: found.orderId },
      data: { paymentStatus: PaymentStatus.REFUNDED },
    });

    // Proportionally reverses whatever platform fee was booked for this
    // order (a no-op if none was — e.g. the order was never delivered).
    // Keyed by this ReturnRequest's own id, so a retried/duplicate refund
    // call can never double-adjust.
    const adjustment = await bookRefundAdjustment(tx, {
      returnRequestId: found.id,
      orderId: found.orderId,
      storeId,
      refundAmount: data.refundAmount,
      orderTotal,
    });

    // If that order's billing period already has an issued invoice, react
    // to the reduced fee — CASE A/B (unpaid/partial) reduces what's owed,
    // CASE C (already paid) issues credit instead of rewriting history.
    if (adjustment) {
      await applyLateRefundAdjustment(tx, {
        storeId,
        billingPeriodId: adjustment.billingPeriodId,
        adjustmentAmount: toDecimal(adjustment.adjustmentAmount),
        returnRequestId: found.id,
      });
    }

    return ret;
  });

  emitAfterCommit('RefundCompleted', {
    storeId,
    actorId: null,
    payload: {
      storeId,
      returnId: found.id,
      orderId: found.orderId,
      customerId: found.customerId,
      refundAmount: String(data.refundAmount),
      refundMethod: data.refundMethod,
    },
  });

  return updated;
}
