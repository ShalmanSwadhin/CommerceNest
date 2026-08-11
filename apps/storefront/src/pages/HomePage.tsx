import { Link, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import {
  normalizeThemeDocument,
  type ThemeSection,
} from '@commercenest/types/schemas/theme';
import { Button } from '@commercenest/ui';
import {
  extractThemeSettings,
  storefrontApi,
  type StorefrontProduct,
  type StorefrontStore,
  type ThemeSettings,
} from '../lib/api';
import { canonicalUrl } from '../lib/seo';
import { t } from '../i18n/dictionary';
import { useLocaleStore } from '../stores/localeStore';
import { ProductCard } from '../components/ProductCard';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';
import { CtaLink } from '../lib/ctaLink';

function ProductGrid({
  products,
  columns,
  emptyTitle,
}: {
  products: StorefrontProduct[];
  columns: number;
  emptyTitle: string;
}) {
  if (products.length === 0) {
    return (
      <SoftEmpty
        title={emptyTitle}
        description="Publish products from the store dashboard to populate this section."
      />
    );
  }
  const colClass =
    columns >= 4
      ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
      : columns === 3
        ? 'grid-cols-2 md:grid-cols-3'
        : 'grid-cols-2';
  return (
    <div className={`grid gap-4 ${colClass}`}>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

function renderSection(
  section: ThemeSection,
  ctx: {
    store: StorefrontStore;
    featured: StorefrontProduct[];
    categories: { id: string; name: string; slug: string }[];
    primary: string;
    locale: 'en' | 'bn';
  },
) {
  if (!section.visible) return null;
  const s = section.settings;

  if (section.type === 'hero') {
    const imageUrl = String(s.imageUrl || '');
    const overlay = Number(s.overlay ?? 45) / 100;
    const layout = String(s.layout || 'content-left');
    const minH =
      s.height === 'sm' ? 'min-h-[48vh]' : s.height === 'md' ? 'min-h-[60vh]' : 'min-h-[70vh]';
    return (
      <section
        key={section.id}
        className={`relative bg-cover bg-center text-white ${minH}`}
        style={{
          backgroundImage: imageUrl
            ? `linear-gradient(rgba(15,23,42,${overlay}), rgba(15,23,42,${overlay + 0.05})), url(${imageUrl})`
            : `linear-gradient(135deg, ${ctx.primary}, #0f172a)`,
        }}
      >
        <div
          className={`mx-auto flex ${minH} max-w-6xl flex-col justify-end px-4 pb-16 pt-24 ${
            layout === 'centered' ? 'items-center text-center' : ''
          }`}
        >
          {s.badge ? (
            <span className="mb-3 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              {String(s.badge)}
            </span>
          ) : null}
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">
            {String(s.title || ctx.store.name)}
          </h1>
          <p className="mt-3 max-w-xl text-base text-white/90 md:text-lg">
            {String(
              s.subtitle ||
                ctx.store.tagline ||
                'Shop the latest collection',
            )}
          </p>
          <div
            className={`mt-6 flex flex-wrap gap-3 ${
              layout === 'centered' ? 'justify-center' : ''
            }`}
          >
            <CtaLink href={String(s.primaryCtaHref || '/c/all')}>
              <Button size="lg" className="bg-white text-ink hover:bg-slate-100">
                {String(s.primaryCtaLabel || t(ctx.locale, 'shop'))}
              </Button>
            </CtaLink>
            {s.secondaryCtaLabel ? (
              <CtaLink href={String(s.secondaryCtaHref || '/c/all')}>
                <Button size="lg" variant="secondary" className="border-white/40 bg-transparent text-white hover:bg-white/10">
                  {String(s.secondaryCtaLabel)}
                </Button>
              </CtaLink>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  if (section.type === 'featured-categories') {
    const limit = Number(s.limit || 6);
    const cats = ctx.categories.slice(0, limit);
    return (
      <section key={section.id} className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">
          {String(s.title || 'Shop by Category')}
        </h2>
        {s.subtitle ? (
          <p className="mt-1 text-sm text-ink-secondary">{String(s.subtitle)}</p>
        ) : null}
        {cats.length === 0 ? (
          <SoftEmpty
            title="No categories yet"
            description="Add categories from the store dashboard."
          />
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            {cats.map((c) => (
              <Link
                key={c.id}
                to={`/c/${c.slug}`}
                className="rounded-2xl border border-line bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div
                  className="mx-auto mb-2 h-12 w-12 rounded-full"
                  style={{ background: `${ctx.primary}22` }}
                />
                <p className="text-sm font-semibold text-ink">{c.name}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    );
  }

  if (section.type === 'featured-products' || section.type === 'best-sellers') {
    const limit = Number(s.limit || 8);
    const products = ctx.featured.slice(0, limit);
    return (
      <section key={section.id} className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">
              {String(s.title || 'Featured Products')}
            </h2>
            {s.subtitle ? (
              <p className="mt-1 text-sm text-ink-secondary">{String(s.subtitle)}</p>
            ) : null}
          </div>
          {s.showViewAll !== false ? (
            <Link
              to="/c/all"
              className="text-sm font-medium text-[var(--store-primary)]"
            >
              {t(ctx.locale, 'shop')}
            </Link>
          ) : null}
        </div>
        <ProductGrid
          products={products}
          columns={Number(s.columns || 4)}
          emptyTitle="No products yet"
        />
      </section>
    );
  }

  if (section.type === 'promo-banner') {
    const imageUrl = String(s.imageUrl || '');
    return (
      <section key={section.id} className="mx-auto max-w-6xl px-4 py-6">
        <div
          className="overflow-hidden rounded-3xl px-6 py-12 text-white md:px-10"
          style={{
            background: imageUrl
              ? `linear-gradient(rgba(15,23,42,.45), rgba(15,23,42,.5)), url(${imageUrl}) center/cover`
              : `linear-gradient(135deg, ${ctx.primary}, #0f172a)`,
          }}
        >
          <h2 className="text-2xl font-bold md:text-3xl">
            {String(s.heading || 'Special offer')}
          </h2>
          <p className="mt-2 max-w-xl text-white/90">
            {String(s.description || '')}
          </p>
          <CtaLink href={String(s.ctaHref || '/c/all')} className="mt-5 inline-block">
            <Button className="bg-white text-ink hover:bg-slate-100">
              {String(s.ctaLabel || 'Shop now')}
            </Button>
          </CtaLink>
        </div>
      </section>
    );
  }

  if (section.type === 'why-choose-us') {
    const items = Array.isArray(s.items) ? s.items : [];
    return (
      <section key={section.id} className="bg-white py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            {String(s.title || 'Why choose us')}
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item, i) => {
              const row = item as { title?: string; description?: string };
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-line bg-[#f7f8fb] p-5"
                >
                  <p className="font-semibold text-ink">{row.title}</p>
                  <p className="mt-1 text-sm text-ink-secondary">{row.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  if (section.type === 'testimonials') {
    const items = Array.isArray(s.items) ? s.items : [];
    return (
      <section key={section.id} className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">
          {String(s.title || 'What customers say')}
        </h2>
        {s.caption ? (
          <p className="mt-1 text-xs text-ink-tertiary">{String(s.caption)}</p>
        ) : null}
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {items.map((item, i) => {
            const row = item as {
              quote?: string;
              name?: string;
              business?: string;
              rating?: number;
            };
            return (
              <figure
                key={i}
                className="rounded-2xl border border-line bg-white p-5 shadow-sm"
              >
                <blockquote className="text-sm text-ink-secondary">
                  “{row.quote}”
                </blockquote>
                <figcaption className="mt-4 text-sm font-semibold text-ink">
                  {row.name}
                  {row.business ? (
                    <span className="block text-xs font-normal text-ink-tertiary">
                      {row.business}
                    </span>
                  ) : null}
                </figcaption>
              </figure>
            );
          })}
        </div>
      </section>
    );
  }

  if (section.type === 'newsletter') {
    return (
      <section key={section.id} className="mx-auto max-w-6xl px-4 py-8">
        <div
          className="rounded-3xl px-6 py-10 text-white md:px-10"
          style={{ background: ctx.primary }}
        >
          <h2 className="text-2xl font-bold">{String(s.title || 'Stay in the loop')}</h2>
          <p className="mt-2 max-w-xl text-white/90">
            {String(s.subtitle || '')}
          </p>
          <form
            className="mt-5 flex max-w-md flex-col gap-2 sm:flex-row"
            onSubmit={(e) => e.preventDefault()}
          >
            <input
              type="email"
              required
              placeholder="you@email.com"
              className="h-11 flex-1 rounded-xl border-0 px-3 text-sm text-ink"
            />
            <Button type="submit" className="bg-white text-ink hover:bg-slate-100">
              {String(s.buttonText || 'Subscribe')}
            </Button>
          </form>
          <p className="mt-2 text-xs text-white/70">
            Newsletter capture UI — subscription delivery connects when email is configured.
          </p>
        </div>
      </section>
    );
  }

  return null;
}

export function HomePage() {
  const { slug, theme } = useOutletContext<{
    slug: string;
    store?: StorefrontStore;
    theme?: ThemeSettings;
  }>();
  const locale = useLocaleStore((s) => s.locale);

  const q = useQuery({
    queryKey: ['storefront', slug, 'home'],
    queryFn: () => storefrontApi.home(slug),
  });

  const catsQ = useQuery({
    queryKey: ['storefront', slug, 'categories'],
    queryFn: () => storefrontApi.categories(slug),
    enabled: !!slug,
  });

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <ErrorState
          message={q.error instanceof Error ? q.error.message : undefined}
          onRetry={() => void q.refetch()}
        />
      </div>
    );
  }

  const data = q.data!;
  const themeConfig = {
    ...theme,
    ...extractThemeSettings(data.theme),
  };
  const doc = normalizeThemeDocument({
    layout: data.theme?.layout,
    themeSettings: themeConfig,
  });
  const featured = data.featuredProducts || [];
  const primary = doc.themeSettings.colors.primary || themeConfig.primaryColor || '#6C1DB3';
  const categories = unwrapCategories(catsQ.data);
  const description =
    data.store.tagline || `Shop ${data.store.name} online with delivery across Bangladesh.`;
  const ogImage =
    doc.themeSettings.heroImageUrl ||
    doc.themeSettings.branding.logoUrl ||
    featured[0]?.images?.[0]?.url ||
    '';

  return (
    <div>
      <Helmet>
        <title>{data.store.name}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl()} />
        <meta property="og:title" content={data.store.name} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl()} />
        {ogImage ? <meta property="og:image" content={ogImage} /> : null}
      </Helmet>
      {doc.layout.sections.map((section) =>
        renderSection(section, {
          store: data.store,
          featured,
          categories,
          primary,
          locale,
        }),
      )}
    </div>
  );
}

function unwrapCategories(payload: unknown): { id: string; name: string; slug: string }[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as { id: string; name: string; slug: string }[];
  const obj = payload as { data?: unknown[]; items?: unknown[] };
  return (obj.data || obj.items || []) as { id: string; name: string; slug: string }[];
}
