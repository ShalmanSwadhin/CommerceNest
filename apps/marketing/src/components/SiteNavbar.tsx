import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { NavAnchorLink } from './NavAnchorLink';
import { homeContent } from '@/content/home';
import { adminLoginUrl, appLoginUrl } from '@/lib/urls';

const ANCHOR_SECTION_IDS = homeContent.nav
  .filter((item) => item.href.startsWith('#'))
  .map((item) => item.href.slice(1));

/** Lightweight scroll-spy — only active on the homepage, only tracks the
 * handful of sections the navbar actually links to. */
function useActiveSection(enabled: boolean) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const elements = ANCHOR_SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        // Prefer the entry closest to the top of the viewport.
        const top = visible.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b));
        setActiveId(top.target.id);
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [enabled]);

  return activeId;
}

export function SiteNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const activeSectionId = useActiveSection(isHome);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  function isActive(href: string) {
    if (href.startsWith('/')) return pathname === href;
    return isHome && activeSectionId === href.slice(1);
  }

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors duration-300 ${
        scrolled || mobileOpen
          ? 'glass-nav border-white/10'
          : 'border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <BrandLogo />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {homeContent.nav.map((item) => (
            <NavAnchorLink
              key={item.id}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium no-underline transition ${
                isActive(item.href)
                  ? 'bg-white/10 text-white'
                  : 'text-white/75 hover:bg-white/5 hover:text-white'
              }`}
            >
              {item.label}
            </NavAnchorLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 sm:flex">
          <div className="relative group">
            <a
              href={appLoginUrl()}
              className="inline-flex h-10 items-center rounded-lg border border-white/25 px-4 text-sm font-semibold text-white no-underline transition hover:border-white/50 hover:bg-white/5"
            >
              Log in
            </a>
            <div className="invisible absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-navy-raised opacity-0 shadow-lift transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <a
                href={appLoginUrl()}
                className="block px-3 py-2.5 text-sm text-white/85 no-underline hover:bg-white/5"
              >
                Store Admin
              </a>
              <a
                href={adminLoginUrl()}
                className="block px-3 py-2.5 text-sm text-white/85 no-underline hover:bg-white/5"
              >
                Master Admin
              </a>
            </div>
          </div>
          <Link
            to="/trial"
            className="inline-flex h-10 items-center rounded-lg bg-brand-gradient px-4 text-sm font-semibold text-white no-underline shadow-glow-sm transition hover:brightness-110"
          >
            Get Started Free
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 text-white lg:hidden"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/10 bg-navy-raised lg:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4" aria-label="Mobile">
            {homeContent.nav.map((item) => (
              <NavAnchorLink
                key={item.id}
                href={item.href}
                className={`block rounded-lg px-3 py-3 text-sm font-medium no-underline ${
                  isActive(item.href) ? 'bg-white/10 text-white' : 'text-white hover:bg-white/5'
                }`}
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </NavAnchorLink>
            ))}
            <div className="mt-3 grid gap-2 border-t border-white/10 pt-4">
              <a
                href={appLoginUrl()}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-white/20 text-sm font-semibold text-white no-underline"
                onClick={() => setMobileOpen(false)}
              >
                Store Admin Log in
              </a>
              <a
                href={adminLoginUrl()}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-white/20 text-sm font-semibold text-white no-underline"
                onClick={() => setMobileOpen(false)}
              >
                Master Admin Log in
              </a>
              <Link
                to="/trial"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-gradient text-sm font-semibold text-white no-underline"
                onClick={() => setMobileOpen(false)}
              >
                Get Started Free
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
