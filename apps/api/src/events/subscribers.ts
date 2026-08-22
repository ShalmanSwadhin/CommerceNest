import type { CommerceNestDomainEvent } from '@commercenest/types';
import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';
import { sendEmail } from '../lib/email.js';
import { prisma } from '../lib/prisma.js';
import { onEvent } from './emit.js';
import { notifyMasterAdmins, notifyStoreStaff } from '../services/notification.service.js';

function logSmsLocally(to: string | null, body: string, templateKey: string) {
  if (!to) {
    logger.info(
      { channel: 'sms', templateKey, reason: 'no_phone_on_file' },
      'SMS notification skipped — customer has no phone on file',
    );
    return;
  }
  // SMS delivery is intentionally postponed for V1 (see SECURITY.md /
  // PRODUCTION_READINESS_REPORT.md) — this always logs rather than sends,
  // regardless of SMS_PROVIDER, until a real provider integration lands.
  logger.info(
    {
      channel: 'sms',
      provider: env.SMS_PROVIDER || 'local-stub',
      to,
      templateKey,
      body,
    },
    'SMS notification (local log — SMS delivery postponed for V1)',
  );
}

async function notifyCustomerEmail(
  contact: { email: string | null } | null,
  subject: string,
  body: string,
  templateKey: string,
) {
  if (!contact?.email) {
    logger.info(
      { channel: 'email', templateKey, reason: 'no_email_on_file' },
      'Email notification skipped — customer has no email on file',
    );
    return;
  }
  await sendEmail({ to: contact.email, subject, body, templateKey });
}

/** Staff notifications have no delivery target in the current data model
 * (no staff-notification-preference/phone field on User) — log-only by
 * design, not a stub awaiting a provider. */
function notifyStaffPlaceholder(body: string, templateKey: string) {
  logger.info({ channel: 'sms', to: 'staff', templateKey, body }, 'Staff notification (log-only)');
}

/** Several domain events carry only `orderId`, not `customerId` — resolve
 * whichever identifier is available to the customer's actual contact info. */
async function resolveCustomerContact(opts: {
  customerId?: string;
  orderId?: string;
}): Promise<{ email: string | null; phone: string | null } | null> {
  if (opts.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: opts.customerId },
      select: { email: true, phone: true },
    });
    if (customer) return customer;
  }
  if (opts.orderId) {
    const order = await prisma.order.findUnique({
      where: { id: opts.orderId },
      select: { customer: { select: { email: true, phone: true } } },
    });
    if (order?.customer) return order.customer;
  }
  return null;
}

