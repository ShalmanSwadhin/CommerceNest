import { useEffect, useState } from 'react';
import { storefrontApi } from './api';

const RESERVED_SUBS = new Set([
  'admin',
  'app',
  'dashboard',
  'api',
  'www',
  'localhost',
]);

function parseSubdomainSlug(): string | null {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') return null;

  // techworld-bd.localhost → techworld-bd (local edge gateway)
  if (host.endsWith('.localhost')) {
    const sub = host.slice(0, -'.localhost'.length);
    if (sub && !RESERVED_SUBS.has(sub)) return sub;
    return null;
  }

  const parts = host.split('.');
  if (parts.length >= 3 && parts[0] && parts[0] !== 'www') {
    return parts[0];
  }
  return null;
}

/** Sync bootstrap slug: env -> subdomain -> empty (unresolved). */
export function getStoreSlug(): string {
  const fromEnv = import.meta.env.VITE_STORE_SLUG?.trim();
  if (fromEnv) return fromEnv;

  const fromSubdomain = parseSubdomainSlug();
  if (fromSubdomain) return fromSubdomain;

  return '';
}

/** @deprecated Use getStoreSlug */
export function resolveStoreSlug(): string {
  return getStoreSlug();
}

/** Async resolution via host API for custom domains. Never invents a fallback tenant. */
export async function getStoreSlugAsync(): Promise<string> {
  const fromEnv = import.meta.env.VITE_STORE_SLUG?.trim();
  if (fromEnv) return fromEnv;

  const fromSubdomain = parseSubdomainSlug();
  if (fromSubdomain) return fromSubdomain;

  if (typeof window !== 'undefined' && window.location.host) {
    try {
      const res = await storefrontApi.resolveByHost(window.location.host);
      if (res.slug) return res.slug;
    } catch {
      /* fall through */
    }
  }

  return '';
}

export function useStoreSlug() {
  const [slug, setSlug] = useState(() => getStoreSlug());
  const [resolving, setResolving] = useState(() => !getStoreSlug());
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fromEnv = import.meta.env.VITE_STORE_SLUG?.trim();
    const fromSubdomain = parseSubdomainSlug();
    if (fromEnv || fromSubdomain) {
      setSlug(fromEnv || fromSubdomain || '');
      setResolving(false);
      setNotFound(false);
      return;
    }

    setResolving(true);
    void getStoreSlugAsync()
      .then((resolved) => {
        if (cancelled) return;
        setSlug(resolved);
        setNotFound(!resolved);
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { slug, resolving, notFound };
}
