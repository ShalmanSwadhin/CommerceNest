import { useMemo, type CSSProperties } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import {
  normalizeThemeDocument,
  resolveDesignSystem,
  resolveSectionBackground,
  type ThemeSection,
} from '@commercenest/types/schemas/theme';
import { Button, SectionBackground } from '@commercenest/ui';
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
import { cloudinaryThumb } from '../lib/media';
import { renderModernSection } from '../themes/modern-commerce/HomeSections';

/**
 * Renders a section's primary CTA per the store's Design System button-style
 * token. These CTAs sit on a photo/gradient background, so the baseline
 * ("solid") look has always been a white pill — outline/ghost keep that same
 * context in mind (light-on-dark) rather than assuming a plain page background.
 */
function primaryCtaClass(buttonStyle: 'solid' | 'outline' | 'ghost'): string {
  if (buttonStyle === 'outline') {
    return 'border-2 border-white bg-transparent text-white hover:bg-white/10';
  }
  if (buttonStyle === 'ghost') {
    return 'border-0 bg-transparent text-white underline-offset-4 hover:underline';
  }
  return 'bg-white text-ink hover:bg-slate-100';
}

/** Design-system radius/shadow tokens as an inline style, for card containers. */
const cardTokenStyle: CSSProperties = {
  borderRadius: 'var(--store-radius, 16px)',
  boxShadow: 'var(--store-shadow, 0 1px 3px rgba(15,23,42,0.08))',
};

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
    bestSelling: StorefrontProduct[];
    categories: { id: string; name: string; slug: string; imageUrl?: string | null }[];
    primary: string;
    locale: 'en' | 'bn';
    buttonStyle: 'solid' | 'outline' | 'ghost';
  },
) {
  if (!section.visible) return null;
  const s = section.settings;

  if (section.type === 'hero') {
    const bg = resolveSectionBackground(s);
    const layout = String(s.layout || 'content-left');
    const minH =
      s.height === 'sm' ? 'min-h-[48vh]' : s.height === 'md' ? 'min-h-[60vh]' : 'min-h-[70vh]';
    return (
      <section key={section.id} className={`relative text-white ${minH}`}>
        <SectionBackground
          type={bg.backgroundType}
          image={bg.image}
          position={bg.position}
          color={ctx.primary}
          gradientFrom={ctx.primary}
          gradientTo="#0f172a"
          overlayType={bg.overlayType}
          overlayColor={bg.overlayColor}
          overlayOpacity={bg.overlayOpacity}
          priority
          className="absolute inset-0"
        />
        <div
          className={`relative mx-auto flex ${minH} max-w-6xl flex-col justify-end px-4 pb-16 pt-24 ${
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
              <Button size="lg" className={primaryCtaClass(ctx.buttonStyle)}>
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
            {cats.map((c) =>
              c.imageUrl ? (
                <Link
                  key={c.id}
                  to={`/c/${c.slug}`}
                  className="group relative aspect-[4/5] overflow-hidden transition hover:-translate-y-0.5"
                  style={cardTokenStyle}
                >
                  <img
                    src={cloudinaryThumb(c.imageUrl, 360)}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />
                  <p className="absolute inset-x-0 bottom-3 text-center text-sm font-semibold text-white">
                    {c.name}
                  </p>
                </Link>
              ) : (
                <Link
                  key={c.id}
                  to={`/c/${c.slug}`}
                  className="border border-line bg-white p-4 text-center transition hover:-translate-y-0.5"
                  style={cardTokenStyle}
                >
                  <div
                    className="mx-auto mb-2 h-12 w-12 rounded-full"
                    style={{ background: `${ctx.primary}22` }}
                  />
                  <p className="text-sm font-semibold text-ink">{c.name}</p>
                </Link>
              ),
            )}
          </div>
        )}
      </section>
    );
  }

  if (section.type === 'featured-products' || section.type === 'best-sellers') {
    const limit = Number(s.limit || 8);
    const source = section.type === 'best-sellers' ? ctx.bestSelling : ctx.featured;
    const products = source.slice(0, limit);
    return (
      <section key={section.id} className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">
              {String(s.title || (section.type === 'best-sellers' ? 'Best Sellers' : 'Featured Products'))}
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
    const bg = resolveSectionBackground(s);
    return (
      <section key={section.id} className="mx-auto max-w-6xl px-4 py-6">
        <div className="relative overflow-hidden text-white" style={cardTokenStyle}>
          <SectionBackground
            type={bg.backgroundType}
            image={bg.image}
            position={bg.position}
            color={ctx.primary}
            gradientFrom={ctx.primary}
            gradientTo="#0f172a"
            overlayType={bg.overlayType}
            overlayColor={bg.overlayColor}
            overlayOpacity={bg.overlayOpacity}
            className="absolute inset-0"
          />
          <div className="relative px-6 py-12 md:px-10">
            <h2 className="text-2xl font-bold md:text-3xl">
              {String(s.heading || 'Special offer')}
            </h2>
            <p className="mt-2 max-w-xl text-white/90">
              {String(s.description || '')}
            </p>
            <CtaLink href={String(s.ctaHref || '/c/all')} className="mt-5 inline-block">
              <Button className={primaryCtaClass(ctx.buttonStyle)}>
                {String(s.ctaLabel || 'Shop now')}
              </Button>
            </CtaLink>
          </div>
        </div>
      </section>
    );
  }

  if (section.type === 'why-choose-us') {
    const items = Array.isArray(s.items) ? s.items : [];
    const imageUrl = String(s.imageUrl || '');
    const imageOnLeft = String(s.imagePosition || 'right') === 'left';

    // No image (the default — matches every theme saved before this
    // section supported one): unchanged 4-up card grid.
    if (!imageUrl) {
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
                    className="border border-line bg-[#f7f8fb] p-5"
                    style={cardTokenStyle}
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

    // With an image: an editorial split panel — photo on one side, a
    // vertical checklist on the other.
    const checklist = (
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">
          {String(s.title || 'Why choose us')}
        </h2>
        <ul className="mt-6 space-y-4">
          {items.map((item, i) => {
            const row = item as { title?: string; description?: string };
            return (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-white"
                  style={{ background: ctx.primary }}
                  aria-hidden
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <div>
                  <p className="font-semibold text-ink">{row.title}</p>
                  {row.description ? (
                    <p className="mt-0.5 text-sm text-ink-secondary">{row.description}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
    const photo = (
      <div className="aspect-[4/5] w-full overflow-hidden" style={cardTokenStyle}>
        <img src={cloudinaryThumb(imageUrl, 720)} alt="" loading="lazy" className="h-full w-full object-cover" />
      </div>
    );
    return (
      <section key={section.id} className="bg-white py-12 md:py-16">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-2 md:items-center md:gap-12">
          {imageOnLeft ? (
            <>
              {photo}
              {checklist}
            </>
          ) : (
            <>
              {checklist}
              {photo}
            </>
          )}
        </div>
      </section>
    );
  }

  if (section.type === 'testimonials') {
    const items = Array.isArray(s.items) ? s.items : [];
    const bg = resolveSectionBackground(s);
    // 'none' (the default, matching every theme saved before this section
    // supported backgrounds) renders exactly as before: plain page
    // background, bordered white cards, ink-colored text. Any other choice
    // is a deliberate dark panel — light cards, white text — matching how
    // premium storefronts usually present a testimonial slider.
    const hasBackground = bg.backgroundType !== 'none';
    return (
      <section key={section.id} className="relative overflow-hidden">
        {hasBackground ? (
          <SectionBackground
            type={bg.backgroundType}
            image={bg.image}
            position={bg.position}
            color={ctx.primary}
            gradientFrom={ctx.primary}
            gradientTo="#0f172a"
            overlayType={bg.overlayType}
            overlayColor={bg.overlayColor}
            overlayOpacity={bg.overlayOpacity}
            className="absolute inset-0"
          />
        ) : null}
        <div
          className={`relative mx-auto max-w-6xl px-4 ${
            hasBackground ? 'py-16 text-white' : 'py-12 text-ink'
          }`}
        >
          <h2 className="text-2xl font-semibold tracking-tight">
            {String(s.title || 'What customers say')}
          </h2>
          {s.caption ? (
            <p
              className={`mt-1 text-xs ${hasBackground ? 'text-white/70' : 'text-ink-tertiary'}`}
            >
              {String(s.caption)}
            </p>
          ) : null}
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {items.map((item, i) => {
              const row = item as {
                quote?: string;
                name?: string;
                business?: string;
                rating?: number;
                avatarUrl?: string;
              };
              return (
                <figure
                  key={i}
                  className={hasBackground ? 'bg-white/10 p-5 backdrop-blur-sm' : 'border border-line bg-white p-5'}
                  style={hasBackground ? { borderRadius: 'var(--store-radius, 16px)' } : cardTokenStyle}
                >
                  <blockquote
                    className={`text-sm ${hasBackground ? 'text-white/90' : 'text-ink-secondary'}`}
                  >
                    “{row.quote}”
                  </blockquote>
                  <figcaption className="mt-4 flex items-center gap-3">
                    {row.avatarUrl ? (
                      <img
                        src={cloudinaryThumb(row.avatarUrl, 72)}
                        alt=""
                        loading="lazy"
                        className="h-9 w-9 shrink-0 rounded-full object-cover"
                      />
                    ) : null}
                    <span
                      className={`text-sm font-semibold ${hasBackground ? 'text-white' : 'text-ink'}`}
                    >
                      {row.name}
                      {row.business ? (
                        <span
                          className={`block text-xs font-normal ${
                            hasBackground ? 'text-white/60' : 'text-ink-tertiary'
                          }`}
                        >
                          {row.business}
                        </span>
                      ) : null}
                    </span>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  if (section.type === 'newsletter') {
    return (
      <section key={section.id} className="mx-auto max-w-6xl px-4 py-8">
        <div
          className="px-6 py-10 text-white md:px-10"
          style={{ background: ctx.primary, borderRadius: 'var(--store-radius, 16px)' }}
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
            <Button type="submit" className={primaryCtaClass(ctx.buttonStyle)}>
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

  // Memoized (was recomputed on every render) and keeps templateId sourced
  // from the outlet context's already-normalized value (see StoreShell's
  // outletTheme) instead of letting the raw re-extraction below shadow it —
  // one validated source of truth for the routing decision, not two.
  const doc = useMemo(() => {
    const themeConfig = {
      ...theme,
      ...extractThemeSettings(q.data?.theme),
      templateId: theme?.templateId,
    };
    return normalizeThemeDocument({
      layout: q.data?.theme?.layout,
      themeSettings: themeConfig,
    });
  }, [theme, q.data]);

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
  const featured = data.featuredProducts || [];
  const bestSelling = data.bestSellingProducts || [];
  const primary = doc.themeSettings.colors.primary || theme?.primaryColor || '#6C1DB3';
  const { buttonStyle } = resolveDesignSystem(doc.themeSettings);
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
      {doc.themeSettings.templateId === 'modern-commerce'
        ? doc.layout.sections.map((section) =>
            renderModernSection(section, { store: data.store, featured, bestSelling, categories }),
          )
        : doc.layout.sections.map((section) =>
            renderSection(section, {
              store: data.store,
              featured,
              bestSelling,
              categories,
              primary,
              locale,
              buttonStyle,
            }),
          )}
    </div>
  );
}

type StorefrontCategory = { id: string; name: string; slug: string; imageUrl?: string | null };

function unwrapCategories(payload: unknown): StorefrontCategory[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as StorefrontCategory[];
  const obj = payload as { data?: unknown[]; items?: unknown[] };
  return (obj.data || obj.items || []) as StorefrontCategory[];
}
