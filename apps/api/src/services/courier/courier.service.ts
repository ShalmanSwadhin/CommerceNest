import { z } from 'zod';
import type { Prisma } from '@commercenest/prisma';
import { ApiErrorCode, ShipmentStatus, OrderStatus, type OrderStatus as OrderStatusType } from '@commercenest/types';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { encryptJson, decryptJson, type EncryptedPayload } from '../../lib/crypto.js';
import { toNumber } from '../order.service.js';
import { transitionOrderStatus, canTransition } from '../order.service.js';
import { getCourierProvider, listCourierProviders } from './registry.js';
import {
  CourierDeliveryError,
  CourierNotConfiguredError,
  CourierUnsupportedOperationError,
  type CourierCredentials,
} from './types.js';

// ---------------------------------------------------------------------------
// Courier account (credentials) management — Store Admin → Settings →
// Delivery. Credentials are encrypted at rest (lib/crypto.ts) and NEVER
// included in any serialized response; only decrypted inside this file,
// right before an actual provider API call.
// ---------------------------------------------------------------------------

export function listAvailableProviders() {
  return listCourierProviders().map((p) => ({
    id: p.id,
    label: p.label,
    credentialFields: p.credentialFields,
    supportsCancel: p.supportsCancel,
  }));
}

function serializeCourierAccount(account: {
  id: string;
  storeId: string;
  provider: string;
  enabled: boolean;
  isDefault: boolean;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: account.id,
    provider: account.provider,
    enabled: account.enabled,
    isDefault: account.isDefault,
    lastTestedAt: account.lastTestedAt,
    lastTestOk: account.lastTestOk,
    lastTestMessage: account.lastTestMessage,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    // Deliberately no credentialsEncrypted and no decrypted credentials —
    // this is the one place a leak here would matter most.
  };
}

export async function listCourierAccounts(storeId: string) {
  const accounts = await prisma.courierAccount.findMany({
    where: { storeId },
    orderBy: { createdAt: 'asc' },
  });
  return accounts.map(serializeCourierAccount);
}

const upsertCourierAccountSchema = z
  .object({
    provider: z.string().min(1),
    credentials: z.record(z.string(), z.string()),
    enabled: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export async function upsertCourierAccount(storeId: string, input: unknown) {
  const data = upsertCourierAccountSchema.parse(input);
  const provider = getCourierProvider(data.provider);
  if (!provider) throw AppError.badRequest(`Unknown courier provider: ${data.provider}`);

  for (const field of provider.credentialFields) {
    if (!field.optional && !data.credentials[field.key]?.trim()) {
      throw AppError.badRequest(`Missing required field: ${field.label}`, {
        field: field.key,
      });
    }
  }

  const credentialsEncrypted = encryptJson(data.credentials) as unknown as Prisma.InputJsonValue;

  const account = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.courierAccount.updateMany({ where: { storeId }, data: { isDefault: false } });
    }
    return tx.courierAccount.upsert({
      where: { storeId_provider: { storeId, provider: data.provider } },
      create: {
        storeId,
        provider: data.provider,
        credentialsEncrypted,
        enabled: data.enabled ?? false,
        isDefault: data.isDefault ?? false,
      },
      update: {
        credentialsEncrypted,
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
        // A credentials update invalidates whatever the last test proved.
        lastTestedAt: null,
        lastTestOk: null,
        lastTestMessage: null,
      },
    });
  });

  return serializeCourierAccount(account);
}

export async function setCourierAccountEnabled(storeId: string, accountId: string, enabled: boolean) {
  const account = await prisma.courierAccount.findFirst({ where: { id: accountId, storeId } });
  if (!account) throw AppError.notFound('Courier account not found');
  const updated = await prisma.courierAccount.update({ where: { id: account.id }, data: { enabled } });
  return serializeCourierAccount(updated);
}

export async function deleteCourierAccount(storeId: string, accountId: string) {
  const account = await prisma.courierAccount.findFirst({ where: { id: accountId, storeId } });
  if (!account) throw AppError.notFound('Courier account not found');
  await prisma.courierAccount.delete({ where: { id: account.id } });
  return { ok: true };
}

async function getDecryptedAccount(storeId: string, accountId: string) {
  const account = await prisma.courierAccount.findFirst({ where: { id: accountId, storeId } });
  if (!account) throw AppError.notFound('Courier account not found');
  const credentials = decryptJson<CourierCredentials>(account.credentialsEncrypted as unknown as EncryptedPayload);
  return { account, credentials };
}

