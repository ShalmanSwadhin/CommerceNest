import { z } from 'zod';
import {
  bangladeshPhoneSchema,
} from './auth.js';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PreferredLocale,
} from '../enums.js';

// ---------------------------------------------------------------------------
// Delivery address (stored as JSON on Order.deliveryAddress)
// ---------------------------------------------------------------------------

export const deliveryAddressSchema = z
  .object({
    label: z.string().trim().min(1).max(60).default('Home'),
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).optional(),
    area: z.string().trim().min(1).max(100),
    district: z.string().trim().min(1).max(100),
    division: z.string().trim().min(1).max(100),
    postalCode: z.string().trim().max(10).optional(),
    recipientName: z.string().trim().min(1).max(120),
    recipientPhone: bangladeshPhoneSchema,
  })
  .strict();

export type DeliveryAddress = z.infer<typeof deliveryAddressSchema>;

// ---------------------------------------------------------------------------
// Checkout cart items (client-side cart, validated at checkout)
// ---------------------------------------------------------------------------

export const checkoutLineItemSchema = z
  .object({
    productId: z.string().cuid(),
    variantId: z.string().cuid(),
    quantity: z.number().int().positive().max(99),
  })
  .strict();

export type CheckoutLineItem = z.infer<typeof checkoutLineItemSchema>;

export const checkoutSchema = z
  .object({
    items: z.array(checkoutLineItemSchema).min(1).max(50),
    customerName: z.string().trim().min(1).max(120),
    customerPhone: bangladeshPhoneSchema,
    customerEmail: z.string().trim().email().max(255).optional(),
    preferredLocale: z
      .enum([PreferredLocale.en, PreferredLocale.bn])
      .default(PreferredLocale.bn),
    deliveryAddress: deliveryAddressSchema,
    paymentMethod: z.enum([
      PaymentMethod.CASH_ON_DELIVERY,
      PaymentMethod.MANUAL_BKASH,
    ]),
    customerNote: z.string().trim().max(500).optional(),
  })
  .strict();

export type CheckoutInput = z.infer<typeof checkoutSchema>;

// ---------------------------------------------------------------------------
// Manual bKash payment submission (customer-facing, post-checkout)
// ---------------------------------------------------------------------------

export const submitBkashPaymentSchema = z
  .object({
    orderId: z.string().cuid(),
    bkashTxnId: z
      .string()
      .trim()
      .min(6, { message: 'Transaction ID is required' })
      .max(32),
    bkashSenderPhone: bangladeshPhoneSchema,
    bkashAmount: z
      .number()
      .positive({ message: 'Amount must be greater than zero' })
      .multipleOf(0.01),
    bkashNote: z.string().trim().max(300).optional(),
  })
  .strict();

export type SubmitBkashPaymentInput = z.infer<
  typeof submitBkashPaymentSchema
>;

// ---------------------------------------------------------------------------
// Staff: verify or reject manual bKash payment
// ---------------------------------------------------------------------------

export const verifyBkashPaymentSchema = z
  .object({
    orderId: z.string().cuid(),
    approved: z.boolean(),
    rejectionReason: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.approved && !data.rejectionReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Rejection reason is required when rejecting a payment',
        path: ['rejectionReason'],
      });
    }
  });

export type VerifyBkashPaymentInput = z.infer<
  typeof verifyBkashPaymentSchema
>;

// ---------------------------------------------------------------------------
// COD confirmation call
// ---------------------------------------------------------------------------

export const confirmCodOrderSchema = z
  .object({
    orderId: z.string().cuid(),
    codConfirmedByCall: z.literal(true),
    codCallNote: z.string().trim().max(1000).optional(),
  })
  .strict();

export type ConfirmCodOrderInput = z.infer<typeof confirmCodOrderSchema>;

export const recordCodCallAttemptSchema = z
  .object({
    orderId: z.string().cuid(),
    note: z.string().trim().max(1000).optional(),
    reachedCustomer: z.boolean(),
  })
  .strict();

export type RecordCodCallAttemptInput = z.infer<
  typeof recordCodCallAttemptSchema
>;

/** Body for POST /orders/:orderId/confirm-cod (route-level, no orderId in body) */
export const confirmCodCallBodySchema = z
  .object({
    codCallNote: z.string().trim().max(1000).optional(),
    overrideReason: z.string().trim().max(500).optional(),
  })
  .strict();

export type ConfirmCodCallBody = z.infer<typeof confirmCodCallBodySchema>;

/** Body for PATCH /orders/:orderId/courier */
export const updateCourierBodySchema = z
  .object({
    courierName: z.string().trim().max(120).optional(),
    courierTrackingId: z.string().trim().max(120).optional(),
    courierNotes: z.string().trim().max(1000).optional(),
  })
  .strict();

export type UpdateCourierBody = z.infer<typeof updateCourierBodySchema>;

// ---------------------------------------------------------------------------
// Order status updates
// ---------------------------------------------------------------------------

export const updateOrderStatusSchema = z
  .object({
    orderId: z.string().cuid(),
    status: z.enum([
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.RETURNED,
      OrderStatus.CANCELLED,
    ]),
    note: z.string().trim().max(1000).optional(),
    courierName: z.string().trim().max(120).optional(),
    courierTrackingId: z.string().trim().max(120).optional(),
    courierNotes: z.string().trim().max(1000).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.status === OrderStatus.SHIPPED && !data.courierTrackingId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Courier tracking ID is required when marking as shipped',
        path: ['courierTrackingId'],
      });
    }
  });

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

// ---------------------------------------------------------------------------
// Order list filters (staff dashboard)
// ---------------------------------------------------------------------------

export const orderListQuerySchema = z
  .object({
    status: z
      .enum([
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.PROCESSING,
        OrderStatus.SHIPPED,
        OrderStatus.DELIVERED,
        OrderStatus.RETURNED,
        OrderStatus.CANCELLED,
      ])
      .optional(),
    paymentMethod: z
      .enum([
        PaymentMethod.CASH_ON_DELIVERY,
        PaymentMethod.MANUAL_BKASH,
        PaymentMethod.AUTOMATED_GATEWAY,
      ])
      .optional(),
    paymentStatus: z
      .enum([
        PaymentStatus.PENDING,
        PaymentStatus.PENDING_VERIFICATION,
        PaymentStatus.APPROVED,
        PaymentStatus.REJECTED,
        PaymentStatus.REFUNDED,
        PaymentStatus.CANCELLED,
      ])
      .optional(),
    search: z.string().trim().max(100).optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
