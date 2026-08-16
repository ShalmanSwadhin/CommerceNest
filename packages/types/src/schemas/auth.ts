import { z } from 'zod';
import {
  BANGLADESH_PHONE_REGEX,
  UserRole,
} from '../enums.js';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const bangladeshPhoneSchema = z
  .string()
  .trim()
  .regex(BANGLADESH_PHONE_REGEX, {
    message: 'Phone must be a valid Bangladesh mobile number (01XXXXXXXXX)',
  });

export const emailSchema = z
  .string()
  .trim()
  .email({ message: 'Invalid email address' })
  .max(255);

export const passwordSchema = z
  .string()
  .min(8, { message: 'Password must be at least 8 characters' })
  .max(128, { message: 'Password must be at most 128 characters' });

export const cuidSchema = z.string().cuid();

// ---------------------------------------------------------------------------
// Staff authentication
// ---------------------------------------------------------------------------

export const staffLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'Password is required' }),
});

export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

export const staffRegisterSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    name: z.string().trim().min(1).max(120),
    phone: bangladeshPhoneSchema.optional(),
    inviteToken: z.string().min(1, { message: 'Invite token is required' }),
  })
  .strict();

export type StaffRegisterInput = z.infer<typeof staffRegisterSchema>;

export const acceptInviteSchema = staffRegisterSchema;

export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

// ---------------------------------------------------------------------------
// Staff invitations (Master Admin / Store Owner)
// ---------------------------------------------------------------------------

export const inviteStaffSchema = z
  .object({
    email: emailSchema,
    name: z.string().trim().min(1).max(120),
    phone: bangladeshPhoneSchema.optional(),
    role: z.enum([
      UserRole.STORE_OWNER,
      UserRole.STORE_MANAGER,
      UserRole.INVENTORY_MANAGER,
      UserRole.ORDER_MANAGER,
      UserRole.CUSTOMER_SUPPORT,
    ]),
    storeId: cuidSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const storeScopedRoles = [
      UserRole.STORE_OWNER,
      UserRole.STORE_MANAGER,
      UserRole.INVENTORY_MANAGER,
      UserRole.ORDER_MANAGER,
      UserRole.CUSTOMER_SUPPORT,
    ] as const;

    if (
      (storeScopedRoles as readonly string[]).includes(data.role) &&
      !data.storeId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'storeId is required for store-scoped roles',
        path: ['storeId'],
      });
    }
  });

export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

export const masterAdminInviteStoreOwnerSchema = z
  .object({
    email: emailSchema,
    name: z.string().trim().min(1).max(120),
    phone: bangladeshPhoneSchema.optional(),
    storeId: cuidSchema,
  })
  .strict();

export type MasterAdminInviteStoreOwnerInput = z.infer<
  typeof masterAdminInviteStoreOwnerSchema
>;

// ---------------------------------------------------------------------------
// Customer storefront authentication
// ---------------------------------------------------------------------------

/**
 * Name/email/password is the PRIMARY storefront customer path — simple,
 * immediate, no forced verification (see AUTHENTICATION_ARCHITECTURE.md).
 * Phone OTP login (bangladeshPhoneSchema-based, see storefrontOtpRequest/
 * VerifySchema below) remains available as a second, independent login
 * method — not replaced by this.
 */
export const customerRegisterSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    phone: bangladeshPhoneSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      });
    }
  });

export type CustomerRegisterInput = z.infer<typeof customerRegisterSchema>;

export const customerLoginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, { message: 'Password is required' }),
  })
  .strict();

export type CustomerLoginInput = z.infer<typeof customerLoginSchema>;

export const customerRequestPasswordResetSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export type CustomerRequestPasswordResetInput = z.infer<
  typeof customerRequestPasswordResetSchema
>;

export const customerResetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordSchema,
  })
  .strict();

export type CustomerResetPasswordInput = z.infer<
  typeof customerResetPasswordSchema
>;