async function handleNotificationSideEffects(event: CommerceNestDomainEvent) {
  switch (event.eventName) {
    case 'OrderPlaced': {
      notifyStaffPlaceholder(
        `New order ${event.payload.orderId} total ${event.payload.total} via ${event.payload.paymentMethod}`,
        'order.placed.staff',
      );
      const contact = await resolveCustomerContact({ customerId: event.payload.customerId });
      await notifyCustomerEmail(
        contact,
        'We received your order',
        `Thanks for your order ${event.payload.orderId}. We'll notify you as it progresses.`,
        'order.placed.customer',
      );
      break;
    }
    case 'PaymentSubmitted':
      notifyStaffPlaceholder(
        `bKash transaction submitted for order ${event.payload.orderId} — awaiting verification`,
        'payment.submitted.staff',
      );
      break;
    case 'PaymentApproved': {
      const contact = await resolveCustomerContact({ orderId: event.payload.orderId });
      logSmsLocally(
        contact?.phone ?? null,
        `bKash payment approved for order ${event.payload.orderId}`,
        'payment.approved.customer',
      );
      await notifyCustomerEmail(
        contact,
        'Payment approved',
        `Your bKash payment for order ${event.payload.orderId} has been approved.`,
        'payment.approved.customer',
      );
      break;
    }
    case 'PaymentRejected': {
      const contact = await resolveCustomerContact({ orderId: event.payload.orderId });
      logSmsLocally(
        contact?.phone ?? null,
        `bKash payment rejected for order ${event.payload.orderId}: ${event.payload.rejectionReason}`,
        'payment.rejected.customer',
      );
      await notifyCustomerEmail(
        contact,
        'Payment could not be verified',
        `Your bKash payment for order ${event.payload.orderId} was rejected: ${event.payload.rejectionReason}`,
        'payment.rejected.customer',
      );
      break;
    }
    case 'OrderConfirmed': {
      const contact = await resolveCustomerContact({ orderId: event.payload.orderId });
      await notifyCustomerEmail(
        contact,
        'Order confirmed',
        `Your order ${event.payload.orderId} has been confirmed and is being prepared.`,
        'order.confirmed.customer',
      );
      break;
    }
    case 'OrderShipped': {
      const contact = await resolveCustomerContact({ customerId: event.payload.customerId });
      const trackingSuffix = event.payload.courierTrackingId
        ? ` — tracking ${event.payload.courierTrackingId}`
        : '';
      logSmsLocally(
        contact?.phone ?? null,
        `Your order ${event.payload.orderId} has shipped${trackingSuffix}.`,
        'order.shipped.customer',
      );
      await notifyCustomerEmail(
        contact,
        'Your order is on the way',
        `Order ${event.payload.orderId} has shipped${trackingSuffix}.`,
        'order.shipped.customer',
      );
      break;
    }
    case 'OrderDelivered': {
      const contact = await resolveCustomerContact({ customerId: event.payload.customerId });
      logSmsLocally(
        contact?.phone ?? null,
        `Your order ${event.payload.orderId} has been delivered.`,
        'order.delivered.customer',
      );
      await notifyCustomerEmail(
        contact,
        'Order delivered',
        `Your order ${event.payload.orderId} has been delivered. Enjoy!`,
        'order.delivered.customer',
      );
      break;
    }
    case 'ReturnApproved': {
      const contact = await resolveCustomerContact({ customerId: event.payload.customerId });
      await notifyCustomerEmail(
        contact,
        'Return approved',
        `Your return request for order ${event.payload.orderId} has been approved. Please send the item back to the store.`,
        'return.approved.customer',
      );
      break;
    }
    case 'RefundCompleted': {
      const contact = await resolveCustomerContact({ customerId: event.payload.customerId });
      logSmsLocally(
        contact?.phone ?? null,
        `Refund of ${event.payload.refundAmount} completed via ${event.payload.refundMethod} for order ${event.payload.orderId}.`,
        'refund.completed.customer',
      );
      await notifyCustomerEmail(
        contact,
        'Refund completed',
        `We've refunded ${event.payload.refundAmount} via ${event.payload.refundMethod} for order ${event.payload.orderId}.`,
        'refund.completed.customer',
      );
      break;
    }
    case 'StoreSuspended':
      logger.warn(
        { storeId: event.payload.storeId, reason: event.payload.reason },
        'Store suspended notification',
      );
      // Previously silent from the merchant's side — any suspension (billing
      // or otherwise) reuses this one event/notification path, not just the
      // new overdue-suspension flow, so a store owner is never left to
      // discover a suspension only by their storefront going down.
      await notifyStoreStaff(event.payload.storeId, {
        type: 'STORE_SUSPENDED',
        title: 'Your store has been suspended',
        body: event.payload.reason,
      });
      break;
    case 'TrialLeadCreated':
      await notifyMasterAdmins({
        type: 'trial_lead_created',
        title: 'New trial request',
        body: `${event.payload.prospectName} requested a trial store for "${event.payload.businessName}".`,
        storeId: event.payload.storeId,
      });
      logger.info(
        { trialLeadId: event.payload.trialLeadId, trialUrl: event.payload.trialUrl },
        'Trial lead created',
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
    try {
      await handleNotificationSideEffects(event);
    } catch (err) {
      // A notification failure must never surface as an error in the
      // triggering request/transaction — it already committed.
      logger.error({ err, eventName: event.eventName }, 'Notification side effect failed');
    }
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
