/**
 * CommerceNest domain events — Part M event catalog.
 * @see SRS Addendum Part M — Event-Driven Architecture
 */

import type {
  CustomerRiskLevel,
  OrderStatus,
  PaymentMethod,
  ProductStatus,
  UserRole,
} from './enums.js';

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface DomainEvent<TName extends string, TPayload> {
  /** PascalCase past-tense event name, e.g. OrderPlaced */
  eventName: TName;
  /** ISO 8601 timestamp set at emit time */
  occurredAt: string;
  /** Server-trusted tenant scope; null for platform-scoped events */
  storeId: string | null;
  /** Authenticated user who caused this; null for system-triggered events */
  actorId: string | null;
  payload: TPayload;
}

// ---------------------------------------------------------------------------
// Event payloads (M.2 catalog)
// ---------------------------------------------------------------------------

export interface UserRegisteredPayload {
  userId: string;
  role: UserRole;
  storeId: string | null;
  email: string;
  invitedByUserId: string | null;
}

export interface UserLoggedInPayload {
  userId: string;
  role: UserRole;
  storeId: string | null;
  ipAddress: string;
  userAgent: string;
}

export interface StoreCreatedPayload {
  storeId: string;
  ownerUserId: string;
  storeName: string;
  slug: string;
  planTier: string;
}

export interface StoreSuspendedPayload {
  storeId: string;
  actorId: string;
  reason: string;
}

export interface StoreThemePublishedPayload {
  storeId: string;
  storefrontVersionId: string;
  publishedByUserId: string;
  previousVersionId: string | null;
}

export interface StoreThemeRolledBackPayload {
  storeId: string;
  restoredFromVersionId: string;
  newDraftVersionId: string;
  actorId: string;
}

export interface ProductCreatedPayload {
  storeId: string;
  productId: string;
  actorId: string;
  status: ProductStatus;
}

export interface ProductStockLowPayload {
  storeId: string;
  productId: string;
  variantId: string;
  currentStock: number;
  threshold: number;
}

export interface OrderPlacedPayload {
  storeId: string;
  orderId: string;
  customerId: string;
  total: string;
  paymentMethod: PaymentMethod;
  riskLevelAtPlacement: CustomerRiskLevel;
}

export interface OrderConfirmedPayload {
  orderId: string;
  confirmedByUserId: string;
}

export interface OrderStatusChangedPayload {
  storeId: string;
  orderId: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  actorId: string | null;
}

export interface OrderDeliveredPayload {
  storeId: string;
  orderId: string;
  customerId: string;
}

export interface OrderShippedPayload {
  storeId: string;
  orderId: string;
  customerId: string;
  courierTrackingId: string | null;
}

export interface OrderReturnedPayload {
  storeId: string;
  orderId: string;
  customerId: string;
}

export interface PaymentSubmittedPayload {
  storeId: string;
  orderId: string;
  method: 'MANUAL_BKASH';
}

export interface PaymentRejectedPayload {
  storeId: string;
  orderId: string;
  rejectionReason: string;
  rejectedByUserId: string;
}

export interface ReturnRequestedPayload {
  storeId: string;
  returnId: string;
  orderId: string;
  customerId: string;
}

export interface ReturnApprovedPayload {
  storeId: string;
  returnId: string;
  orderId: string;
  customerId: string;
}

export interface ReturnRejectedPayload {
  storeId: string;
  returnId: string;
  orderId: string;
  customerId: string;
}

export interface RefundCompletedPayload {
  storeId: string;
  returnId: string;
  orderId: string;
  customerId: string;
  refundAmount: string;
  refundMethod: string;
}

export interface CustomerRiskLevelChangedPayload {
  storeId: string;
  customerId: string;
  previousRiskLevel: CustomerRiskLevel;
  newRiskLevel: CustomerRiskLevel;
}

/** Reserved for V2 — not emitted in V1 */
export interface PaymentApprovedPayload {
  storeId: string;
  orderId: string;
  verificationMethod: 'MANUAL_BKASH' | 'MANUAL_NAGAD' | 'AUTOMATED_GATEWAY';
  verifiedByUserId?: string;
  gatewayTransactionId?: string;
}

