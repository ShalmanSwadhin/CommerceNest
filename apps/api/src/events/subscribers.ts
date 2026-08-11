import type { CommerceNestDomainEvent } from '@commercenest/types';
import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';
import { onEvent } from './emit.js';

function logSmsLocally(to: string, body: string, templateKey: string) {
  logger.info(
    {
      channel: 'sms',
      provider: env.SMS_PROVIDER || 'local-stub',
      to,
      templateKey,
      body,
    },
    'SMS notification (local log — no provider configured)',
  );
}

/**
 * V1 email channel — no SMTP/email provider is wired yet, so this logs the
 * would-be email the same way logSmsLocally does for SMS. Swapping in a real
 * provider later only touches this one function.
 */
function logEmailLocally(to: string, subject: string, body: string, templateKey: string) {
  logger.info(
    {
      channel: 'email',
      provider: 'local-stub',
      to,
      subject,
      templateKey,
      body,
    },
    'Email notification (local log — no provider configured)',
  );
}

async function handleNotificationSideEffects(event: CommerceNestDomainEvent) {
  switch (event.eventName) {
    case 'OrderPlaced':
      logSmsLocally(
        'staff',
        `New order ${event.payload.orderId} total ${event.payload.total} via ${event.payload.paymentMethod}`,
        'order.placed.staff',
      );
      logEmailLocally(
        event.payload.customerId,
        'We received your order',
        `Thanks for your order ${event.payload.orderId}. We'll notify you as it progresses.`,
        'order.placed.customer',
      );
      break;
    case 'PaymentSubmitted':
      logSmsLocally(
        'staff',
        `bKash transaction submitted for order ${event.payload.orderId} — awaiting verification`,
        'payment.submitted.staff',
      );
      break;
    case 'PaymentApproved':
      logSmsLocally(
        event.payload.orderId,
        `bKash payment approved for order ${event.payload.orderId}`,
        'payment.approved.customer',
      );
      logEmailLocally(
        event.payload.orderId,
        'Payment approved',
        `Your bKash payment for order ${event.payload.orderId} has been approved.`,
        'payment.approved.customer',
      );
      break;
    case 'PaymentRejected':
      logSmsLocally(
        event.payload.orderId,
        `bKash payment rejected for order ${event.payload.orderId}: ${event.payload.rejectionReason}`,
        'payment.rejected.customer',
      );
      logEmailLocally(
        event.payload.orderId,
        'Payment could not be verified',
        `Your bKash payment for order ${event.payload.orderId} was rejected: ${event.payload.rejectionReason}`,
        'payment.rejected.customer',
      );
      break;
    case 'OrderConfirmed':
      logEmailLocally(
        event.payload.orderId,
        'Order confirmed',
        `Your order ${event.payload.orderId} has been confirmed and is being prepared.`,
        'order.confirmed.customer',
      );
      break;
    case 'OrderShipped':
      logSmsLocally(
        event.payload.customerId,
        `Your order ${event.payload.orderId} has shipped${
          event.payload.courierTrackingId ? ` — tracking ${event.payload.courierTrackingId}` : ''
        }.`,
        'order.shipped.customer',
      );
      logEmailLocally(
        event.payload.customerId,
        'Your order is on the way',
        `Order ${event.payload.orderId} has shipped${
          event.payload.courierTrackingId ? ` — tracking ${event.payload.courierTrackingId}` : ''
        }.`,
        'order.shipped.customer',
      );
      break;
    case 'OrderDelivered':
      logSmsLocally(
        event.payload.customerId,
        `Your order ${event.payload.orderId} has been delivered.`,
        'order.delivered.customer',
      );
      logEmailLocally(
        event.payload.customerId,
        'Order delivered',
        `Your order ${event.payload.orderId} has been delivered. Enjoy!`,
        'order.delivered.customer',
      );
      break;
    case 'ReturnApproved':
      logEmailLocally(
        event.payload.customerId,
        'Return approved',
        `Your return request for order ${event.payload.orderId} has been approved. Please send the item back to the store.`,
        'return.approved.customer',
      );
      break;
    case 'RefundCompleted':
      logSmsLocally(
        event.payload.customerId,
        `Refund of ${event.payload.refundAmount} completed via ${event.payload.refundMethod} for order ${event.payload.orderId}.`,
        'refund.completed.customer',
      );
      logEmailLocally(
        event.payload.customerId,
        'Refund completed',
        `We've refunded ${event.payload.refundAmount} via ${event.payload.refundMethod} for order ${event.payload.orderId}.`,
        'refund.completed.customer',
      );
      break;
    case 'StoreSuspended':
      logger.warn(
        { storeId: event.payload.storeId, reason: event.payload.reason },
        'Store suspended notification',
      );
      break;
    default:
      break;
  }
}

export function registerEventSubscribers() {
  onEvent('*', async (event) => {
    logger.debug(
      {
        eventName: event.eventName,
        storeId: event.storeId,
        actorId: event.actorId,
      },
      'Domain event',
    );
    await handleNotificationSideEffects(event);
  });

  onEvent('AuditLogWritten', async (event) => {
    if (event.eventName !== 'AuditLogWritten') return;
    logger.info(
      {
        auditLogId: event.payload.auditLogId,
        action: event.payload.action,
        storeId: event.payload.storeId,
      },
      'Audit log written',
    );
  });
}
