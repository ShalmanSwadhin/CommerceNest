import { z } from 'zod';

/** Body for POST /storefront/:storeSlug/products/:productSlug/reviews —
 * always tied to a real Order (verified-purchase check happens service-side,
 * this schema just shapes the input). */
export const submitReviewSchema = z
  .object({
    orderId: z.string().cuid(),
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().max(120).optional(),
    comment: z.string().trim().max(2000).optional(),
  })
  .strict();

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

export const moderateReviewSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
  })
  .strict();

export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;

export const reviewListQuerySchema = z
  .object({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
    productId: z.string().cuid().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;
