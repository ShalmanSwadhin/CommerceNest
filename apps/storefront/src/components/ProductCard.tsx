import { useOutletContext } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { themeProductCardSchema } from '@commercenest/types/schemas/theme';
import type { StorefrontProduct, ThemeSettings } from '../lib/api';
import { formatBdt } from '../lib/format';
import { cloudinaryThumb } from '../lib/media';
import { ModernProductCard } from '../themes/modern-commerce/ModernProductCard';

const IMAGE_RATIO_CLASS: Record<string, string> = {
  '1/1': 'aspect-square',
  '4/3': 'aspect-[4/3]',
  '3/4': 'aspect-[3/4]',
};

/** Per-style card chrome — 'modern' reproduces this card's original (and
 * still most common) look exactly, so existing themes render unchanged. */
const STYLE_CLASS: Record<string, string> = {
  classic: 'border border-line bg-white',
  modern: 'border border-line bg-white transition hover:-translate-y-0.5',
  minimal: 'bg-transparent',
  elevated: 'bg-white transition hover:-translate-y-1',
};

export function ProductCard({ product }: { product: StorefrontProduct }) {
  const { theme } = useOutletContext<{ theme?: ThemeSettings }>() ?? {};
  // Delegates to the theme-specific card when this store's published theme
  // is Modern Commerce — every page that already renders <ProductCard>
  // (catalog grid, search, etc.) picks up the faithful design automatically,
  // no per-page changes needed. Every other theme falls through unchanged.
  if (theme?.templateId === 'modern-commerce') {
    return <ModernProductCard product={product} />;
  }
  const card = themeProductCardSchema.parse(
    (theme && typeof theme.productCard === 'object' && theme.productCard) || {},
  );

  const image = product.images?.[0]?.url;
  const basePrice = Number(product.basePrice);
  const compareAtPrice = product.compareAtPrice != null ? Number(product.compareAtPrice) : null;
  const hasDiscount = card.showDiscount && !!compareAtPrice && compareAtPrice > basePrice;
  const discountPct = hasDiscount
    ? Math.round((1 - basePrice / compareAtPrice!) * 100)
    : 0;

  const useShadow = card.style === 'elevated';

  return (
    <Link
      to={`/p/${product.slug}`}
      className={`group relative overflow-hidden ${STYLE_CLASS[card.style]}`}
      style={{
        borderRadius: 'var(--store-radius, 12px)',
        boxShadow: useShadow ? 'var(--store-shadow, 0 8px 24px rgba(15,23,42,0.12))' : undefined,
      }}
    >
      <div className={`relative overflow-hidden bg-surface-sunken ${IMAGE_RATIO_CLASS[card.imageRatio]}`}>
        {image ? (
          <img
            src={cloudinaryThumb(image, 480)}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-tertiary">No image</div>
        )}
        {hasDiscount ? (
          <span className="absolute left-2 top-2 rounded-full bg-[var(--store-primary,#4F46E5)] px-2 py-0.5 text-xs font-semibold text-white">
            -{discountPct}%
          </span>
        ) : null}
      </div>
      <div className="space-y-1 p-3">
        <div className="line-clamp-2 text-sm font-medium text-ink">{product.name}</div>
        {card.showPrice ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold text-[var(--store-primary,#4F46E5)]">
              {formatBdt(basePrice)}
            </span>
            {hasDiscount ? (
              <span className="text-xs text-ink-tertiary line-through">
                {formatBdt(compareAtPrice!)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
