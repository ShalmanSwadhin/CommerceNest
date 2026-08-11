import { z } from 'zod';
import {
  bangladeshPhoneSchema,
  emailSchema,
} from './auth.js';
import {
  DomainType,
  STORE_SLUG_REGEX,
  StoreStatus,
} from '../enums.js';

// ---------------------------------------------------------------------------
// Store provisioning (Master Admin)
// ---------------------------------------------------------------------------

export const createStoreSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(63)
      .regex(STORE_SLUG_REGEX, {
        message: 'Slug must be lowercase alphanumeric with hyphens',
      }),
    ownerEmail: emailSchema,
    ownerName: z.string().trim().min(1).max(120),
    ownerPhone: bangladeshPhoneSchema.optional(),
    category: z.string().trim().max(80).optional(),
    tagline: z.string().trim().max(200).optional(),
    planTier: z.enum(['starter', 'growth', 'pro']).default('starter'),
  })
  .strict();

export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export const updateStoreSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    category: z.string().trim().max(80).nullable().optional(),
    tagline: z.string().trim().max(200).nullable().optional(),
    planTier: z.enum(['starter', 'growth', 'pro']).optional(),
    bkashNumber: bangladeshPhoneSchema.nullable().optional(),
    bkashInstructions: z.string().trim().max(2000).nullable().optional(),
    shippingInsideDhaka: z.number().nonnegative().optional(),
    shippingOutsideDhaka: z.number().nonnegative().optional(),
    freeShippingThreshold: z.number().nonnegative().nullable().optional(),
  })
  .strict();

export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

export const suspendStoreSchema = z
  .object({
    storeId: z.string().cuid(),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

export type SuspendStoreInput = z.infer<typeof suspendStoreSchema>;

export const updateStoreStatusSchema = z
  .object({
    storeId: z.string().cuid(),
    status: z.enum([
      StoreStatus.PENDING_SETUP,
      StoreStatus.ACTIVE,
      StoreStatus.SUSPENDED,
      StoreStatus.ARCHIVED,
    ]),
    suspendedReason: z.string().trim().max(2000).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.status === StoreStatus.SUSPENDED && !data.suspendedReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Suspension reason is required when suspending a store',
        path: ['suspendedReason'],
      });
    }
  });

export type UpdateStoreStatusInput = z.infer<typeof updateStoreStatusSchema>;

// ---------------------------------------------------------------------------
// Store domains
// ---------------------------------------------------------------------------

const hostnameSchema = z
  .string()
  .trim()
  .min(3)
  .max(253)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/,
    { message: 'Invalid hostname format' },
  );

export const addStoreDomainSchema = z
  .object({
    hostname: hostnameSchema,
    type: z.enum([DomainType.SUBDOMAIN, DomainType.CUSTOM]),
    isPrimary: z.boolean().default(false),
  })
  .strict();

export type AddStoreDomainInput = z.infer<typeof addStoreDomainSchema>;

export const verifyStoreDomainSchema = z
  .object({
    domainId: z.string().cuid().optional(),
    hostname: hostnameSchema.optional(),
    /** Challenge token — must match the stored verificationToken */
    verificationToken: z.string().trim().min(1).max(128).optional(),
    /** Alias for verificationToken (V1 challenge body: { hostname, token }) */
    token: z.string().trim().min(1).max(128).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.domainId && !data.hostname) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'domainId or hostname is required',
        path: ['hostname'],
      });
    }
    if (!data.verificationToken && !data.token) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'verification token is required',
        path: ['token'],
      });
    }
  });

export type VerifyStoreDomainInput = z.infer<typeof verifyStoreDomainSchema>;

export const setPrimaryDomainSchema = z
  .object({
    domainId: z.string().cuid(),
  })
  .strict();

export type SetPrimaryDomainInput = z.infer<typeof setPrimaryDomainSchema>;

// ---------------------------------------------------------------------------
// Store setup (owner onboarding)
// ---------------------------------------------------------------------------

export const completeStoreSetupSchema = z
  .object({
    bkashNumber: bangladeshPhoneSchema.optional(),
    bkashInstructions: z.string().trim().max(2000).optional(),
    category: z.string().trim().max(80).optional(),
    tagline: z.string().trim().max(200).optional(),
  })
  .strict();

export type CompleteStoreSetupInput = z.infer<
  typeof completeStoreSetupSchema
>;
