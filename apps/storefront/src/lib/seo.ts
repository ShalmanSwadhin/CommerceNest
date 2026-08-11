/**
 * Canonical URL for the current page: origin + pathname, deliberately
 * excluding query string and hash so filtered/paginated/search views of the
 * same listing (e.g. `?search=`, `?page=`) all canonicalize to one URL
 * instead of being treated as distinct documents by crawlers.
 */
export function canonicalUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`;
}