export async function testCourierConnection(storeId: string, accountId: string) {
  const { account, credentials } = await getDecryptedAccount(storeId, accountId);
  const provider = getCourierProvider(account.provider);
  if (!provider) throw AppError.badRequest(`Unknown courier provider: ${account.provider}`);

  const result = await provider.testConnection(credentials);
  await prisma.courierAccount.update({
    where: { id: account.id },
    data: { lastTestedAt: new Date(), lastTestOk: result.ok, lastTestMessage: result.message },
  });
  return result;
}

async function getDefaultEnabledAccount(storeId: string) {
  const account = await prisma.courierAccount.findFirst({
    where: { storeId, enabled: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  if (!account) {
    throw new CourierNotConfiguredError('No enabled courier account is configured for this store');
  }
  return account;
}

function courierErrorToAppError(err: unknown, fallbackMessage: string): AppError {
  if (err instanceof CourierNotConfiguredError) {
    return new AppError(409, ApiErrorCode.COURIER_NOT_CONFIGURED, err.message);
  }
  if (err instanceof CourierUnsupportedOperationError) {
    return new AppError(400, ApiErrorCode.COURIER_UNSUPPORTED_OPERATION, err.message);
  }
  if (err instanceof CourierDeliveryError) {
    return AppError.serviceUnavailable(
      `${fallbackMessage}: ${err.message}`,
      ApiErrorCode.COURIER_DELIVERY_FAILED,
    );
  }
  if (err instanceof AppError) return err;
  throw err;
}

// ---------------------------------------------------------------------------
// Shipment lifecycle
// ---------------------------------------------------------------------------

interface DeliveryAddressShape {
  line1?: string;
  line2?: string;
  area?: string;
  district?: string;
  division?: string;
  recipientName?: string;
  recipientPhone?: string;
}

function formatRecipientAddress(address: DeliveryAddressShape): string {
  return [address.line1, address.line2, address.area, address.district, address.division]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(', ');
}

function serializeShipment(shipment: {
  id: string;
  storeId: string;
  orderId: string;
  provider: string;
  consignmentId: string | null;
  trackingCode: string | null;
  status: string;
  rawStatus: string | null;
  codAmount: unknown;
  deliveryCharge: unknown;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  note: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: shipment.id,
    orderId: shipment.orderId,
    provider: shipment.provider,
    consignmentId: shipment.consignmentId,
    trackingCode: shipment.trackingCode,
    status: shipment.status,
    rawStatus: shipment.rawStatus,
    codAmount: toNumber(shipment.codAmount as never),
    deliveryCharge: shipment.deliveryCharge ? toNumber(shipment.deliveryCharge as never) : null,
    recipientName: shipment.recipientName,
    recipientPhone: shipment.recipientPhone,
    recipientAddress: shipment.recipientAddress,
    note: shipment.note,
    lastSyncedAt: shipment.lastSyncedAt,
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
    // Deliberately no courierResponse (raw provider payload) — internal
    // audit data, not something to hand to any client.
  };
}

export async function getShipmentForOrder(storeId: string, orderId: string) {
  const shipment = await prisma.shipment.findFirst({ where: { orderId, storeId } });
  return shipment ? serializeShipment(shipment) : null;
}

const CREATABLE_ORDER_STATUSES: OrderStatusType[] = [OrderStatus.CONFIRMED, OrderStatus.PROCESSING];

export async function createShipmentForOrder(
  storeId: string,
  orderId: string,
  actor: { id: string },
) {
  const order = await prisma.order.findFirst({ where: { id: orderId, storeId } });
  if (!order) throw AppError.notFound('Order not found');
  if (!CREATABLE_ORDER_STATUSES.includes(order.status as OrderStatusType)) {
    throw AppError.conflict('A shipment can only be created for a confirmed or processing order', {
      status: order.status,
    });
  }
  const existing = await prisma.shipment.findUnique({ where: { orderId } });
  if (existing) {
    throw new AppError(409, ApiErrorCode.SHIPMENT_ALREADY_EXISTS, 'A shipment already exists for this order');
  }

  const account = await getDefaultEnabledAccount(storeId).catch((err) => {
    throw courierErrorToAppError(err, 'Could not create shipment');
  });
  const provider = getCourierProvider(account.provider)!;
  const credentials = decryptJson<CourierCredentials>(
    account.credentialsEncrypted as unknown as EncryptedPayload,
  );

  const address = order.deliveryAddress as unknown as DeliveryAddressShape;
  const recipientName = address.recipientName?.trim() || 'Customer';
  const recipientPhone = address.recipientPhone?.trim() || '';
  const recipientAddress = formatRecipientAddress(address);
  const codAmount = order.paymentMethod === 'CASH_ON_DELIVERY' ? toNumber(order.total) : 0;

  // The real courier API call happens OUTSIDE any DB transaction — never
  // hold a lock across a network call (same principle as
  // media.service.ts's Cloudinary verification).
  let result;
  try {
    result = await provider.createShipment(credentials, {
      invoice: order.orderNumber,
      recipientName,
      recipientPhone,
      recipientAddress,
      codAmount,
    });
  } catch (err) {
    throw courierErrorToAppError(err, 'Could not create shipment');
  }

  const shipment = await prisma.$transaction(async (tx) => {
    const created = await tx.shipment.create({
      data: {
        storeId,
        orderId: order.id,
        provider: account.provider,
        consignmentId: result.consignmentId,
        trackingCode: result.trackingCode,
        status: result.status,
        rawStatus: result.rawStatus,
        codAmount,
        recipientName,
        recipientPhone,
        recipientAddress,
        courierResponse: result.raw as Prisma.InputJsonValue,
        lastSyncedAt: new Date(),
      },
    });
    // Populate the order's existing courier fields too, so the SHIPPED
    // transition's existing "courierTrackingId required" check and any
    // existing courier display (order detail, customer tracking) pick
    // this up without needing separate wiring.
    await tx.order.update({
      where: { id: order.id },
      data: { courierName: provider.label, courierTrackingId: result.trackingCode },
    });
    return created;
  });

  // Best-effort: a shipment was successfully created with the courier
  // regardless of whether this secondary status advance succeeds — never
  // roll back a real, already-placed courier consignment because of a
  // failure in our own bookkeeping.
  if (order.status === OrderStatus.CONFIRMED) {
    try {
      await transitionOrderStatus(
        storeId,
        orderId,
        { status: OrderStatus.PROCESSING, note: `Shipment created with ${provider.label} (${result.trackingCode})` },
        { id: actor.id },
      );
    } catch (err) {
      logger.error(
        { channel: 'courier', storeId, orderId, err },
        'Shipment created but failed to auto-advance order status to PROCESSING',
      );
    }
  }

  return serializeShipment(shipment);
}

/** Shared by both the polling sync endpoint and the webhook handler — the
 * one place a courier's status change gets translated into a CommerceNest
 * order-lifecycle effect, so the two paths can never disagree. */
async function applyShipmentStatusUpdate(
  shipment: { id: string; storeId: string; orderId: string; status: string },
  update: { status: ShipmentStatus; rawStatus: string; raw: unknown },
  actorId: string | null,
) {
  const statusUnchanged = shipment.status === update.status;
  const updated = await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      ...(statusUnchanged ? {} : { status: update.status }),
      rawStatus: update.rawStatus,
      courierResponse: update.raw as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
    },
  });

  if (!statusUnchanged) {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: shipment.orderId } });
    const nextOrderStatus = mapShipmentStatusToOrderTransition(
      update.status,
      order.status as OrderStatusType,
    );
    if (nextOrderStatus && canTransition(order.status as OrderStatusType, nextOrderStatus)) {
      try {
        await transitionOrderStatus(
          shipment.storeId,
          shipment.orderId,
          { status: nextOrderStatus, note: `Courier status update: ${update.rawStatus}` },
          { id: actorId },
        );
      } catch (err) {
        logger.error(
          { channel: 'courier', storeId: shipment.storeId, orderId: shipment.orderId, err },
          'Failed to auto-advance order status from a courier status update',
        );
      }
    }
  }

  return serializeShipment(updated);
}

