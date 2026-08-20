import type { OrderStatus as PrismaOrderStatus, Prisma } from '@commercenest/prisma';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  orderListQuerySchema,
  updateOrderStatusSchema,
  confirmCodCallBodySchema,
  updateCourierBodySchema,
  type OrderStatus as OrderStatusType,
} from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { emitAfterCommit } from '../events/emit.js';
import { CUSTOMER_SAFE_SELECT } from './customer.service.js';
import { recalculateRisk } from './customer-risk.service.js';
import { bookPlatformFeeForOrder } from './billing.service.js';

/** Order status state machine */
export const ORDER_TRANSITIONS: Record<OrderStatusType, OrderStatusType[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  PROCESSING: [OrderStatus.SHIPPED],
  SHIPPED: [OrderStatus.DELIVERED, OrderStatus.RETURNED],
  DELIVERED: [],
  RETURNED: [],
  CANCELLED: [],
};

export function canTransition(
  from: OrderStatusType,
  to: OrderStatusType,
): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function toNumber(value: { toString(): string } | number | string) {
  return typeof value === 'number' ? value : Number(value);
}

export async function listOrders(storeId: string, query: unknown) {
  const q = orderListQuerySchema.parse(query);
  const where: Prisma.OrderWhereInput = { storeId };
  if (q.status) where.status = q.status;
  if (q.paymentMethod) where.paymentMethod = q.paymentMethod;
  if (q.paymentStatus) where.paymentStatus = q.paymentStatus;
  if (q.fromDate || q.toDate) {
    where.createdAt = {};
    if (q.fromDate) where.createdAt.gte = new Date(q.fromDate);
    if (q.toDate) where.createdAt.lte = new Date(q.toDate);
  }
  if (q.search) {
    where.OR = [
      { orderNumber: { contains: q.search, mode: 'insensitive' } },
      { customer: { phone: { contains: q.search } } },
      { customer: { name: { contains: q.search, mode: 'insensitive' } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            riskLevel: true,
          },
        },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.order.count({ where }),
  ]);

  return { items, total, page: q.page, limit: q.limit };
}

export async function getOrder(storeId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId },
    include: {
      customer: { select: CUSTOMER_SAFE_SELECT },
      items: true,
      statusHistory: { orderBy: { createdAt: 'asc' } },
      paymentVerifiedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });
  if (!order) throw AppError.notFound('Order not found');
  // Lets the Store Admin UI only ever offer status buttons that are
  // actually legal from here — reusing ORDER_TRANSITIONS (the same map
  // transitionOrderStatus enforces) rather than duplicating it client-side.
  return { ...order, allowedStatusTransitions: ORDER_TRANSITIONS[order.status as OrderStatusType] };
}

export async function confirmCodCall(
  storeId: string,
  orderId: string,
  rawInput: unknown,
  actorId: string,
) {
  const input = confirmCodCallBodySchema.parse(rawInput ?? {});
  const order = await getOrder(storeId, orderId);
  if (order.paymentMethod !== PaymentMethod.CASH_ON_DELIVERY) {
    throw AppError.badRequest('COD confirmation only applies to COD orders');
  }

  return prisma.order.update({
    where: { id: orderId },
    data: {
      codConfirmedByCall: true,
      codCallNote: input.codCallNote ?? input.overrideReason ?? null,
      callAttempts: { increment: 1 },
    },
  });
}

export async function updateCourier(
  storeId: string,
  orderId: string,
  rawInput: unknown,
) {
  const input = updateCourierBodySchema.parse(rawInput ?? {});
  await getOrder(storeId, orderId);
  return prisma.order.update({
    where: { id: orderId },
    data: {
      courierName: input.courierName,
      courierTrackingId: input.courierTrackingId,
      courierNotes: input.courierNotes,
    },
  });
}

