import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { ChevronRight, Heart, Package, RotateCcw, ShieldCheck, ShoppingCart, Truck, Zap } from 'lucide-react';
import { storefrontApi, type StorefrontProduct, type StorefrontStore } from '../../lib/api';
import { formatBdt } from '../../lib/format';
import { canonicalUrl } from '../../lib/seo';
import { cloudinaryThumb } from '../../lib/media';
import { useCartStore } from '../../stores/cartStore';
import { useWishlistStore } from '../../stores/wishlistStore';
import { useAuthStore } from '../../stores/authStore';
import { ErrorState, PageSkeleton } from '../../components/QueryState';
import { ProductReviews } from '../../components/ProductReviews';
import { ModernBadge } from './Badge';
import { ModernRating } from './Rating';
import { ModernProductCard } from './ModernProductCard';

type OutletCtx = { slug: string; store?: StorefrontStore };

function distinctValues(product: StorefrontProduct, key: 'color' | 'size'): string[] {
  const values = (product.variants || []).map((v) => v[key]).filter((v): v is string => !!v);
  return Array.from(new Set(values));
}

function findVariant(product: StorefrontProduct, color: string | null, size: string | null) {
  const variants = product.variants || [];
  const bothMatch = variants.find((v) => (!color || v.color === color) && (!size || v.size === size));
  if (bothMatch) return bothMatch;
  const colorMatch = color ? variants.find((v) => v.color === color) : undefined;
  if (colorMatch) return colorMatch;
  const sizeMatch = size ? variants.find((v) => v.size === size) : undefined;
  return sizeMatch || variants[0];
}

type Tab = 'description' | 'shipping' | 'reviews';

