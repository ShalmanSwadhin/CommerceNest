import {
  createCategorySchema,
  updateCategorySchema,
} from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export async function listCategories(storeId: string) {
  return prisma.category.findMany({
    where: { storeId },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { products: true } },
      children: true,
    },
  });
}

export async function getCategory(storeId: string, categoryId: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, storeId },
    include: { children: true, parent: true },
  });
  if (!category) throw AppError.notFound('Category not found');
  return category;
}

export async function createCategory(storeId: string, input: unknown) {
  const data = createCategorySchema.parse(input);
  const existing = await prisma.category.findUnique({
    where: { storeId_slug: { storeId, slug: data.slug } },
  });
  if (existing) throw AppError.conflict('Category slug already exists');

  if (data.parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: data.parentId, storeId },
    });
    if (!parent) throw AppError.badRequest('Parent category not found in store');
  }

  return prisma.category.create({
    data: {
      storeId,
      name: data.name,
      slug: data.slug,
      parentId: data.parentId,
      imageUrl: data.imageUrl || null,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
    },
  });
}

export async function updateCategory(
  storeId: string,
  categoryId: string,
  input: unknown,
) {
  await getCategory(storeId, categoryId);
  const data = updateCategorySchema.parse(input);

  if (data.slug) {
    const clash = await prisma.category.findFirst({
      where: { storeId, slug: data.slug, NOT: { id: categoryId } },
    });
    if (clash) throw AppError.conflict('Category slug already exists');
  }

  return prisma.category.update({
    where: { id: categoryId },
    data: {
      name: data.name,
      slug: data.slug,
      parentId: data.parentId,
      // Distinguish "field omitted, leave untouched" (undefined) from
      // "explicitly cleared" ('' — the Remove-image case) — an omitted
      // key must never overwrite an already-set imageUrl.
      ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl || null } : {}),
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
    },
  });
}

export async function deleteCategory(storeId: string, categoryId: string) {
  await getCategory(storeId, categoryId);
  await prisma.product.updateMany({
    where: { storeId, categoryId },
    data: { categoryId: null },
  });
  await prisma.category.delete({ where: { id: categoryId } });
  return { ok: true };
}