export async function transitionOrderStatus(
  storeId: string,
  orderId: string,
  input: unknown,
  actor: { id: string; overrideReason?: string },
) {
  const data = updateOrderStatusSchema.parse({
    ...(typeof input === 'object' && input ? input : {}),
    orderId,
  });

  const order = await getOrder(storeId, orderId);
  const fromStatus = order.status as OrderStatusType;
  const toStatus = data.status as OrderStatusType;

  if (!canTransition(fromStatus, toStatus)) {
    throw AppError.conflict(
      `Illegal transition from ${fromStatus} to ${toStatus}`,
      { fromStatus, toStatus, allowed: ORDER_TRANSITIONS[fromStatus] },
    );
  }

  if (toStatus === OrderStatus.CONFIRMED) {
    if (order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY) {
      if (!order.codConfirmedByCall && !actor.overrideReason && !data.note) {
        throw AppError.badRequest(
          'COD orders require codConfirmedByCall or an override reason before CONFIRMED',
        );
      }
    }
    if (order.paymentMethod === PaymentMethod.MANUAL_BKASH) {
      if (order.paymentStatus !== PaymentStatus.APPROVED) {
        throw AppError.badRequest(
          'MANUAL_BKASH orders require paymentStatus APPROVED before CONFIRMED',
        );
      }
    }
  }

  if (toStatus === OrderStatus.SHIPPED) {
    if (!data.courierTrackingId && !order.courierTrackingId) {
      throw AppError.badRequest('Courier tracking ID is required when shipping');
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: toStatus as PrismaOrderStatus,
        courierName: data.courierName ?? order.courierName,
        courierTrackingId: data.courierTrackingId ?? order.courierTrackingId,
        courierNotes: data.courierNotes ?? order.courierNotes,
        ...(toStatus === OrderStatus.DELIVERED
          ? { isPaid: true }
          : {}),
        ...(toStatus === OrderStatus.CONFIRMED &&
        order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY &&
        !order.codConfirmedByCall
          ? {
              codConfirmedByCall: true,
              codCallNote: actor.overrideReason ?? data.note,
            }
          : {}),
      },
      include: { items: true, customer: { select: CUSTOMER_SAFE_SELECT } },
    });

    // DELIVERED is the one point in the order lifecycle where money is
    // realized for every payment method (isPaid flips true right above) —
    // so it's the single, deliberate trigger for the platform fee. See
    // billing.service.ts and BILLING_ARCHITECTURE.md "What orders generate
    // the platform fee".
    if (toStatus === OrderStatus.DELIVERED) {
      await bookPlatformFeeForOrder(tx, {
        id: updated.id,
        storeId,
        subtotal: updated.subtotal,
        discountAmount: updated.discountAmount,
      });
    }

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        storeId,
        fromStatus: fromStatus as PrismaOrderStatus,
        toStatus: toStatus as PrismaOrderStatus,
        actorId: actor.id,
        note: data.note ?? actor.overrideReason ?? null,
      },
    });

    // Stock decrement on CONFIRMED — this is the one point in the lifecycle
    // where stock actually leaves the pool (checkout deliberately does not
    // reserve it; PENDING is just customer intent). The decrement uses a
    // conditional `updateMany` (`stock >= quantity` in the WHERE clause,
    // `decrement` in the SET) rather than a read-then-write of an absolute
    // value — that read-then-write pattern is exactly the class of bug this
    // session's billing work found and fixed elsewhere (two concurrent
    // CONFIRMED transitions on orders sharing a variant could otherwise both
    // read the same stock, both compute the same "new" value, and both
    // commit it — overselling). The conditional update is atomic: Postgres
    // evaluates `stock >= quantity` against the row's current value at
    // write time, so the loser of a race always sees `count === 0`.
    if (toStatus === OrderStatus.CONFIRMED) {
      for (const item of updated.items) {
        const result = await tx.variant.updateMany({
          where: { id: item.variantId, storeId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (result.count === 0) {
          throw AppError.conflict('Insufficient stock', {
            code: 'INSUFFICIENT_STOCK',
            variantId: item.variantId,
          });
        }

        const variant = await tx.variant.findUnique({ where: { id: item.variantId } });
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (product && variant && variant.stock <= product.lowStockThreshold) {
          emitAfterCommit('ProductStockLow', {
            storeId,
            actorId: actor.id,
            payload: {
              storeId,
              productId: product.id,
              variantId: variant.id,
              currentStock: variant.stock,
              threshold: product.lowStockThreshold,
            },
          });
        }
      }
    }

    // Stock restoration — the mirror image of the CONFIRMED decrement
    // above, for every path where stock was reserved but the sale then
    // fell through before delivery: CONFIRMED→CANCELLED (PENDING→CANCELLED
    // never reserved anything, so nothing to restore there) and
    // SHIPPED→RETURNED (refused/undelivered — stock was reserved back at
    // CONFIRMED and never left the building). A relative `increment` is
    // inherently race-safe with no conditional needed. Post-delivery
    // returns are handled separately, at the point staff physically
    // confirms the item back (see return.service.ts#markItemReceived) —
    // not here, since DELIVERED has no outgoing transition in this map.
    if (
      (toStatus === OrderStatus.CANCELLED && fromStatus === OrderStatus.CONFIRMED) ||
      (toStatus === OrderStatus.RETURNED && fromStatus === OrderStatus.SHIPPED)
    ) {
      for (const item of updated.items) {
        await tx.variant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }

    // Risk recalculation on DELIVERED / RETURNED
    let riskChanged:
      | {
          previous: string;
          next: string;
          customerId: string;
        }
      | undefined;

    if (
      toStatus === OrderStatus.DELIVERED ||
      toStatus === OrderStatus.RETURNED
    ) {
      const customer = await tx.customer.findFirst({
        where: { id: order.customerId, storeId },
      });
      if (!customer) throw AppError.notFound('Customer not found');

      const previousRiskLevel = customer.riskLevel;
      const { counters, riskLevel } = recalculateRisk(
        {
          totalOrders: customer.totalOrders,
          deliveredOrders: customer.deliveredOrders,
          refusedOrders: customer.refusedOrders,
        },
        toStatus === OrderStatus.DELIVERED ? 'DELIVERED' : 'RETURNED',
      );

      await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalOrders: counters.totalOrders,
          deliveredOrders: counters.deliveredOrders,
          refusedOrders: counters.refusedOrders,
          riskLevel,
        },
      });

      if (previousRiskLevel !== riskLevel) {
        riskChanged = {
          previous: previousRiskLevel,
          next: riskLevel,
          customerId: customer.id,
        };
      }
    }

    return { updated, riskChanged };
  });

  emitAfterCommit('OrderStatusChanged', {
    storeId,
    actorId: actor.id,
    payload: {
      storeId,
      orderId,
      fromStatus,
      toStatus,
      actorId: actor.id,
    },
  });

  if (toStatus === OrderStatus.CONFIRMED) {
    emitAfterCommit('OrderConfirmed', {
      storeId,
      actorId: actor.id,
      payload: { orderId, confirmedByUserId: actor.id },
    });
  }

  if (toStatus === OrderStatus.SHIPPED) {
    emitAfterCommit('OrderShipped', {
      storeId,
      actorId: actor.id,
      payload: {
        storeId,
        orderId,
        customerId: order.customerId,
        courierTrackingId: result.updated.courierTrackingId,
      },
    });
  }

  if (toStatus === OrderStatus.DELIVERED) {
    emitAfterCommit('OrderDelivered', {
      storeId,
      actorId: actor.id,
      payload: {
        storeId,
        orderId,
        customerId: order.customerId,
      },
    });
  }

  if (toStatus === OrderStatus.RETURNED) {
    emitAfterCommit('OrderReturned', {
      storeId,
      actorId: actor.id,
      payload: {
        storeId,
        orderId,
        customerId: order.customerId,
      },
    });
  }

  if (result.riskChanged) {
    emitAfterCommit('CustomerRiskLevelChanged', {
      storeId,
      actorId: actor.id,
      payload: {
        storeId,
        customerId: result.riskChanged.customerId,
        previousRiskLevel: result.riskChanged.previous as never,
        newRiskLevel: result.riskChanged.next as never,
      },
    });
  }

  return result.updated;
}
