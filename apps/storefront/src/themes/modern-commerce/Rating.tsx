import { Star } from 'lucide-react';

/** Real data only — value/count come from Product.ratingAverage/reviewCount
 * (a real, moderated review aggregate, not a decorative placeholder).
 * Renders nothing when a product has no reviews yet, rather than showing a
 * fake "0.0 (0)" or a full row of empty stars implying reviews exist. */
export function ModernRating({
  value,
  count,
  size = 'sm',
  showCount = true,
}: {
  value: number | null | undefined;
  count?: number;
  size?: 'sm' | 'md';
  showCount?: boolean;
}) {
  if (value === null || value === undefined || !count) return null;
  const starSize = size === 'sm' ? 12 : 14;
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            size={starSize}
            className={i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'}
          />
        ))}
      </div>
      {showCount && count !== undefined ? (
        <span className={`text-[var(--store-muted,#4B5563)] ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
          {value.toFixed(1)} ({count.toLocaleString()})
        </span>
      ) : null}
    </div>
  );
}
