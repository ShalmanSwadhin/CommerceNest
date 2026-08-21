import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { Button, Textarea, useToast } from '@commercenest/ui';
import { ApiClientError, storefrontApi, unwrapList } from '../lib/api';
import { formatDate } from '../lib/format';
import { useStoreSlug } from '../lib/storeSlug';
import { useAuthStore } from '../stores/authStore';

function StarRow({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'} />
      ))}
    </div>
  );
}

/** A real, moderated review system — not a decorative reviews tab. Works
 * for any theme (reads --store-* CSS vars for accent color, no
 * Modern-Commerce-specific chrome), since the underlying capability
 * (submit/moderate reviews) isn't a Modern Commerce feature, it's a real
 * CommerceNest one that any store benefits from. */
export function ProductReviews({
  productSlug,
  ratingAverage,
  reviewCount,
}: {
  productSlug: string;
  ratingAverage: number | null;
  reviewCount: number;
}) {
  const { slug } = useStoreSlug();
  const { customer } = useAuthStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const reviewsQ = useQuery({
    queryKey: ['storefront', slug, 'reviews', productSlug],
    queryFn: () => storefrontApi.productReviews(slug, productSlug),
    enabled: !!slug && !!productSlug,
  });
  const eligibilityQ = useQuery({
    queryKey: ['storefront', slug, 'review-eligibility', productSlug],
    queryFn: () => storefrontApi.reviewEligibility(slug, productSlug),
    enabled: !!slug && !!productSlug && !!customer,
  });

  const submitMut = useMutation({
    mutationFn: () => {
      const orderId = eligibilityQ.data?.eligibleOrder?.id;
      if (!orderId) throw new Error('No eligible order');
      return storefrontApi.submitReview(slug, productSlug, { orderId, rating, comment: comment.trim() || undefined });
    },
    onSuccess: () => {
      toast({ title: 'Review submitted', description: "It'll appear once reviewed by the store.", tone: 'success' });
      setComment('');
      void qc.invalidateQueries({ queryKey: ['storefront', slug, 'review-eligibility', productSlug] });
    },
    onError: (err) =>
      toast({ title: 'Could not submit review', description: err instanceof ApiClientError ? err.message : 'Unknown error', tone: 'danger' }),
  });

  const reviews = unwrapList(reviewsQ.data);
  const canReview = customer && eligibilityQ.data?.canReview && !eligibilityQ.data.existingReview;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {ratingAverage !== null ? (
          <>
            <div className="text-4xl font-bold">{ratingAverage.toFixed(1)}</div>
            <div>
              <StarRow value={ratingAverage} size={16} />
              <div className="text-sm text-ink-secondary mt-1">
                {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-secondary">No reviews yet — be the first to review this product.</p>
        )}
      </div>

      {canReview ? (
        <div className="rounded-cn border border-line bg-white p-4 space-y-3">
          <div className="text-sm font-medium">Write a review</div>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} type="button" onClick={() => setRating(i)} aria-label={`Rate ${i} stars`}>
                <Star size={22} className={i <= rating ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'} />
              </button>
            ))}
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your thoughts on this product (optional)"
          />
          <Button size="sm" loading={submitMut.isPending} onClick={() => submitMut.mutate()}>
            Submit review
          </Button>
        </div>
      ) : customer && eligibilityQ.data?.existingReview ? (
        <p className="text-sm text-ink-secondary">
          You&apos;ve already reviewed this product
          {eligibilityQ.data.existingReview.status === 'PENDING' ? ' — awaiting the store\'s review.' : '.'}
        </p>
      ) : null}

      {reviews.length === 0 ? null : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div key={r.id} className="border-b border-line pb-4 last:border-0">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-sunken text-xs font-semibold">
                  {(r.customerName || '?').charAt(0)}
                </span>
                <div>
                  <div className="text-sm font-semibold">{r.customerName || 'Customer'}</div>
                  <div className="text-xs text-ink-tertiary">{formatDate(r.createdAt)}</div>
                </div>
              </div>
              <div className="mt-2">
                <StarRow value={r.rating} />
              </div>
              {r.comment ? <p className="mt-2 text-sm text-ink-secondary">{r.comment}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
