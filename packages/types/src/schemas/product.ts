import { z } from 'zod';
import {
  PRODUCT_SLUG_REGEX,
  ProductStatus,
} from '../enums.js';

// ---------------------------------------------------------------------------
// Shared product primitives
// ---------------------------------------------------------------------------

const moneySchema = z
  .number({ invalid_type_error: 'Must be a number' })
  .nonnegative({ message: 'Amount cannot be negative' })
  .multipleOf(0.01, { message: 'Amount must have at most 2 decimal places' });

const productSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(PRODUCT_SLUG_REGEX, {
    message: 'Slug must be lowercase alphanumeric with hyphens',
  });

const productImageSchema = z.object({
  url: z.string().url(),
  publicId: z.string().optional(),
  alt: z.string().max(200).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export type ProductImage = z.infer<typeof productImageSchema>;

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export const createVariantSchema = z
  .object({
    sku: z.string().trim().min(1).max(64),
    size: z.string().trim().max(32).optional(),
    color: z.string().trim().max(64).optional(),
    priceOverride: moneySchema.optional(),
    stock: z.number().int().nonnegative().default(0),
  })
  .strict();

export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const updateVariantSchema = createVariantSchema
  .partial()
  .extend({
    id: z.string().cuid().optional(),
  })
  .strict();

export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const createProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug: productSlugSchema,
    description: z.string().max(10000).optional(),
    categoryId: z.string().cuid().optional(),
    basePrice: moneySchema,
    compareAtPrice: moneySchema.optional(),
    status: z
      .enum([ProductStatus.DRAFT, ProductStatus.ACTIVE])
      .default(ProductStatus.DRAFT),
    images: z.array(productImageSchema).max(20).default([]),
    seoTitle: z.string().max(70).optional(),
    seoDescription: z.string().max(320).optional(),
    lowStockThreshold: z.number().int().nonnegative().default(5),
    variants: z.array(createVariantSchema).min(1),
  })
  .strict()
  .refine((data) => data.compareAtPrice === undefined || data.compareAtPrice > data.basePrice, {
    message: 'Compare-at price must be greater than the selling price',
    path: ['compareAtPrice'],
  });

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    slug: productSlugSchema.optional(),
    description: z.string().max(10000).nullable().optional(),
    categoryId: z.string().cuid().nullable().optional(),
    basePrice: moneySchema.optional(),
    compareAtPrice: moneySchema.nullable().optional(),
    status: z
      .enum([
        ProductStatus.DRAFT,
        ProductStatus.ACTIVE,
        ProductStatus.ARCHIVED,
      ])
      .optional(),
    images: z.array(productImageSchema).max(20).optional(),
    seoTitle: z.string().max(70).nullable().optional(),
    seoDescription: z.string().max(320).nullable().optional(),
    lowStockThreshold: z.number().int().nonnegative().optional(),
    variants: z.array(updateVariantSchema).optional(),
  })
  .strict()
  .refine(
    (data) =>
      !data.compareAtPrice ||
      data.basePrice === undefined ||
      data.compareAtPrice > data.basePrice,
    {
      message: 'Compare-at price must be greater than the selling price',
      path: ['compareAtPrice'],
    },
  );

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productListQuerySchema = z
  .object({
    status: z
      .enum([
        ProductStatus.DRAFT,
        ProductStatus.ACTIVE,
        ProductStatus.ARCHIVED,
      ])
      .optional(),
    categoryId: z.string().cuid().optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type ProductListQuery = z.infer<typeof productListQuerySchema>;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .regex(PRODUCT_SLUG_REGEX),
    parentId: z.string().cuid().optional(),
    // No max length, matching theme branding's logoUrl/faviconUrl
    // (packages/types/src/schemas/theme.ts) — MediaImageField falls back to
    // a base64 data: URL when Cloudinary isn't configured (e.g. local dev),
    // which routinely runs to tens of thousands of characters. A max(2000)
    // here rejected every such upload with "Validation failed" and no
    // detail surfaced to the merchant.
    imageUrl: z.string().trim().optional(),
    seoTitle: z.string().max(70).optional(),
    seoDescription: z.string().max(320).optional(),
  })
  .strict();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial().strict();

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
