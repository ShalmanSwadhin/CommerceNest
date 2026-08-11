import {
  PaymentMethod,
  PaymentStatus,
  submitBkashPaymentSchema,
  verifyBkashPaymentSchema,
} from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { emitAfterCommit } from '../events/emit.js';
import { writeAuditLog } from './audit.service.js';
import { getOrder } from './order.service.js';

export async function listPendingBkash(storeId: string) {
  return prisma.order.findMany({
    where: {
      storeId,
      paymentMethod: PaymentMethod.MANUAL_BKASH,
      paymentStatus: PaymentStatus.PENDING_VERIFICATION,
    },
    include: {
      customer: {
        select: { id: true, name: true, phone: true, riskLevel: true },
      },
      items: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

/** Platform-wide pending manual bKash payments (Master Admin). */
export async function listPendingBkashAllStores() {
  const items = await prisma.order.findMany({
    where: {
      paymentMethod: PaymentMethod.MANUAL_BKASH,
      paymentStatus: PaymentStatus.PENDING_VERIFICATION,
    },
    include: {
      store: { select: { id: true, name: true, slug: true } },
      customer: {
        select: { id: true, name: true, phone: true, riskLevel: true },
      },
      items: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  return { items };
}

export async function verifyBkashPaymentByOrderId(
  orderId: string,
  approved: boolean,
  actor: {
    id: string;
    role: string;
    impersonationSessionId?: string;
    ip?: string;
    userAgent?: string;
  },
  rejectionReason?: string,
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, storeId: true },
  });
  if (!order) throw AppError.notFound('Order not found');

  return verifyBkashPayment(
    order.storeId,
    {
      orderId: order.id,
      approved,
      ...(rejectionReason !== undefined ? { rejectionReason } : {}),
    },
    actor,
  );
}

export async function submitBkashPayment(storeId: string, input: unknown) {
  const data = submitBkashPaymentSchema.parse(input);
  const order = await getOrder(storeId, data.orderId);

  if (order.paymentMethod !== PaymentMethod.MANUAL_BKASH) {
    throw AppError.badRequest('Order is not a MANUAL_BKASH payment');
  }

  if (
    order.paymentStatus !== PaymentStatus.PENDING &&
    order.paymentStatus !== PaymentStatus.PENDING_VERIFICATION &&
    order.paymentStatus !== PaymentStatus.REJECTED
  ) {
    throw AppError.conflict('Payment can no longer be submitted for this order');
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      bkashTxnId: data.bkashTxnId,
      bkashSenderPhone: data.bkashSenderPhone,
      bkashAmount: data.bkashAmount,
      bkashNote: data.bkashNote,
      paymentStatus: PaymentStatus.PENDING_VERIFICATION,
    },
  });

  emitAfterCommit('PaymentSubmitted', {
    storeId,
    actorId: null,
    payload: { storeId, orderId: order.id, method: 'MANUAL_BKASH' },
  });

  return updated;
}

export async function verifyBkashPayment(
  storeId: string,
  input: unknown,
  actor: {
    id: string;
    role: string;
    impersonationSessionId?: string;
    ip?: string;
    userAgent?: string;
  },
) {
  const data = verifyBkashPaymentSchema.parse(input);
  const order = await getOrder(storeId, data.orderId);

  if (order.paymentMethod !== PaymentMethod.MANUAL_BKASH) {
    throw AppError.badRequest('Order is not a MANUAL_BKASH payment');
  }
  if (order.paymentStatus !== PaymentStatus.PENDING_VERIFICATION) {
    throw AppError.conflict('Order is not awaiting bKash verification');
  }

  if (data.approved) {
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: PaymentStatus.APPROVED,
        isPaid: true,
        paymentVerifiedAt: new Date(),
        paymentVerifiedById: actor.id,
      },
    });

    await writeAuditLog({
      actorId: actor.id,
      actorRole: actor.role as never,
      action: 'PAYMENT_APPROVED',
      targetType: 'Order',
      targetId: order.id,
      storeId,
      impersonationSessionId: actor.impersonationSessionId,
      ip: actor.ip,
      userAgent: actor.userAgent,
      metadata: {
        bkashTxnId: order.bkashTxnId,
        method: 'MANUAL_BKASH',
      },
    });

    emitAfterCommit('PaymentApproved', {
      storeId,
      actorId: actor.id,
      payload: {
        storeId,
        orderId: order.id,
        verificationMethod: 'MANUAL_BKASH',
        verifiedByUserId: actor.id,
      },
    });

    return updated;
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: PaymentStatus.REJECTED,
      paymentVerifiedAt: new Date(),
      paymentVerifiedById: actor.id,
      bkashNote: data.rejectionReason,
    },
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'PAYMENT_REJECTED',
    targetType: 'Order',
    targetId: order.id,
    storeId,
    impersonationSessionId: actor.impersonationSessionId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: {
      bkashTxnId: order.bkashTxnId,
      rejectionReason: data.rejectionReason,
    },
  });

  emitAfterCommit('PaymentRejected', {
    storeId,
    actorId: actor.id,
    payload: {
      storeId,
      orderId: order.id,
      rejectionReason: data.rejectionReason ?? '',
      rejectedByUserId: actor.id,
    },
  });

  return updated;
}