export function ModernProductPage() {
  const { productSlug = '' } = useParams();
  const { slug } = useOutletContext<OutletCtx>();
  const { customer } = useAuthStore();
  const navigate = useNavigate();
  const addItem = useCartStore((s) => s.addItem);
  const addWish = useWishlistStore((s) => s.add);
  const removeWish = useWishlistStore((s) => s.remove);

  const [activeImage, setActiveImage] = useState(0);
  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<Tab>('description');

  const q = useQuery({
    queryKey: ['storefront', slug, 'product', productSlug],
    queryFn: () => storefrontApi.product(slug, productSlug),
    enabled: !!productSlug,
  });
  const product = q.data;

  useEffect(() => {
    setActiveImage(0);
    setColor(null);
    setSize(null);
    setQty(1);
    setTab('description');
  }, [productSlug]);

  const relatedQ = useQuery({
    queryKey: ['storefront', slug, 'related', product?.category?.slug, product?.id],
    queryFn: () => storefrontApi.categoryProducts(slug, product!.category!.slug!, { limit: 5 }),
    enabled: !!product?.category?.slug,
  });
  const related: StorefrontProduct[] = (() => {
    const data = relatedQ.data as unknown;
    const list = Array.isArray(data) ? (data as StorefrontProduct[]) : ((data as { items?: StorefrontProduct[] })?.items || []);
    return list.filter((p) => p.id !== product?.id).slice(0, 4);
  })();

  // Called unconditionally (before the loading/error early returns below) —
  // React hooks must run in the same order every render regardless of
  // query state, so this reads product?.id rather than being skipped.
  const isWishlisted = useWishlistStore((s) => s.productIds.has(product?.id ?? ''));

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !product) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <ErrorState message={q.error instanceof Error ? q.error.message : 'Product not found'} onRetry={() => void q.refetch()} />
      </div>
    );
  }

  const colors = distinctValues(product, 'color');
  const sizes = distinctValues(product, 'size');
  const selected = findVariant(product, color, size);
  const inStock = (product.variants || []).some((v) => v.stock > 0);
  const lowStockVariant = selected && selected.stock > 0 && selected.stock <= 5 ? selected : null;
  const price = selected?.priceOverride ?? Number(product.basePrice);
  const compareAtPrice = product.compareAtPrice != null ? Number(product.compareAtPrice) : null;
  const hasDiscount = !selected?.priceOverride && compareAtPrice !== null && compareAtPrice > price;
  const discountPct = hasDiscount ? Math.round((1 - price / compareAtPrice!) * 100) : 0;
  const images = product.images || [];
  const badge = !inStock ? (
    <ModernBadge label="Out of Stock" variant="outofstock" size="md" />
  ) : lowStockVariant ? (
    <ModernBadge label="Low Stock" variant="lowstock" size="md" />
  ) : hasDiscount ? (
    <ModernBadge label="Sale" variant="sale" size="md" />
  ) : null;

  const add = () => {
    if (!selected || selected.stock <= 0) return;
    addItem(
      {
        productId: product.id,
        variantId: selected.id,
        name: product.name,
        slug: product.slug,
        imageUrl: images[0]?.url,
        unitPrice: selected.priceOverride ?? Number(product.basePrice),
        size: selected.size,
        color: selected.color,
      },
      qty,
    );
  };

  const toggleWishlist = () => {
    if (!customer) {
      navigate('/login');
      return;
    }
    if (isWishlisted) {
      removeWish(product.id);
      void storefrontApi.removeFromWishlist(slug, product.id).catch(() => addWish(product.id));
    } else {
      addWish(product.id);
      void storefrontApi.addToWishlist(slug, product.id).catch(() => removeWish(product.id));
    }
  };

  const description = product.seoDescription || product.description || product.name;
  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description,
    ...(images[0]?.url ? { image: [images[0].url] } : {}),
    offers: {
      '@type': 'Offer',
      url: canonicalUrl(),
      price: String(price),
      priceCurrency: 'BDT',
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'description', label: 'Description' },
    { key: 'shipping', label: 'Shipping & Returns' },
    { key: 'reviews', label: `Reviews${product.reviewCount ? ` (${product.reviewCount})` : ''}` },
  ];

  return (
    <div>
      <Helmet>
        <title>{product.seoTitle || product.name}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl()} />
        <meta property="og:title" content={product.seoTitle || product.name} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="product" />
        <meta property="og:url" content={canonicalUrl()} />
        {images[0]?.url ? <meta property="og:image" content={images[0].url} /> : null}
        <script type="application/ld+json">{JSON.stringify(productLd).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <div className="border-b" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
        <div className="max-w-[1440px] mx-auto px-6 lg:px-10 py-3 flex items-center gap-2 text-xs flex-wrap" style={{ color: 'var(--store-muted,#9CA3AF)' }}>
          <Link to="/">Home</Link>
          <ChevronRight size={11} />
          <Link to="/c/all">Shop</Link>
          {product.category ? (
            <>
              <ChevronRight size={11} />
              <Link to={`/c/${product.category.slug}`}>{product.category.name}</Link>
            </>
          ) : null}
          <ChevronRight size={11} />
          <span className="line-clamp-1">{product.name}</span>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-6 lg:px-10 py-6 lg:py-10 grid lg:grid-cols-[1.1fr_1fr] gap-6 lg:gap-12 xl:gap-16">
        <div className="flex flex-col-reverse sm:flex-row gap-4">
          {images.length > 1 ? (
            <div className="flex sm:flex-col gap-2 overflow-x-auto sm:overflow-y-auto sm:max-h-[600px] scroll-hide">
              {images.map((img, i) => (
                <button
                  key={img.url + i}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={`shrink-0 w-16 h-20 sm:w-20 sm:h-24 rounded-sm overflow-hidden border-2 transition-colors ${
                    i === activeImage ? 'border-[var(--store-primary,#111111)]' : 'border-transparent'
                  }`}
                >
                  <img src={cloudinaryThumb(img.url, 160)} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
          <div
            className="flex-1 rounded-sm overflow-hidden relative group aspect-[4/5]"
            style={{ background: 'var(--store-surface,#F9FAFB)' }}
          >
            {images[activeImage]?.url ? (
              <img
                src={cloudinaryThumb(images[activeImage].url, 960)}
                alt={product.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            ) : null}
            {badge ? <div className="absolute top-3 left-3">{badge}</div> : null}
          </div>
        </div>

        <div>
          {product.category ? (
            <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--store-muted,#9CA3AF)' }}>
              {product.category.name}
            </div>
          ) : null}
          <h1 className="text-2xl sm:text-3xl lg:text-4xl mb-2" style={{ fontFamily: 'var(--store-heading-font)', color: 'var(--store-text,#111111)' }}>
            {product.name}
          </h1>
          <ModernRating value={product.ratingAverage != null ? Number(product.ratingAverage) : null} count={product.reviewCount} size="md" />

          <div className="border-b pb-4 mb-4 mt-3 flex items-baseline gap-3" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
            <span className="text-3xl font-bold" style={{ color: 'var(--store-text,#111111)' }}>{formatBdt(price)}</span>
            {hasDiscount ? (
              <>
                <span className="text-base line-through" style={{ color: 'var(--store-muted,#9CA3AF)' }}>{formatBdt(compareAtPrice!)}</span>
                <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-sm">Save {discountPct}%</span>
              </>
            ) : null}
          </div>

          {product.description ? (
            <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--store-muted,#4B5563)' }}>
              {product.description}
            </p>
          ) : null}

          {colors.length > 0 ? (
            <div className="mb-5">
              <div className="text-sm font-medium mb-2" style={{ color: 'var(--store-text,#111111)' }}>
                Color{color ? `: ${color}` : ''}
              </div>
              <div className="flex flex-wrap gap-2">
                {colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${
                      color === c ? 'border-[var(--store-primary,#111111)] scale-110' : ''
                    }`}
                    style={{ background: c, borderColor: color === c ? undefined : 'var(--store-border,#E5E7EB)' }}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {sizes.length > 0 ? (
            <div className="mb-5">
              <div className="text-sm font-medium mb-2" style={{ color: 'var(--store-text,#111111)' }}>
                Size{size ? `: ${size}` : ''}
              </div>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSize(s)}
                    className="w-10 h-10 border text-sm font-medium rounded-sm"
                    style={
                      size === s
                        ? { background: 'var(--store-primary,#111111)', color: 'white', borderColor: 'var(--store-primary,#111111)' }
                        : { borderColor: 'var(--store-border,#E5E7EB)', color: 'var(--store-muted,#4B5563)' }
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="flex items-center border rounded-sm h-12 w-32" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
              <button type="button" className="flex-1 h-full" onClick={() => setQty((v) => Math.max(1, v - 1))}>−</button>
              <span className="w-10 text-center text-sm font-medium">{qty}</span>
              <button type="button" className="flex-1 h-full" onClick={() => setQty((v) => Math.min(99, v + 1))}>+</button>
            </div>
            <button
              type="button"
              onClick={add}
              disabled={!selected || selected.stock <= 0}
              className="flex-1 h-12 inline-flex items-center justify-center gap-2 bg-[var(--store-primary,#111111)] text-white text-sm font-semibold rounded-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ShoppingCart size={15} />
              {selected && selected.stock > 0 ? 'Add to Cart' : 'Out of Stock'}
            </button>
            <button
              type="button"
              disabled={!selected || selected.stock <= 0}
              onClick={() => {
                add();
                navigate('/checkout');
              }}
              className="flex-1 h-12 inline-flex items-center justify-center gap-2 border text-sm font-semibold rounded-sm hover:bg-[var(--store-primary,#111111)] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: 'var(--store-primary,#111111)', color: 'var(--store-text,#111111)' }}
            >
              <Zap size={15} />
              Buy Now
            </button>
          </div>

          <button type="button" onClick={toggleWishlist} className="flex items-center gap-2 text-sm mb-5" style={{ color: 'var(--store-muted,#4B5563)' }}>
            <Heart size={15} className={isWishlisted ? 'fill-red-500 text-red-500' : ''} />
            {isWishlisted ? 'Saved to wishlist' : 'Add to wishlist'}
          </button>

          {lowStockVariant ? (
            <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-sm mb-5">
              <Package size={14} className="text-orange-600" />
              <span className="text-sm text-orange-800">Only {lowStockVariant.stock} left in stock — order soon</span>
            </div>
          ) : null}

          <div className="pt-5 border-t space-y-3" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
            {[
              [Truck, 'Nationwide delivery across Bangladesh'],
              [RotateCcw, '7-day easy returns'],
              [ShieldCheck, 'Secure checkout — bKash & Cash on Delivery'],
            ].map(([Icon, text], i) => {
              const IconComp = Icon as typeof Truck;
              return (
                <div key={i} className="flex items-center gap-3 text-xs" style={{ color: 'var(--store-muted,#4B5563)' }}>
                  <IconComp size={14} style={{ color: 'var(--store-muted,#9CA3AF)' }} />
                  {text as string}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
        <div className="mt-6 border-b" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
          <div className="flex gap-8 overflow-x-auto scroll-hide">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                type="button"
                onClick={() => setTab(tb.key)}
                className="pb-3 text-sm border-b-2 whitespace-nowrap"
                style={
                  tab === tb.key
                    ? { borderColor: 'var(--store-primary,#111111)', color: 'var(--store-text,#111111)' }
                    : { borderColor: 'transparent', color: 'var(--store-muted,#4B5563)' }
                }
              >
                {tb.label}
              </button>
            ))}
          </div>
        </div>
        <div className="py-8 max-w-3xl">
          {tab === 'description' ? (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--store-muted,#4B5563)' }}>
              {product.description || 'No description available for this product yet.'}
            </p>
          ) : null}
          {tab === 'shipping' ? (
            <div className="space-y-5">
              {[
                ['Standard Delivery', 'Delivered nationwide across Bangladesh, typically within 3-5 business days.'],
                ['Cash on Delivery', 'Pay when your order arrives — no advance payment required.'],
                ['Returns', "Not satisfied? Request a return within 7 days of delivery from your account's order history."],
              ].map(([title, desc]) => (
                <div key={title}>
                  <div className="text-sm font-semibold mb-1" style={{ color: 'var(--store-text,#111111)' }}>{title}</div>
                  <div className="text-sm" style={{ color: 'var(--store-muted,#4B5563)' }}>{desc}</div>
                </div>
              ))}
            </div>
          ) : null}
          {tab === 'reviews' ? (
            <ProductReviews
              productSlug={product.slug}
              ratingAverage={product.ratingAverage != null ? Number(product.ratingAverage) : null}
              reviewCount={product.reviewCount || 0}
            />
          ) : null}
        </div>

        {related.length > 0 ? (
          <div className="mt-4 pt-10 border-t pb-16" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
            <h2 className="text-2xl mb-6" style={{ fontFamily: 'var(--store-heading-font)', color: 'var(--store-text,#111111)' }}>
              You may also like
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
              {related.map((p) => (
                <ModernProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div
        className="fixed bottom-16 left-0 right-0 bg-white border-t px-4 py-3 z-20 lg:hidden flex items-center justify-between gap-3"
        style={{ borderColor: 'var(--store-border,#E5E7EB)' }}
      >
        <div className="min-w-0">
          <div className="text-xs truncate" style={{ color: 'var(--store-muted,#9CA3AF)' }}>{product.name}</div>
          <div className="text-sm font-bold" style={{ color: 'var(--store-text,#111111)' }}>{formatBdt(price)}</div>
        </div>
        <button
          type="button"
          onClick={add}
          disabled={!selected || selected.stock <= 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--store-primary,#111111)] text-white text-sm font-semibold rounded-sm disabled:opacity-40"
        >
          <ShoppingCart size={14} />
          Add to Cart
        </button>
      </div>
    </div>
  );
}
