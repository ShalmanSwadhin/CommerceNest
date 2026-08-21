import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { isUniqueConstraintError } from '../lib/prisma.js';

export async function listWishlist(storeId: string, customerId: string) {
  const items = await prisma.wishlistItem.findMany({
    where: { storeId, customerId },
    include: { product: { include: { variants: true, category: true } } },
    orderBy: { createdAt: 'desc' },
  });
  // A wishlisted product that's since gone DRAFT/ARCHIVED is quietly
  // excluded rather than shown broken — matches how the storefront never
  // surfaces non-ACTIVE products anywhere else.
  return items
    .filter((i) => i.product.status === 'ACTIVE')
    .map((i) => ({ id: i.id, addedAt: i.createdAt, product: i.product }));
}

/** Just the product ids, for the storefront to know which grid/card items
 * are already wishlisted without fetching full product rows twice. */
export async function getWishlistProductIds(storeId: string, customerId: string): Promise<string[]> {
  const items = await prisma.wishlistItem.findMany({
    where: { storeId, customerId },
    select: { productId: true },
  });
  return items.map((i) => i.productId);
}

export async function addToWishlist(storeId: string, customerId: string, productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, storeId }, select: { id: true } });
  if (!product) throw AppError.notFound('Product not found');

  try {
    await prisma.wishlistItem.create({ data: { storeId, customerId, productId } });
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err; // already wishlisted — idempotent no-op
  }
  return { wishlisted: true };
}

export async function removeFromWishlist(storeId: string, customerId: string, productId: string) {
  await prisma.wishlistItem.deleteMany({ where: { storeId, customerId, productId } });
  return { wishlisted: false };
}
