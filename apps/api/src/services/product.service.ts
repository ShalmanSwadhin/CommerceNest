import { z } from 'zod';
import {
  createProductSchema,
  productListQuerySchema,
  updateProductSchema,
  ProductStatus,
} from '@commercenest/types';
import type { Prisma } from '@commercenest/prisma';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { emitAfterCommit } from '../events/emit.js';
import { assertStoreMatch } from '../middleware/storeScope.js';
import { assertWithinProductLimit } from './subscription.service.js';

export async function listProducts(storeId: string, query: unknown) {
  const q = productListQuerySchema.parse(query);
  const where: Prisma.ProductWhereInput = { storeId };
  if (q.status) where.status = q.status;
  if (q.categoryId) where.categoryId = q.categoryId;
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: 'insensitive' } },
      { slug: { contains: q.search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { variants: true, category: true },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.product.count({ where }),
  ]);

  return { items, total, page: q.page, limit: q.limit };
}

export async function getProduct(storeId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, storeId },
    include: { variants: true, category: true },
  });
  if (!product) throw AppError.notFound('Product not found');
  return product;
}

export async function createProduct(
  storeId: string,
  input: unknown,
  actorId: string,
) {
  const data = createProductSchema.parse(input);

  await assertWithinProductLimit(storeId);

  const existing = await prisma.product.findUnique({
    where: { storeId_slug: { storeId, slug: data.slug } },
  });
  if (existing) throw AppError.conflict('Product slug already exists');

  const product = await prisma.product.create({
    data: {
      storeId,
      categoryId: data.categoryId,
      name: data.name,
      slug: data.slug,
      description: data.description,
      basePrice: data.basePrice,
      status: data.status,
      images: data.images,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
      lowStockThreshold: data.lowStockThreshold,
      variants: {
        create: data.variants.map((v) => ({
          storeId,
          sku: v.sku,
          size: v.size,
          color: v.color,
          priceOverride: v.priceOverride,
          stock: v.stock,
        })),
      },
    },
    include: { variants: true },
  });

  emitAfterCommit('ProductCreated', {
    storeId,
    actorId,
    payload: {
      storeId,
      productId: product.id,
      actorId,
      status: product.status as never,
    },
  });

  return product;
}

export async function updateProduct(
  storeId: string,
  productId: string,
  input: unknown,
) {
  const data = updateProductSchema.parse(input);
  const existing = await getProduct(storeId, productId);
  assertStoreMatch(existing.storeId, storeId);

  if (data.slug && data.slug !== existing.slug) {
    const clash = await prisma.product.findUnique({
      where: { storeId_slug: { storeId, slug: data.slug } },
    });
    if (clash) throw AppError.conflict('Product slug already exists');
  }

  const product = await prisma.product.update({
    where: { id: productId },
    data: {
      name: data.name,
      slug: data.slug,
      description: data.description === null ? null : data.description,
      categoryId: data.categoryId === null ? null : data.categoryId,
      basePrice: data.basePrice,
      status: data.status,
      images: data.images as Prisma.InputJsonValue | undefined,
      seoTitle: data.seoTitle === null ? null : data.seoTitle,
      seoDescription: data.seoDescription === null ? null : data.seoDescription,
      lowStockThreshold: data.lowStockThreshold,
    },
    include: { variants: true },
  });

  if (data.variants) {
    const incomingIds = new Set(data.variants.filter((v) => v.id).map((v) => v.id));
    const toRemove = existing.variants
      .map((v) => v.id)
      .filter((id) => !incomingIds.has(id));

    // Guard against removing every variant — a product must keep at least one.
    const remainingCount = existing.variants.length - toRemove.length +
      data.variants.filter((v) => !v.id && v.sku).length;
    if (toRemove.length > 0 && remainingCount < 1) {
      throw AppError.badRequest('A product must have at least one variant');
    }

    for (const variantId of toRemove) {
      try {
        await prisma.variant.delete({ where: { id: variantId } });
      } catch {
        // Variant has order history (FK restrict) — can't be hard-deleted
        // without losing past order integrity. Zero its stock instead so
        // it stops being sellable, matching what "removing" it should do.
        await prisma.variant.update({
          where: { id: variantId },
          data: { stock: 0 },
        });
      }
    }

    for (const v of data.variants) {
      if (v.id) {
        await prisma.variant.updateMany({
          where: { id: v.id, storeId, productId },
          data: {
            sku: v.sku,
            size: v.size,
            color: v.color,
            priceOverride: v.priceOverride,
            stock: v.stock,
          },
        });
      } else if (v.sku) {
        await prisma.variant.create({
          data: {
            storeId,
            productId,
            sku: v.sku,
            size: v.size,
            color: v.color,
            priceOverride: v.priceOverride,
            stock: v.stock ?? 0,
          },
        });
      }
    }
  }

  return getProduct(storeId, productId);
}

export async function archiveProduct(storeId: string, productId: string) {
  await getProduct(storeId, productId);
  return prisma.product.update({
    where: { id: productId },
    data: { status: ProductStatus.ARCHIVED },
  });
}

const adjustStockSchema = z
  .object({
    variantId: z.string().cuid(),
    stock: z.number().int().min(0),
  })
  .strict();

export async function adjustVariantStock(
  storeId: string,
  productId: string,
  input: unknown,
) {
  const data = adjustStockSchema.parse(input);
  await getProduct(storeId, productId);

  const variant = await prisma.variant.findFirst({
    where: { id: data.variantId, productId, storeId },
  });
  if (!variant) throw AppError.notFound('Variant not found');

  const updated = await prisma.variant.update({
    where: { id: variant.id },
    data: { stock: data.stock },
  });

  return updated;
}