export interface InvoiceGeneratedPayload {
  storeId: string;
  orderId: string;
  invoiceId: string;
  format: 'PDF' | 'HTML';
}

export type NotificationDeliveryStatus = 'sent' | 'failed';

export interface NotificationSentPayload {
  storeId: string | null;
  channel: 'sms' | 'email' | 'in_app';
  templateKey: string;
  recipientRef: string;
  status: NotificationDeliveryStatus;
}

export interface ImpersonationSessionStartedPayload {
  storeId: string;
  sessionId: string;
  actorId: string;
}

export interface ImpersonationSessionEndedPayload {
  storeId: string;
  sessionId: string;
  actorId: string;
  durationSeconds: number;
  endReason: string;
}

export interface AuditLogWrittenPayload {
  auditLogId: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  storeId: string | null;
  impersonationSessionId: string | null;
}

export interface AnalyticsSnapshotUpdatedPayload {
  storeId: string | null;
  snapshotType: string;
  periodStart: string;
  periodEnd: string;
}

export interface TrialLeadCreatedPayload {
  trialLeadId: string;
  storeId: string | null;
  businessName: string;
  prospectName: string;
  email: string;
  trialUrl: string | null;
}

// ---------------------------------------------------------------------------
// Concrete event types
// ---------------------------------------------------------------------------

export type UserRegisteredEvent = DomainEvent<
  'UserRegistered',
  UserRegisteredPayload
>;
export type UserLoggedInEvent = DomainEvent<'UserLoggedIn', UserLoggedInPayload>;
export type StoreCreatedEvent = DomainEvent<'StoreCreated', StoreCreatedPayload>;
export type StoreSuspendedEvent = DomainEvent<
  'StoreSuspended',
  StoreSuspendedPayload
>;
export type StoreThemePublishedEvent = DomainEvent<
  'StoreThemePublished',
  StoreThemePublishedPayload
>;
export type StoreThemeRolledBackEvent = DomainEvent<
  'StoreThemeRolledBack',
  StoreThemeRolledBackPayload
>;
export type ProductCreatedEvent = DomainEvent<
  'ProductCreated',
  ProductCreatedPayload
>;
export type ProductStockLowEvent = DomainEvent<
  'ProductStockLow',
  ProductStockLowPayload
>;
export type OrderPlacedEvent = DomainEvent<'OrderPlaced', OrderPlacedPayload>;
export type OrderConfirmedEvent = DomainEvent<
  'OrderConfirmed',
  OrderConfirmedPayload
>;
export type OrderStatusChangedEvent = DomainEvent<
  'OrderStatusChanged',
  OrderStatusChangedPayload
>;
export type OrderDeliveredEvent = DomainEvent<
  'OrderDelivered',
  OrderDeliveredPayload
>;
export type OrderShippedEvent = DomainEvent<'OrderShipped', OrderShippedPayload>;
export type OrderReturnedEvent = DomainEvent<
  'OrderReturned',
  OrderReturnedPayload
>;
export type PaymentSubmittedEvent = DomainEvent<
  'PaymentSubmitted',
  PaymentSubmittedPayload
>;
export type PaymentRejectedEvent = DomainEvent<
  'PaymentRejected',
  PaymentRejectedPayload
>;
export type ReturnRequestedEvent = DomainEvent<
  'ReturnRequested',
  ReturnRequestedPayload
>;
export type ReturnApprovedEvent = DomainEvent<
  'ReturnApproved',
  ReturnApprovedPayload
>;
export type ReturnRejectedEvent = DomainEvent<
  'ReturnRejected',
  ReturnRejectedPayload
>;
export type RefundCompletedEvent = DomainEvent<
  'RefundCompleted',
  RefundCompletedPayload
>;
export type CustomerRiskLevelChangedEvent = DomainEvent<
  'CustomerRiskLevelChanged',
  CustomerRiskLevelChangedPayload
