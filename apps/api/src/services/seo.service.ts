import { ProductStatus, StoreStatus } from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { resolveStoreByHost } from './domain.service.js';

const RESERVED_SUBS = new Set([
  'admin',
  'app',
  'dashboard',
  'api',
  'www',
  'localhost',
]);

/**
 * Resolves the tenant store for a public SEO request (sitemap/robots),
 * mirroring the storefront frontend's own host-parsing rules so `*.localhost`
 * dev hosts work without requiring a seeded StoreDomain row, while real
 * hostnames still require a VERIFIED StoreDomain (fail-closed).
 */
async function resolveStoreForHost(host: string) {
  const hostname = host.trim().toLowerCase().split(':')[0] ?? '';
  if (!hostname) throw AppError.notFound('Store not found for host');

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    throw AppError.notFound('Store not found for host');
  }

  if (hostname.endsWith('.localhost')) {
    const sub = hostname.slice(0, -'.localhost'.length);
    if (!sub || RESERVED_SUBS.has(sub)) {
      throw AppError.notFound('Store not found for host');
    }
    const store = await prisma.store.findUnique({ where: { slug: sub } });
    if (!store || store.status === 'ARCHIVED' || store.status === 'SUSPENDED') {
      throw AppError.notFound('Store not found for host');
    }
    return store;
  }

  const resolved = await resolveStoreByHost(hostname);
  const store = await prisma.store.findUnique({ where: { id: resolved.storeId } });
  if (!store) throw AppError.notFound('Store not found for host');
  return store;
}

function xmlEscape(value: string) {
  return value.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      default:
        return '&quot;';
    }
  });
}

export async function getSitemapXml(host: string) {
  const store = await resolveStoreForHost(host);
  const origin = `${host.includes('localhost') ? 'http' : 'https'}://${host}`;

  const urls: { loc: string; lastmod?: Date }[] = [{ loc: `${origin}/` }];

  if (store.status === StoreStatus.ACTIVE) {
    const [categories, products] = await Promise.all([
      prisma.category.findMany({
        where: { storeId: store.id },
        select: { slug: true },
      }),
      prisma.product.findMany({
        where: { storeId: store.id, status: ProductStatus.ACTIVE },
        select: { slug: true, updatedAt: true },
      }),
    ]);
    for (const category of categories) {
      urls.push({ loc: `${origin}/c/${category.slug}` });
    }
    for (const product of products) {
      urls.push({
        loc: `${origin}/p/${product.slug}`,
        lastmod: product.updatedAt,
      });
    }
  }

  const body = urls
    .map((u) => {
      const lastmod = u.lastmod
        ? `<lastmod>${u.lastmod.toISOString().slice(0, 10)}</lastmod>`
        : '';
      return `<url><loc>${xmlEscape(u.loc)}</loc>${lastmod}</url>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

export async function getRobotsTxt(host: string) {
  // Fail open with a conservative default so an unresolved host (e.g. a
  // crawler hitting the bare gateway) still gets a valid robots.txt.
  let origin: string | null = null;
  try {
    await resolveStoreForHost(host);
    origin = `${host.includes('localhost') ? 'http' : 'https'}://${host}`;
  } catch {
    origin = null;
  }

  const lines = [
    'User-agent: *',
    'Disallow: /cart',
    'Disallow: /checkout',
    'Disallow: /account',
    'Disallow: /track',
  ];
  if (origin) {
    lines.push(`Sitemap: ${origin}/sitemap.xml`);
  }
  return lines.join('\n') + '\n';
}
