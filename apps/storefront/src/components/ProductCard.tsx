import { Link } from 'react-router-dom';
import type { StorefrontProduct } from '../lib/api';
import { formatBdt } from '../lib/format';
import { cloudinaryThumb } from '../lib/media';

export function ProductCard({ product }: { product: StorefrontProduct }) {
  const image = product.images?.[0]?.url;
  return (
    <Link
      to={`/p/${product.slug}`}
      className="group overflow-hidden border border-line bg-white transition hover:-translate-y-0.5"
      style={{ borderRadius: 'var(--store-radius, 12px)', boxShadow: 'var(--store-shadow, 0 1px 3px rgba(15,23,42,0.08))' }}
    >
      <div className="aspect-square overflow-hidden bg-surface-sunken">
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
      </div>
      <div className="space-y-1 p-3">
        <div className="line-clamp-2 text-sm font-medium text-ink">{product.name}</div>
        <div className="text-sm font-semibold text-[var(--store-primary,#4F46E5)]">
          {formatBdt(product.basePrice)}
        </div>
      </div>
    </Link>
  );
}
