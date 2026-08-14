import { useEffect } from 'react';

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/** Sets per-route title/description/OG/canonical tags. No dependency —
 * this is a single-page marketing site with a handful of routes, so a full
 * Helmet setup would be more machinery than the problem needs. */
export function usePageMeta(opts: { title: string; description: string; path: string }) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = opts.title;
    upsertMeta('name', 'description', opts.description);
    upsertMeta('property', 'og:title', opts.title);
    upsertMeta('property', 'og:description', opts.description);
    upsertMeta('property', 'og:type', 'website');
    upsertMeta('property', 'og:site_name', 'CommerceNest');
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}${opts.path}`;
    upsertMeta('property', 'og:url', url);
    upsertCanonical(url);
    return () => {
      document.title = previousTitle;
    };
  }, [opts.title, opts.description, opts.path]);
}

/** Scrolls to `location.hash` once content has actually painted. Two rAFs
 * (not a timeout) wait for layout to settle without guessing a duration —
 * needed because React Router doesn't scroll to hash fragments on client
 * navigation the way a full page load does. `scroll-margin-top` on the
 * target elements keeps the sticky navbar from covering the heading. */
export function useHashScrollOnMount() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const id = hash.slice(1);
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);
}
