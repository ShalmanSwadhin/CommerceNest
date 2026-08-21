import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Eye, Heart, ShoppingCart } from 'lucide-react';
import type { StorefrontProduct } from '../../lib/api';
import { storefrontApi } from '../../lib/api';
import { formatBdt } from '../../lib/format';
import { cloudinaryThumb } from '../../lib/media';
import { useCartStore } from '../../stores/cartStore';
import { useWishlistStore } from '../../stores/wishlistStore';
import { useAuthStore } from '../../stores/authStore';
import { ModernBadge } from './Badge';
import { ModernRating } from './Rating';

function distinctColors(product: StorefrontProduct): string[] {
  const colors = (product.variants || []).map((v) => v.color).filter((c): c is string => !!c);
  return Array.from(new Set(colors));
}

function useWishlistToggle(slug: string, productId: string) {
  const { customer } = useAuthStore();
  const wishlisted = useWishlistStore((s) => s.productIds.has(productId));
  const add = useWishlistStore((s) => s.add);
  const remove = useWishlistStore((s) => s.remove);
  const navigate = useNavigate();

  return (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!customer) {
      navigate('/login');
      return;
    }
    if (wishlisted) {
      remove(productId);
      void storefrontApi.removeFromWishlist(slug, productId).catch(() => add(productId));
    } else {
      add(productId);
      void storefrontApi.addToWishlist(slug, productId).catch(() => remove(productId));
    }
  };
}

function pickDefaultVariant(product: StorefrontProduct) {
  return (product.variants || []).find((v) => v.stock > 0) || product.variants?.[0];
}

function priceInfo(product: StorefrontProduct, variant?: { priceOverride?: number | null }) {
  const price = variant?.priceOverride ?? Number(product.basePrice);
  const compareAt = product.compareAtPrice != null ? Number(product.compareAtPrice) : null;
  const hasDiscount = !!compareAt && compareAt > price;
  const discountPct = hasDiscount ? Math.round((1 - price / compareAt!) * 100) : 0;
  return { price, compareAt, hasDiscount, discountPct };
}

