import {
  OrderStatus,
  ReviewStatus,
  submitReviewSchema,
  moderateReviewSchema,
  reviewListQuerySchema,
} from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { CUSTOMER_SAFE_SELECT } from './customer.service.js';

/** Recomputes Product.ratingAverage/reviewCount from scratch off the
 * APPROVED rows for that product — run inside the same transaction as any
 * write that changes a review's status. A full recompute (not an
 * incremental +/-) avoids any possibility of drift; moderation actions are
 * rare enough that this is cheap. */
async function recomputeProductRating(tx: typeof prisma, productId: string) {
  const agg = await tx.productReview.aggregate({
    where: { productId, status: ReviewStatus.APPROVED },
    _avg: { rating: true },
    _count: true,
  });
  await tx.product.update({
    where: { id: productId },
    data: {
      ratingAverage: agg._count > 0 ? agg._avg.rating : null,
      reviewCount: agg._count,
    },
  });
}

/** A customer can review a product only once they have a DELIVERED order
 * that actually contains it — this is the "verified purchase" guarantee,
 * checked server-side against real order data, not a client-asserted flag. */
async function assertVerifiedPurchase(
  storeId: string,
  customerId: string,
  productId: string,
  orderId: string,
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId, customerId, status: OrderStatus.DELIVERED },
    include: { items: { where: { productId }, select: { id: true } } },
  });
  if (!order) {
    throw AppError.badRequest('That order was not found, is not yours, or is not yet delivered');
  }
  if (order.items.length === 0) {
    throw AppError.badRequest('That order does not contain this product');
  }
}

function serializeReview(review: {
  id: string;
  productId: string;
  customerId: string;
  orderId: string;
  rating: number;
  title: string | null;
  comment: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  customer?: { id: string; name: string } | null;
}) {
  return {
    id: review.id,
    productId: review.productId,
    orderId: review.orderId,
    rating: review.rating,
    title: review.title,
    comment: review.comment,
    status: review.status,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    customerName: review.customer?.name ?? null,
    verifiedPurchase: true, // always true by construction — see assertVerifiedPurchase
  };
}

/** Submit or edit a review — one per (customer, product), enforced by a DB
 * unique constraint. Editing an existing review resets it to PENDING (and
 * recomputes the product's aggregate if it had been APPROVED) — an edited
 * review must be re-moderated, never keep a stale approval. */
export async function submitReview(
  storeId: string,
  customerId: string,
  productSlug: string,
  input: unknown,
) {
  const data = submitReviewSchema.parse(input);
  const product = await prisma.product.findFirst({
    where: { storeId, slug: productSlug },
    select: { id: true },
  });
  if (!product) throw AppError.notFound('Product not found');

  await assertVerifiedPurchase(storeId, customerId, product.id, data.orderId);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.productReview.findUnique({
      where: { storeId_productId_customerId: { storeId, productId: product.id, customerId } },
    });
    const wasApproved = existing?.status === ReviewStatus.APPROVED;

    const review = await tx.productReview.upsert({
      where: { storeId_productId_customerId: { storeId, productId: product.id, customerId } },
      create: {
        storeId,
        productId: product.id,
        customerId,
        orderId: data.orderId,
        rating: data.rating,
        title: data.title,
        comment: data.comment,
        status: ReviewStatus.PENDING,
      },
      update: {
        orderId: data.orderId,
        rating: data.rating,
        title: data.title,
        comment: data.comment,
        status: ReviewStatus.PENDING,
        moderatedById: null,
        moderatedAt: null,
      },
    });

    if (wasApproved) {
      await recomputeProductRating(tx as unknown as typeof prisma, product.id);
    }
    return review;
  });

  return serializeReview(result);
}

/** Whether (and via which order) a customer is eligible to review a
 * product right now — the storefront uses this to decide whether to show a
 * "Write a review" action at all, rather than letting them attempt it and
 * fail. */
export async function getReviewEligibility(storeId: string, customerId: string, productSlug: string) {
  const product = await prisma.product.findFirst({ where: { storeId, slug: productSlug }, select: { id: true } });
  if (!product) throw AppError.notFound('Product not found');

  const [existing, eligibleOrder] = await Promise.all([
    prisma.productReview.findUnique({
      where: { storeId_productId_customerId: { storeId, productId: product.id, customerId } },
      select: { id: true, status: true, rating: true, title: true, comment: true },
    }),
    prisma.order.findFirst({
      where: {
        storeId,
        customerId,
        status: OrderStatus.DELIVERED,
        items: { some: { productId: product.id } },
      },
      select: { id: true, orderNumber: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    canReview: !!eligibleOrder,
    eligibleOrder,
    existingReview: existing,
  };
}

export async function listApprovedReviews(storeSlug: string, productSlug: string, query: unknown) {
  const q = reviewListQuerySchema.parse(query);
  const store = await prisma.store.findUnique({ where: { slug: storeSlug }, select: { id: true } });
  if (!store) throw AppError.notFound('Store not found');
  const product = await prisma.product.findFirst({
    where: { storeId: store.id, slug: productSlug },
    select: { id: true },
  });
  if (!product) throw AppError.notFound('Product not found');

  const where = { storeId: store.id, productId: product.id, status: ReviewStatus.APPROVED };
  const [items, total] = await Promise.all([
    prisma.productReview.findMany({
      where,
      include: { customer: { select: CUSTOMER_SAFE_SELECT } },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.productReview.count({ where }),
  ]);

  return { items: items.map(serializeReview), total, page: q.page, limit: q.limit };
}

// ---------------------------------------------------------------------------
// Staff moderation (Store Admin)
// ---------------------------------------------------------------------------

export async function listReviewsForModeration(storeId: string, query: unknown) {
  const q = reviewListQuerySchema.parse(query);
  const where = {
    storeId,
    ...(q.status ? { status: q.status } : {}),
    ...(q.productId ? { productId: q.productId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.productReview.findMany({
      where,
      include: {
        customer: { select: CUSTOMER_SAFE_SELECT },
        product: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.productReview.count({ where }),
  ]);

  return {
    items: items.map((r) => ({ ...serializeReview(r), product: r.product })),
    total,
    page: q.page,
    limit: q.limit,
  };
}

export async function moderateReview(
  storeId: string,
  reviewId: string,
  input: unknown,
  actorId: string,
) {
  const data = moderateReviewSchema.parse(input);
  const review = await prisma.productReview.findFirst({ where: { id: reviewId, storeId } });
  if (!review) throw AppError.notFound('Review not found');

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.productReview.update({
      where: { id: reviewId },
      data: { status: data.status, moderatedById: actorId, moderatedAt: new Date() },
    });
    await recomputeProductRating(tx as unknown as typeof prisma, review.productId);
    return result;
  });

  return serializeReview(updated);
}
