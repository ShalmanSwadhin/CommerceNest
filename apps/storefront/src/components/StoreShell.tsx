import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { normalizeThemeDocument, resolveDesignSystem } from '@commercenest/types/schemas/theme';
import { Button } from '@commercenest/ui';
import { Clock, Menu, Search, ShoppingBag, User, X } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { extractThemeSettings, storefrontApi } from '../lib/api';
import { CtaLink } from '../lib/ctaLink';
import { useStoreSlug } from '../lib/storeSlug';
import { t } from '../i18n/dictionary';
import { useCartStore } from '../stores/cartStore';
import { useLocaleStore } from '../stores/localeStore';
import { ErrorState } from './QueryState';
import { ModernCommerceShell } from '../themes/modern-commerce/ModernCommerceShell';

export function StoreShell() {
  const { slug, resolving, notFound } = useStoreSlug();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const cartCount = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  const [mobileOpen, setMobileOpen] = useState(false);

  const storeQ = useQuery({
    queryKey: ['storefront', slug, 'resolve'],
    queryFn: () => storefrontApi.resolve(slug),
    enabled: !!slug,
  });

  const homeQ = useQuery({
    queryKey: ['storefront', slug, 'home'],
    queryFn: () => storefrontApi.home(slug),
    enabled: !!slug,
  });

  const store = homeQ.data?.store || storeQ.data;
  const themePayload =
    homeQ.data?.theme ||
    (storeQ.data?.themeSettings
      ? { themeSettings: storeQ.data.themeSettings }
      : storeQ.data?.theme);

  const flatTheme = extractThemeSettings(themePayload);
  const doc = useMemo(() => {
    const layout =
      themePayload &&
      typeof themePayload === 'object' &&
      'layout' in themePayload
        ? (themePayload as { layout?: unknown }).layout
        : undefined;
    return normalizeThemeDocument({
      layout,
      themeSettings: extractThemeSettings(themePayload),
    });
  }, [themePayload]);

  const branding = doc.themeSettings.branding;
  const colors = doc.themeSettings.colors;
  const header = doc.themeSettings.header;
  const footer = doc.themeSettings.footer;
  const typography = doc.themeSettings.typography;
  const primary = colors.primary || '#6C1DB3';
  const fontFamily = `${typography.bodyFont || 'Inter'}, system-ui, sans-serif`;
  const headingFontFamily = `${typography.headingFont || typography.bodyFont || 'Inter'}, system-ui, sans-serif`;
  const headingWeight = typography.headingWeight || 700;
  const bodyWeight = typography.bodyWeight || 400;
  const logoUrl = branding.logoUrl || flatTheme.logoUrl || '';
  const faviconUrl = branding.faviconUrl || flatTheme.faviconUrl || '';
  const announcement = branding.announcement || flatTheme.announcement || '';
  const radius = String(doc.themeSettings.cornerRadius ?? '12');
  const designSystem = resolveDesignSystem(doc.themeSettings);

  useEffect(() => {
    if (!faviconUrl || typeof document === 'undefined') return;
    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = String(faviconUrl);
  }, [faviconUrl]);

  if (resolving) {
    return (
      <div className="mx-auto max-w-lg p-6 text-sm text-ink-secondary">
        Resolving store…
      </div>
    );
  }

  if (notFound || !slug) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorState message="No store is registered for this domain." />
      </div>
    );
  }

  if (storeQ.isError && homeQ.isError) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorState
          message={
            (homeQ.error instanceof Error && homeQ.error.message) ||
            (storeQ.error instanceof Error ? storeQ.error.message : 'Store not found')
          }
          onRetry={() => {
            void storeQ.refetch();
            void homeQ.refetch();
          }}
        />
      </div>
    );
  }

  const trialExpired = Boolean(
    (homeQ.data?.store as { trialExpired?: boolean } | undefined)?.trialExpired ??
      (storeQ.data as { trialExpired?: boolean } | undefined)?.trialExpired,
  );

  if (trialExpired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Clock className="size-6" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">This trial store has ended</h1>
          <p className="mt-2 text-sm text-slate-600">
            {store?.name ? `${store.name}'s` : 'This'} free trial period has expired.
            The store owner can contact CommerceNest to extend the trial or activate a
            paid plan to keep this storefront live.
          </p>
          <a
            href="https://commercenest.com"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#6C1DB3] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Learn about CommerceNest
          </a>
        </div>
      </div>
    );
  }

  const navLinks = [
    { to: '/', label: t(locale, 'home'), end: true },
    { to: '/c/all', label: t(locale, 'shop') },
    { to: '/track', label: t(locale, 'trackOrder') },
    { to: '/account', label: t(locale, 'account') },
  ];

  const headerSticky = header.sticky !== false;
  const headerCentered = header.style === 'centered';
  const headerMinimal = header.style === 'minimal';
  const logoH =
    header.logoSize === 'sm' ? 'h-7' : header.logoSize === 'lg' ? 'h-11' : 'h-8';

  const outletTheme = {
    ...flatTheme,
    // Explicit override, not just the raw spread above: templateId is a
    // routing decision, so every reader (ProductCard/CategoryPage/
    // ProductPage via useOutletContext) must see the SAME validated value
    // StoreShell itself already gated on below — never the unvalidated raw
    // one flatTheme could otherwise carry.
    templateId: doc.themeSettings.templateId,
    primaryColor: primary,
    secondaryColor: colors.secondary,
    fontFamily,
    logoUrl,
    faviconUrl,
    announcement,
    footerText: footer.copyrightText || flatTheme.footerText,
  };

  const cssVarStyle = {
    ['--store-primary' as string]: primary,
    ['--store-secondary' as string]: colors.secondary,
    ['--store-accent' as string]: colors.accent,
    ['--store-bg' as string]: colors.background,
    ['--store-surface' as string]: colors.surface,
    ['--store-text' as string]: colors.text,
    ['--store-muted' as string]: colors.mutedText,
    ['--store-border' as string]: colors.border,
    ['--store-radius' as string]: `${radius}px`,
    ['--store-shadow' as string]: designSystem.shadowCss,
    ['--store-button-style' as string]: designSystem.buttonStyle,
    ['--store-font' as string]: fontFamily,
    ['--store-heading-font' as string]: headingFontFamily,
    ['--store-heading-weight' as string]: headingWeight,
    ['--store-body-weight' as string]: bodyWeight,
    background: colors.background || '#f7f8fb',
    color: colors.text || '#111827',
    fontFamily: 'var(--store-font)',
    fontWeight: 'var(--store-body-weight)',
  };
  const helmet = (
    <Helmet>
      <title>{store?.name ? `${store.name} · CommerceNest` : 'CommerceNest Storefront'}</title>
      {store?.tagline ? <meta name="description" content={store.tagline} /> : null}
      {faviconUrl ? <link rel="icon" href={String(faviconUrl)} /> : null}
    </Helmet>
  );

  // A store's theme document picks the rendering tree, not just tokens —
  // 'default' (the branch below, unchanged) is what every existing store
  // and preset uses; only a store whose published theme explicitly sets
  // templateId: 'modern-commerce' gets the purpose-built component tree in
  // themes/modern-commerce/, so this is zero-risk for every other theme.
  if (doc.themeSettings.templateId === 'modern-commerce') {
    return (
      <div className="min-h-screen" style={cssVarStyle}>
        {helmet}
        <ModernCommerceShell store={store} theme={{ announcement, logoUrl: String(logoUrl || '') }} outletTheme={outletTheme} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={cssVarStyle}>
      <style>{`
        h1, h2, h3 {
          font-family: var(--store-heading-font) !important;
          font-weight: var(--store-heading-weight) !important;
        }
      `}</style>
      {helmet}
      {announcement ? (
        <div className="bg-[var(--store-primary)] px-4 py-2 text-center text-sm text-white">
          {String(announcement)}
        </div>
      ) : null}
      <header
        className={`${headerSticky ? 'sticky top-0 z-20' : ''} ${
          headerMinimal ? '' : 'border-b'
        } bg-white/95 backdrop-blur`}
        style={headerMinimal ? undefined : { borderColor: 'var(--store-border)' }}
      >
        <div
          className={`mx-auto flex max-w-6xl items-center gap-4 px-4 ${
            headerMinimal ? 'py-2.5' : 'py-3'
          } ${headerCentered ? 'flex-col md:flex-row md:justify-between' : 'justify-between'}`}
        >
          <div className="flex w-full items-center gap-2 md:w-auto">
            <button
              type="button"
              className="rounded-md p-2 text-ink-secondary hover:bg-black/5 md:hidden"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-5" />
            </button>
            <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
              {logoUrl ? (
                <img
                  src={String(logoUrl)}
                  alt={store?.name || 'Store'}
                  className={`${logoH} object-contain`}
                />
              ) : (
                <span>{store?.name || 'Store'}</span>
              )}
            </Link>
          </div>
          <nav
            className={`hidden items-center gap-5 text-sm font-medium md:flex ${
              headerCentered ? 'order-first md:order-none' : ''
            }`}
          >
            {navLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive
                    ? 'text-[var(--store-primary)]'
                    : 'text-[var(--store-muted)] hover:text-[var(--store-text)]'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {header.showSearch !== false ? (
              <Link
                to="/c/all"
                className="hidden rounded-md p-2 text-[var(--store-muted)] hover:bg-black/5 sm:inline-flex"
                aria-label="Search"
              >
                <Search className="size-4" />
              </Link>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLocale(locale === 'en' ? 'bn' : 'en')}
            >
              {locale === 'en' ? 'বাংলা' : 'EN'}
            </Button>
            {header.showAccount !== false ? (
              <Link
                to="/account"
                className="hidden rounded-md p-2 text-[var(--store-muted)] hover:bg-black/5 sm:inline-flex"
                aria-label="Account"
              >
                <User className="size-4" />
              </Link>
            ) : null}
            {header.showCart !== false ? (
              <Link to="/cart">
                <Button
                  size="sm"
                  className="bg-[var(--store-primary)] text-white hover:opacity-90"
                  leftIcon={<ShoppingBag className="size-4" />}
                >
                  {t(locale, 'cart')} ({cartCount})
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="font-semibold">{store?.name || 'Menu'}</span>
              <button
                type="button"
                className="rounded-md p-2 text-ink-secondary hover:bg-black/5"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
              >
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-3 text-sm font-medium">
              {navLinks.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className="rounded-md px-3 py-2.5 text-ink-secondary hover:bg-black/5 hover:text-ink"
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}

      <main>
        <Outlet context={{ slug, store, theme: outletTheme }} />
      </main>
      <footer
        className="mt-16 border-t bg-white"
        style={{ borderColor: 'var(--store-border)' }}
      >
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              {logoUrl ? (
                <img src={String(logoUrl)} alt="" className="mb-3 h-8 object-contain" />
              ) : (
                <p className="font-semibold text-[var(--store-text)]">{store?.name}</p>
              )}
              <p className="mt-2 text-sm text-[var(--store-muted)]">
                {footer.description ||
                  branding.tagline ||
                  store?.tagline ||
                  'Shop with confidence.'}
              </p>
            </div>
            {(footer.columns?.length
              ? footer.columns
              : [
                  {
                    title: 'Shop',
                    links: [
                      { label: 'All products', href: '/c/all' },
                      { label: 'Track order', href: '/track' },
                    ],
                  },
                  {
                    title: 'Company',
                    links: [{ label: 'About', href: '/pages/about' }],
                  },
                ]
            ).map((col) => (
              <div key={col.title}>
                <p className="text-sm font-semibold text-[var(--store-text)]">{col.title}</p>
                <ul className="mt-3 space-y-2 text-sm text-[var(--store-muted)]">
                  {col.links.map((link) => (
                    <li key={link.href + link.label}>
                      <CtaLink href={link.href} className="hover:text-[var(--store-text)]">
                        {link.label}
                      </CtaLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-col gap-2 border-t pt-6 text-sm text-[var(--store-muted)] md:flex-row md:items-center md:justify-between"
            style={{ borderColor: 'var(--store-border)' }}
          >
            <div>
              {footer.copyrightText ||
                `© ${new Date().getFullYear()} ${store?.name || 'Store'}`}
            </div>
            <span>Powered by CommerceNest</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