/** Only the transitions a courier status change can honestly justify —
 * everything else (SHIPPED itself, e.g.) stays a deliberate staff action,
 * since the courier's API gives no reliable "physically picked up" signal
 * to automate that one. */
function mapShipmentStatusToOrderTransition(
  shipmentStatus: ShipmentStatus,
  currentOrderStatus: OrderStatusType,
): OrderStatusType | null {
  if (shipmentStatus === ShipmentStatus.DELIVERED && currentOrderStatus === OrderStatus.SHIPPED) {
    return OrderStatus.DELIVERED;
  }
  if (shipmentStatus === ShipmentStatus.CANCELLED) {
    if (currentOrderStatus === OrderStatus.CONFIRMED || currentOrderStatus === OrderStatus.PROCESSING) {
      return OrderStatus.CANCELLED;
    }
    if (currentOrderStatus === OrderStatus.SHIPPED) {
      // SHIPPED has no CANCELLED transition in ORDER_TRANSITIONS — RETURNED
      // (refused/undelivered) is the accurate existing state for this case.
      return OrderStatus.RETURNED;
    }
  }
  return null;
}

export async function syncShipmentStatus(storeId: string, shipmentId: string, actor: { id: string }) {
  const shipment = await prisma.shipment.findFirst({ where: { id: shipmentId, storeId } });
  if (!shipment) throw AppError.notFound('Shipment not found');

  const account = await prisma.courierAccount.findFirst({
    where: { storeId, provider: shipment.provider },
  });
  if (!account) {
    throw new AppError(409, ApiErrorCode.COURIER_NOT_CONFIGURED, 'This shipment’s courier account is no longer configured');
  }
  const provider = getCourierProvider(shipment.provider)!;
  const credentials = decryptJson<CourierCredentials>(
    account.credentialsEncrypted as unknown as EncryptedPayload,
  );

  let result;
  try {
    result = await provider.trackShipment(credentials, {
      consignmentId: shipment.consignmentId ?? undefined,
      trackingCode: shipment.trackingCode ?? undefined,
      invoice: undefined,
    });
  } catch (err) {
    throw courierErrorToAppError(err, 'Could not fetch shipment status');
  }

  return applyShipmentStatusUpdate(shipment, result, actor.id);
}

