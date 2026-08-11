import { Link } from 'react-router-dom';
import type { StorefrontProduct } from '../lib/api';
import { formatBdt } from '../lib/format';

export function ProductCard({ product }: { product: StorefrontProduct }) {
  const image = product.images?.[0]?.url;
  return (
    <Link
      to={`/p/${product.slug}`}
      className="group overflow-hidden rounded-cn-lg border border-line bg-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="aspect-square overflow-hidden bg-surface-sunken">
        {image ? (
          <img
            src={image}
            alt={product.name}
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
