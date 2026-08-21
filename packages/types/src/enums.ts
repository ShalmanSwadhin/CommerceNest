/**
 * CommerceNest domain enums — mirrors Prisma schema enums.
 * Keep in sync with packages/prisma/schema.prisma.
 */

export const UserRole = {
  MASTER_ADMIN: 'MASTER_ADMIN',
  STORE_OWNER: 'STORE_OWNER',
  STORE_MANAGER: 'STORE_MANAGER',
  INVENTORY_MANAGER: 'INVENTORY_MANAGER',
  ORDER_MANAGER: 'ORDER_MANAGER',
  CUSTOMER_SUPPORT: 'CUSTOMER_SUPPORT',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const StoreStatus = {
  PENDING_SETUP: 'PENDING_SETUP',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type StoreStatus = (typeof StoreStatus)[keyof typeof StoreStatus];

export const DomainType = {
  SUBDOMAIN: 'SUBDOMAIN',
  CUSTOM: 'CUSTOM',
} as const;
export type DomainType = (typeof DomainType)[keyof typeof DomainType];

export const DomainStatus = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type DomainStatus = (typeof DomainStatus)[keyof typeof DomainStatus];

export const SslStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
} as const;
export type SslStatus = (typeof SslStatus)[keyof typeof SslStatus];

export const StoreApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type StoreApprovalStatus =
  (typeof StoreApprovalStatus)[keyof typeof StoreApprovalStatus];

export const DomainRequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ASSIGNED: 'ASSIGNED',
} as const;
export type DomainRequestStatus =
  (typeof DomainRequestStatus)[keyof typeof DomainRequestStatus];

export const EmailVerificationSubject = {
  USER: 'USER',
  CUSTOMER: 'CUSTOMER',
} as const;
export type EmailVerificationSubject =
  (typeof EmailVerificationSubject)[keyof typeof EmailVerificationSubject];

export const CustomerRiskLevel = {
  NONE: 'NONE',
  CAUTION: 'CAUTION',
  HIGH_RISK: 'HIGH_RISK',
} as const;
export type CustomerRiskLevel =
  (typeof CustomerRiskLevel)[keyof typeof CustomerRiskLevel];

export const PreferredLocale = {
  en: 'en',
  bn: 'bn',
} as const;
export type PreferredLocale =
  (typeof PreferredLocale)[keyof typeof PreferredLocale];

export const ProductStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

export const OrderStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ReviewStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];

export const PaymentMethod = {
  CASH_ON_DELIVERY: 'CASH_ON_DELIVERY',
  MANUAL_BKASH: 'MANUAL_BKASH',
  AUTOMATED_GATEWAY: 'AUTOMATED_GATEWAY',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const StorefrontVersionStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  OBSOLETE: 'OBSOLETE',
} as const;
export type StorefrontVersionStatus =
  (typeof StorefrontVersionStatus)[keyof typeof StorefrontVersionStatus];

export const MediaUsageType = {
  PRODUCT_IMAGE: 'PRODUCT_IMAGE',
  STORE_LOGO: 'STORE_LOGO',
  STORE_BANNER: 'STORE_BANNER',
  CMS_ASSET: 'CMS_ASSET',
  INVOICE: 'INVOICE',
  OTHER: 'OTHER',
} as const;
export type MediaUsageType =
  (typeof MediaUsageType)[keyof typeof MediaUsageType];

export const AnnouncementStatus = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  PUBLISHED: 'PUBLISHED',
  EXPIRED: 'EXPIRED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type AnnouncementStatus =
  (typeof AnnouncementStatus)[keyof typeof AnnouncementStatus];

export const SupportTicketStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_ON_CUSTOMER: 'WAITING_ON_CUSTOMER',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;
export type SupportTicketStatus =
  (typeof SupportTicketStatus)[keyof typeof SupportTicketStatus];

export const SupportTicketPriority = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type SupportTicketPriority =
  (typeof SupportTicketPriority)[keyof typeof SupportTicketPriority];

export const CouponDiscountType = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED: 'FIXED',
} as const;
export type CouponDiscountType =
  (typeof CouponDiscountType)[keyof typeof CouponDiscountType];

export const ReturnStatus = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ITEM_RECEIVED: 'ITEM_RECEIVED',
  REFUNDED: 'REFUNDED',
} as const;
export type ReturnStatus = (typeof ReturnStatus)[keyof typeof ReturnStatus];

export const RefundMethod = {
  BKASH: 'BKASH',
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
  STORE_CREDIT: 'STORE_CREDIT',
} as const;
export type RefundMethod = (typeof RefundMethod)[keyof typeof RefundMethod];

export const TrialLeadStatus = {
  LEAD: 'LEAD',
  TRIAL_PENDING: 'TRIAL_PENDING',
  TRIAL_ACTIVE: 'TRIAL_ACTIVE',
  TRIAL_EXPIRED: 'TRIAL_EXPIRED',
  CONVERTED: 'CONVERTED',
  REJECTED: 'REJECTED',
} as const;
export type TrialLeadStatus =
  (typeof TrialLeadStatus)[keyof typeof TrialLeadStatus];

export const CustomThemeAvailability = {
  INCLUDED: 'INCLUDED',
  ADDITIONAL_CHARGE: 'ADDITIONAL_CHARGE',
} as const;
export type CustomThemeAvailability =
  (typeof CustomThemeAvailability)[keyof typeof CustomThemeAvailability];

export const BillingPeriodStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;
export type BillingPeriodStatus =
  (typeof BillingPeriodStatus)[keyof typeof BillingPeriodStatus];

export const BillingEntryType = {
  SUBSCRIPTION_CHARGE: 'SUBSCRIPTION_CHARGE',
  PLATFORM_FEE: 'PLATFORM_FEE',
  ADJUSTMENT: 'ADJUSTMENT',
  CREDIT: 'CREDIT',
  PAYMENT: 'PAYMENT',
} as const;
export type BillingEntryType =
  (typeof BillingEntryType)[keyof typeof BillingEntryType];

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  VOID: 'VOID',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const MerchantPaymentMethod = {
  MANUAL_BKASH: 'MANUAL_BKASH',
  MANUAL_BANK_TRANSFER: 'MANUAL_BANK_TRANSFER',
} as const;
export type MerchantPaymentMethod =
  (typeof MerchantPaymentMethod)[keyof typeof MerchantPaymentMethod];

export const MerchantPaymentStatus = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;
export type MerchantPaymentStatus =
  (typeof MerchantPaymentStatus)[keyof typeof MerchantPaymentStatus];

/** CommerceNest's own normalized delivery-status vocabulary — every
 * courier's raw status gets mapped into this set. See
 * services/courier/types.ts and COURIER_ARCHITECTURE.md. */
export const ShipmentStatus = {
  CREATED: 'CREATED',
  IN_REVIEW: 'IN_REVIEW',
  PICKED_UP: 'PICKED_UP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  PARTIAL_DELIVERED: 'PARTIAL_DELIVERED',
  ON_HOLD: 'ON_HOLD',
  CANCELLED: 'CANCELLED',
  RETURNED: 'RETURNED',
  FAILED: 'FAILED',
} as const;
export type ShipmentStatus = (typeof ShipmentStatus)[keyof typeof ShipmentStatus];

/** Bangladesh mobile number: 01[3-9] followed by 8 digits (11 total). */
export const BANGLADESH_PHONE_REGEX = /^01[3-9]\d{8}$/;

export const STORE_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PRODUCT_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