// ---------------------------------------------------------------------------
// Webhook — courier → CommerceNest. Public route (no CommerceNest auth —
// the courier isn't one of our users), scoped by storeId+provider in the
// URL itself, authenticated instead via the provider's own scheme
// (verifyWebhook — a bearer-token comparison for Steadfast). Idempotent by
// construction: applyShipmentStatusUpdate is a no-op status-wise when the
// reported status already matches what's stored, so a courier's retried/
// duplicate webhook delivery can never double-apply an order transition.
// ---------------------------------------------------------------------------

export async function handleCourierWebhook(
  storeId: string,
  providerId: string,
  headers: Record<string, string | undefined>,
  body: unknown,
): Promise<{ ok: boolean; ignored?: boolean }> {
  const provider = getCourierProvider(providerId);
  if (!provider) {
    logger.warn({ channel: 'courier', storeId, providerId }, 'Webhook received for an unknown provider — ignoring');
    return { ok: true, ignored: true };
  }

  const account = await prisma.courierAccount.findFirst({ where: { storeId, provider: providerId } });
  if (!account) {
    logger.warn({ channel: 'courier', storeId, providerId }, 'Webhook received for a store with no matching courier account — ignoring');
    return { ok: true, ignored: true };
  }

  const credentials = decryptJson<CourierCredentials>(
    account.credentialsEncrypted as unknown as EncryptedPayload,
  );

  if (!provider.verifyWebhook(credentials, headers)) {
    throw AppError.unauthorized('Webhook signature verification failed');
  }

  const event = provider.parseWebhookPayload(body);
  if (!event) {
    logger.warn({ channel: 'courier', storeId, providerId }, 'Webhook payload did not match the expected shape — ignoring');
    return { ok: true, ignored: true };
  }

  const shipment = await prisma.shipment.findFirst({
    where: {
      storeId,
      provider: providerId,
      ...(event.ref.consignmentId
        ? { consignmentId: event.ref.consignmentId }
        : { trackingCode: event.ref.trackingCode }),
    },
  });
  if (!shipment) {
    logger.warn(
      { channel: 'courier', storeId, providerId, ref: event.ref },
      'Webhook referenced a shipment CommerceNest has no record of — ignoring',
    );
    return { ok: true, ignored: true };
  }

  await applyShipmentStatusUpdate(
    shipment,
    { status: event.status, rawStatus: event.rawStatus, raw: body },
    null,
  );
  return { ok: true };
}

export { applyShipmentStatusUpdate };
