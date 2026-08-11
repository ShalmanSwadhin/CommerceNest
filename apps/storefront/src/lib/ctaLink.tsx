import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * Merchant-configured CTA hrefs (Theme Builder hero/promo sections) are
 * free-text and may be internal paths or external URLs. A backslash-led
 * value (e.g. "\\evil.com") can be misread by the browser as protocol-relative
 * once react-router normalizes it — this strips leading backslashes and
 * forces a single leading slash so an internal `to` can never resolve
 * off-origin. External absolute URLs are rendered as plain anchors instead
 * of react-router `Link`, since they're not app routes.
 */
export function sanitizeInternalPath(href: string, fallback = '/c/all'): string {
  const trimmed = href.trim().replace(/^[\\/]+/, '/');
  if (!trimmed || trimmed === '/') return fallback;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}

export function CtaLink({
  href,
  fallback = '/c/all',
  className,
  children,
}: {
  href: string;
  fallback?: string;
  className?: string;
  children: ReactNode;
}) {
  const trimmed = href.trim();
  if (isExternalHref(trimmed)) {
    return (
      <a href={trimmed} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={sanitizeInternalPath(trimmed, fallback)} className={className}>
      {children}
    </Link>
  );
}
