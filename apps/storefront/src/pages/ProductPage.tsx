import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { Badge, Button } from '@commercenest/ui';
import { storefrontApi, type ThemeSettings } from '../lib/api';
import { formatBdt } from '../lib/format';
import { canonicalUrl } from '../lib/seo';
import { cloudinaryThumb } from '../lib/media';
import { useStoreSlug } from '../lib/storeSlug';
import { t } from '../i18n/dictionary';
import { useCartStore } from '../stores/cartStore';
import { useLocaleStore } from '../stores/localeStore';
import { ErrorState, PageSkeleton } from '../components/QueryState';
import { ProductReviews } from '../components/ProductReviews';
import { ModernProductPage } from '../themes/modern-commerce/ModernProductPage';

export function ProductPage() {
  const { productSlug = '' } = useParams();
  const { slug } = useStoreSlug();
  const { theme } = useOutletContext<{ theme?: ThemeSettings }>() ?? {};
  const locale = useLocaleStore((s) => s.locale);

  // Delegates to the theme-specific product page (gallery thumbs, size/
  // color selectors, tabs, sticky mobile bar) — every other theme keeps
  // this generic page unchanged.
  if (theme?.templateId === 'modern-commerce') {
    return <ModernProductPage />;
  }
  const addItem = useCartStore((s) => s.addItem);
  const navigate = useNavigate();
  const [variantId, setVariantId] = useState<string>('');
  const [activeImage, setActiveImage] = useState(0);

  const q = useQuery({
    queryKey: ['storefront', slug, 'product', productSlug],
    queryFn: () => storefrontApi.product(slug, productSlug),
    enabled: !!productSlug,
  });

  useEffect(() => {
    setActiveImage(0);
  }, [productSlug]);

  const product = q.data;
  const variants = product?.variants || [];
  const selected = useMemo(
    () => variants.find((v) => v.id === variantId) || variants[0],
    [variants, variantId],
  );
  const price = selected?.priceOverride ?? product?.basePrice ?? 0;
  const images = product?.images || [];
  const compareAtPrice =
    product?.compareAtPrice != null ? Number(product.compareAtPrice) : null;
  // Only shown when the variant selected is still at the base price — a
  // priceOverride variant has its own real price, which a product-level
  // "was" price can't honestly describe.
  const hasDiscount =
    !selected?.priceOverride && compareAtPrice !== null && compareAtPrice > Number(price);

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !product) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <ErrorState
          message={q.error instanceof Error ? q.error.message : 'Product not found'}
          onRetry={() => void q.refetch()}
        />
      </div>
    );
  }

  const add = () => {
    if (!selected) return;
    addItem({
      productId: product.id,
      variantId: selected.id,
      name: product.name,
      slug: product.slug,
      imageUrl: product.images?.[0]?.url,
      unitPrice: Number(price),
      size: selected.size,
      color: selected.color,
    });
  };

  const description = product.seoDescription || product.description || product.name;
  const image = product.images?.[0]?.url;
  const inStock = variants.some((v) => v.stock > 0);
  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description,
    ...(image ? { image: [image] } : {}),
    offers: {
      '@type': 'Offer',
      url: canonicalUrl(),
      price: String(price),
      priceCurrency: 'BDT',
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-2">
      <Helmet>
        <title>{product.seoTitle || product.name}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl()} />
        <meta property="og:title" content={product.seoTitle || product.name} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="product" />
        <meta property="og:url" content={canonicalUrl()} />
        {image ? <meta property="og:image" content={image} /> : null}
        <script type="application/ld+json">
          {JSON.stringify(productLd).replace(/</g, '\\u003c')}
        </script>
      </Helmet>
      <div>
        <div className="overflow-hidden rounded-cn-lg bg-white shadow-soft">
          {images[activeImage]?.url ? (
            <img
              src={cloudinaryThumb(images[activeImage].url, 960)}
              alt={product.name}
              className="aspect-square w-full object-cover"
            />
          ) : (
            <div className="flex aspect-square items-center justify-center bg-surface-sunken text-ink-tertiary">
              No image
            </div>
          )}
        </div>
        {images.length > 1 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {images.map((img, i) => (
              <button
                key={img.url + i}
                type="button"
                onClick={() => setActiveImage(i)}
                className={`size-16 shrink-0 overflow-hidden rounded-cn border-2 ${
                  i === activeImage ? 'border-[var(--store-primary)]' : 'border-transparent'
                }`}
              >
                <img
                  src={cloudinaryThumb(img.url, 160)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-[var(--store-primary)]">
              {formatBdt(price)}
            </span>
            {hasDiscount ? (
              <span className="text-base text-ink-tertiary line-through">
                {formatBdt(compareAtPrice!)}
              </span>
            ) : null}
          </div>
        </div>
        {product.description && (
          <p className="text-sm leading-6 text-ink-secondary">{product.description}</p>
        )}
        {variants.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Variants</div>
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariantId(v.id)}
                  className={`rounded-cn border px-3 py-2 text-sm ${
                    (selected?.id || variants[0]?.id) === v.id
                      ? 'border-[var(--store-primary)] bg-[var(--store-primary)]/10'
                      : 'border-line bg-white'
                  }`}
                >
                  {[v.size, v.color, v.sku].filter(Boolean).join(' · ')}
                  <Badge className="ml-2" tone={v.stock > 0 ? 'success' : 'danger'}>
                    {v.stock > 0 ? `${v.stock} left` : 'Out'}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button onClick={add} disabled={!selected || selected.stock <= 0}>
            {t(locale, 'addToCart')}
          </Button>
          <Button
            variant="secondary"
            disabled={!selected || selected.stock <= 0}
            onClick={() => {
              add();
              navigate('/checkout');
            }}
          >
            {t(locale, 'buyNow')}
          </Button>
          <Link to="/cart">
            <Button variant="ghost">{t(locale, 'cart')}</Button>
          </Link>
        </div>
      </div>
      <div className="lg:col-span-2 mt-8 border-t border-line pt-8">
        <h2 className="text-xl font-semibold mb-4">Reviews</h2>
        <ProductReviews
          productSlug={product.slug}
          ratingAverage={product.ratingAverage != null ? Number(product.ratingAverage) : null}
          reviewCount={product.reviewCount || 0}
        />
      </div>
    </div>
  );
}