>;
export type PaymentApprovedEvent = DomainEvent<
  'PaymentApproved',
  PaymentApprovedPayload
>;
export type InvoiceGeneratedEvent = DomainEvent<
  'InvoiceGenerated',
  InvoiceGeneratedPayload
>;
export type NotificationSentEvent = DomainEvent<
  'NotificationSent',
  NotificationSentPayload
>;
export type ImpersonationSessionStartedEvent = DomainEvent<
  'ImpersonationSessionStarted',
  ImpersonationSessionStartedPayload
>;
export type ImpersonationSessionEndedEvent = DomainEvent<
  'ImpersonationSessionEnded',
  ImpersonationSessionEndedPayload
>;
export type AuditLogWrittenEvent = DomainEvent<
  'AuditLogWritten',
  AuditLogWrittenPayload
>;
export type AnalyticsSnapshotUpdatedEvent = DomainEvent<
  'AnalyticsSnapshotUpdated',
  AnalyticsSnapshotUpdatedPayload
>;
export type TrialLeadCreatedEvent = DomainEvent<
  'TrialLeadCreated',
  TrialLeadCreatedPayload
>;

/** Discriminated union of all V1 catalog events */
export type CommerceNestDomainEvent =
  | UserRegisteredEvent
  | UserLoggedInEvent
  | StoreCreatedEvent
  | StoreSuspendedEvent
  | StoreThemePublishedEvent
  | StoreThemeRolledBackEvent
  | ProductCreatedEvent
  | ProductStockLowEvent
  | OrderPlacedEvent
  | OrderConfirmedEvent
  | OrderStatusChangedEvent
  | OrderDeliveredEvent
  | OrderShippedEvent
  | OrderReturnedEvent
  | PaymentSubmittedEvent
  | PaymentRejectedEvent
  | ReturnRequestedEvent
  | ReturnApprovedEvent
  | ReturnRejectedEvent
  | RefundCompletedEvent
  | CustomerRiskLevelChangedEvent
  | PaymentApprovedEvent
  | InvoiceGeneratedEvent
  | NotificationSentEvent
  | ImpersonationSessionStartedEvent
  | ImpersonationSessionEndedEvent
  | AuditLogWrittenEvent
  | AnalyticsSnapshotUpdatedEvent
  | TrialLeadCreatedEvent;

export type DomainEventName = CommerceNestDomainEvent['eventName'];

/** All cataloged event names for runtime validation and logging */
export const DOMAIN_EVENT_NAMES = [
  'UserRegistered',
  'UserLoggedIn',
  'StoreCreated',
  'StoreSuspended',
  'StoreThemePublished',
  'StoreThemeRolledBack',
  'ProductCreated',
  'ProductStockLow',
  'OrderPlaced',
  'OrderConfirmed',
  'OrderStatusChanged',
  'OrderDelivered',
  'OrderShipped',
  'OrderReturned',
  'PaymentSubmitted',
  'PaymentRejected',
  'ReturnRequested',
  'ReturnApproved',
  'ReturnRejected',
  'RefundCompleted',
  'CustomerRiskLevelChanged',
  'PaymentApproved',
  'InvoiceGenerated',
  'NotificationSent',
  'ImpersonationSessionStarted',
  'ImpersonationSessionEnded',
  'AuditLogWritten',
  'AnalyticsSnapshotUpdated',
  'TrialLeadCreated',
] as const satisfies readonly DomainEventName[];

export function isDomainEventName(value: string): value is DomainEventName {
  return (DOMAIN_EVENT_NAMES as readonly string[]).includes(value);
}

/** Helper to construct a domain event with standard envelope fields */
export function createDomainEvent<TName extends DomainEventName, TPayload>(
  eventName: TName,
  params: {
    storeId: string | null;
    actorId: string | null;
    payload: TPayload;
    occurredAt?: string;
  },
): DomainEvent<TName, TPayload> {
  return {
    eventName,
    occurredAt: params.occurredAt ?? new Date().toISOString(),
    storeId: params.storeId,
    actorId: params.actorId,
    payload: params.payload,
  };
}
