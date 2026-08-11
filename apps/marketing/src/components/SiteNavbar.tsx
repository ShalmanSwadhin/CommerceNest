import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { homeContent } from '@/content/home';
import { adminLoginUrl, appLoginUrl } from '@/lib/urls';

export function SiteNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const resourcesId = useId();
  const resourcesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!resourcesOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setResourcesOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (
        resourcesRef.current &&
        !resourcesRef.current.contains(e.target as Node)
      ) {
        setResourcesOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [resourcesOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

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

        <nav
          className="hidden items-center gap-1 lg:flex"
          aria-label="Primary"
        >
          {homeContent.nav.map((item) => {
            if (item.children?.length) {
              return (
                <div key={item.id} className="relative" ref={resourcesRef}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white/75 transition hover:bg-white/5 hover:text-white"
                    aria-expanded={resourcesOpen}
                    aria-controls={resourcesId}
                    onClick={() => setResourcesOpen((v) => !v)}
                  >
                    {item.label}
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition ${resourcesOpen ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                  </button>
                  {resourcesOpen && (
                    <div
                      id={resourcesId}
                      role="menu"
                      className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-white/10 bg-navy-raised p-2 shadow-lift"
                    >
                      {item.children.map((child) => (
                        <a
                          key={child.label}
                          href={child.href}
                          role="menuitem"
                          className="block rounded-lg px-3 py-2.5 no-underline transition hover:bg-white/5"
                          onClick={() => setResourcesOpen(false)}
                        >
                          <span className="block text-sm font-semibold text-white">
                            {child.label}
                          </span>
                          {child.description && (
                            <span className="mt-0.5 block text-xs text-white/50">
                              {child.description}
                            </span>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <a
                key={item.id}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-white/75 no-underline transition hover:bg-white/5 hover:text-white"
              >
                {item.label}
              </a>
            );
          })}
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
          <a
            href="#contact"
            className="inline-flex h-10 items-center rounded-lg bg-brand-gradient px-4 text-sm font-semibold text-white no-underline shadow-glow-sm transition hover:brightness-110"
          >
            Get Started Free
          </a>
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
              <div key={item.id}>
                <a
                  href={item.href}
                  className="block rounded-lg px-3 py-3 text-sm font-medium text-white no-underline hover:bg-white/5"
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </a>
                {item.children?.map((child) => (
                  <a
                    key={child.label}
                    href={child.href}
                    className="block rounded-lg px-6 py-2 text-sm text-white/65 no-underline hover:bg-white/5 hover:text-white"
                    onClick={() => setMobileOpen(false)}
                  >
                    {child.label}
                  </a>
                ))}
              </div>
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
              <a
                href="#contact"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-gradient text-sm font-semibold text-white no-underline"
                onClick={() => setMobileOpen(false)}
              >
                Get Started Free
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