export function ModernProductCard({
  product,
  view = 'grid',
}: {
  product: StorefrontProduct;
  view?: 'grid' | 'list';
}) {
  const { slug } = useOutletContext<{ slug: string }>();
  const navigate = useNavigate();
  const addItem = useCartStore((s) => s.addItem);
  const wishlisted = useWishlistStore((s) => s.productIds.has(product.id));
  const toggleWishlist = useWishlistToggle(slug, product.id);

  const inStock = (product.variants || []).some((v) => v.stock > 0);
  const lowStock = inStock && (product.variants || []).some((v) => v.stock > 0 && v.stock <= 5);
  const colors = distinctColors(product);
  const variant = pickDefaultVariant(product);
  const { price, compareAt, hasDiscount, discountPct } = priceInfo(product, variant);
  const image = product.images?.[0]?.url;
  const href = `/p/${product.slug}`;

  const quickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!inStock || !variant) return;
    addItem({
      productId: product.id,
      variantId: variant.id,
      name: product.name,
      slug: product.slug,
      imageUrl: image,
      unitPrice: variant.priceOverride ?? Number(product.basePrice),
      size: variant.size,
      color: variant.color,
    });
  };

  // Badge priority: out-of-stock > low-stock > promo — a promo badge never
  // shows for something that can't actually be bought right now.
  const badge = !inStock ? (
    <ModernBadge label="Out of Stock" variant="outofstock" />
  ) : lowStock ? (
    <ModernBadge label="Low Stock" variant="lowstock" />
  ) : hasDiscount ? (
    <ModernBadge label="Sale" variant="sale" />
  ) : null;

  if (view === 'list') {
    return (
      <Link
        to={href}
        className="flex gap-4 bg-white border rounded-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
        style={{ borderColor: 'var(--store-border,#E5E7EB)' }}
      >
        <div
          className="w-28 h-36 shrink-0 overflow-hidden rounded-sm"
          style={{ background: 'var(--store-surface,#F9FAFB)' }}
        >
          {image ? (
            <img
              src={cloudinaryThumb(image, 320)}
              alt={product.name}
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
            />
          ) : null}
        </div>
        <div className="flex flex-col justify-between flex-1 py-1 min-w-0">
          <div>
            <div className="mb-1.5 flex gap-1.5">{badge}</div>
            <div className="text-sm font-semibold leading-snug mb-1 line-clamp-2" style={{ color: 'var(--store-text,#111111)' }}>
              {product.name}
            </div>
            <ModernRating value={product.ratingAverage != null ? Number(product.ratingAverage) : null} count={product.reviewCount} />
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold" style={{ color: 'var(--store-text,#111111)' }}>{formatBdt(price)}</span>
              {hasDiscount ? (
                <>
                  <span className="text-xs line-through" style={{ color: 'var(--store-muted,#9CA3AF)' }}>{formatBdt(compareAt!)}</span>
                  <span className="text-xs text-red-600">-{discountPct}%</span>
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleWishlist}
                className="p-2 rounded-sm border hover:border-[var(--store-primary,#111111)]"
                style={{ borderColor: 'var(--store-border,#E5E7EB)' }}
                aria-label="Toggle wishlist"
              >
                <Heart size={14} className={wishlisted ? 'fill-red-500 text-red-500' : ''} />
              </button>
              <button
                type="button"
                onClick={quickAdd}
                disabled={!inStock}
                className="flex items-center gap-1.5 px-3 py-2 bg-[var(--store-primary,#111111)] text-white text-xs font-medium rounded-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ShoppingCart size={12} />
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link to={href} className="group relative block cursor-pointer">
      <div
        className="relative overflow-hidden aspect-[4/5] rounded-sm mb-3"
        style={{ background: 'var(--store-surface,#F9FAFB)' }}
      >
        {image ? (
          <img
            src={cloudinaryThumb(image, 480)}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : null}

        {badge ? <div className="absolute top-3 left-3 flex flex-col gap-1.5">{badge}</div> : null}

        <button
          type="button"
          onClick={toggleWishlist}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
          aria-label="Toggle wishlist"
        >
          <Heart size={15} className={wishlisted ? 'fill-red-500 text-red-500' : 'text-gray-600'} />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            navigate(href);
          }}
          className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-white shadow-sm items-center justify-center hidden sm:flex opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="View product"
        >
          <Eye size={13} />
        </button>

        <div className="absolute bottom-0 left-0 right-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
          {inStock ? (
            <button
              type="button"
              onClick={quickAdd}
              className="w-full py-3 bg-[var(--store-primary,#111111)] text-white text-xs font-semibold tracking-widest uppercase flex items-center justify-center gap-2 hover:opacity-90"
            >
              <ShoppingCart size={13} />
              Quick Add
            </button>
          ) : (
            <div className="w-full py-3 bg-gray-200 text-gray-500 text-xs font-semibold tracking-widest uppercase flex items-center justify-center">
              Out of Stock
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {product.category?.name ? (
          <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--store-muted,#9CA3AF)' }}>
            {product.category.name}
          </div>
        ) : null}
        <div
          className="text-sm font-semibold leading-snug line-clamp-2 transition-colors group-hover:text-[var(--store-accent,#4338CA)]"
          style={{ color: 'var(--store-text,#111111)' }}
        >
          {product.name}
        </div>
        <ModernRating value={product.ratingAverage != null ? Number(product.ratingAverage) : null} count={product.reviewCount} size="sm" />
        {colors.length > 0 ? (
          <div className="flex items-center gap-1 pt-0.5">
            {colors.slice(0, 4).map((c) => (
              <span
                key={c}
                title={c}
                className="w-3 h-3 rounded-full border shadow-sm"
                style={{ background: c, borderColor: 'var(--store-border,#E5E7EB)' }}
              />
            ))}
            {colors.length > 4 ? (
              <span className="text-[10px]" style={{ color: 'var(--store-muted,#9CA3AF)' }}>+{colors.length - 4}</span>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-baseline gap-2 pt-0.5">
          <span className="text-sm font-semibold" style={{ color: 'var(--store-text,#111111)' }}>{formatBdt(price)}</span>
          {hasDiscount ? (
            <>
              <span className="text-xs line-through" style={{ color: 'var(--store-muted,#9CA3AF)' }}>{formatBdt(compareAt!)}</span>
              <span className="text-xs text-red-600">-{discountPct}%</span>
            </>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
