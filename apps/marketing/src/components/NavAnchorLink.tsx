import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

type NavAnchorLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
};

/**
 * Renders `/route` hrefs as a normal router Link. Renders `#section` hrefs
 * as a same-page anchor jump when already on `/` (native browser scroll —
 * no JS needed), or as a router Link to `/#section` when on any other route
 * (e.g. /pricing) so the anchor isn't silently a no-op there. HomePage
 * handles scrolling to the hash once it mounts.
 */
export function NavAnchorLink({ href, className, children, onClick }: NavAnchorLinkProps) {
  const { pathname } = useLocation();

  if (href.startsWith('/')) {
    return (
      <Link to={href} className={className} onClick={onClick}>
        {children}
      </Link>
    );
  }

  if (pathname === '/') {
    return (
      <a href={href} className={className} onClick={onClick}>
        {children}
      </a>
    );
  }

  return (
    <Link to={`/${href}`} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
