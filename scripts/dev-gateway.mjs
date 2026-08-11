/**
 * CommerceNest local edge gateway — one public port, real SaaS host routing.
 *
 *   http://admin.localhost:8080              → Master Admin
 *   http://app.localhost:8080                → Store Admin
 *   http://techworld-bd.localhost:8080       → Storefront (tenant subdomain)
 *   http://localhost:8080/api/*              → API
 *   http://localhost:8080                    → platform hub
 *
 * Upstream Vite/API processes still run internally; users only open :GATEWAY_PORT.
 */
import http from 'node:http';
import { URL } from 'node:url';

const GATEWAY_PORT = Number(process.env.GATEWAY_PORT || 8080);
const API = process.env.CN_UPSTREAM_API || 'http://127.0.0.1:4000';
const ADMIN = process.env.CN_UPSTREAM_ADMIN || 'http://127.0.0.1:5173';
const DASHBOARD = process.env.CN_UPSTREAM_DASHBOARD || 'http://127.0.0.1:5174';
const STOREFRONT = process.env.CN_UPSTREAM_STOREFRONT || 'http://127.0.0.1:5175';
const MARKETING = process.env.CN_UPSTREAM_MARKETING || 'http://127.0.0.1:5176';

const RESERVED = new Set([
  'admin',
  'app',
  'dashboard',
  'api',
  'www',
  'localhost',
  '127.0.0.1',
]);

function isStorefrontTenantHost(host) {
  if (host === 'admin.localhost' || host.startsWith('admin.')) return false;
  if (
    host === 'app.localhost' ||
    host === 'dashboard.localhost' ||
    host.startsWith('app.') ||
    host.startsWith('dashboard.')
  ) {
    return false;
  }
  if (host.endsWith('.localhost')) {
    const sub = host.slice(0, -'.localhost'.length);
    return Boolean(sub) && sub !== 'www' && !RESERVED.has(sub);
  }
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === 'commercenest.local' ||
    host === 'www.commercenest.local' ||
    host === 'commercenest.com' ||
    host === 'www.commercenest.com'
  ) {
    return false;
  }
  return true;
}

function pickUpstream(hostname, pathname) {
  const host = hostname.toLowerCase().split(':')[0];

  // Per-tenant SEO files — served by the API, not the storefront SPA.
  if (
    (pathname === '/sitemap.xml' || pathname === '/robots.txt') &&
    isStorefrontTenantHost(host)
  ) {
    const rewritePath =
      pathname === '/sitemap.xml'
        ? '/api/storefront/_seo/sitemap.xml'
        : '/api/storefront/_seo/robots.txt';
    return { target: API, label: 'api', rewritePath };
  }

  // API always via /api on any host
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return { target: API, label: 'api' };
  }

  if (host === 'admin.localhost' || host.startsWith('admin.')) {
    return { target: ADMIN, label: 'admin' };
  }
  if (
    host === 'app.localhost' ||
    host === 'dashboard.localhost' ||
    host.startsWith('app.') ||
    host.startsWith('dashboard.')
  ) {
    return { target: DASHBOARD, label: 'dashboard' };
  }

  // tenant.localhost → storefront (exclude reserved platform subs)
  if (host.endsWith('.localhost')) {
    const sub = host.slice(0, -'.localhost'.length);
    if (sub === 'www') {
      return { target: MARKETING, label: 'marketing' };
    }
    if (sub && !RESERVED.has(sub)) {
      return { target: STOREFRONT, label: 'storefront' };
    }
  }

  // Platform marketing homepage (bare apex / www)
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === 'commercenest.local' ||
    host === 'www.commercenest.local' ||
    host === 'commercenest.com' ||
    host === 'www.commercenest.com'
  ) {
    return { target: MARKETING, label: 'marketing' };
  }

  // custom / platform domains → storefront (host resolve happens in SPA/API)
  return { target: STOREFRONT, label: 'storefront' };
}

function proxyRequest(
  clientReq,
  clientRes,
  targetBase,
  { preserveHost = false, rewritePath } = {},
) {
  const target = new URL(clientReq.url || '/', targetBase);
  const upstream = new URL(targetBase);
  const headers = { ...clientReq.headers };
  // Vite needs the upstream Host; API should see the public edge host
  // (admin.localhost / tenant.localhost) for cookies, logging, and resolve-host.
  if (!preserveHost) {
    headers.host = upstream.host;
  }

  const proxyReq = http.request(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port,
      path: rewritePath || target.pathname + target.search,
      method: clientReq.method,
      headers,
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(clientRes);
    },
  );

  proxyReq.on('error', (err) => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    }
    clientRes.end(`Bad gateway: ${err.message}`);
  });

  clientReq.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const host = req.headers.host || 'localhost';
  const hostname = host.split(':')[0] || 'localhost';
  const pathname = (req.url || '/').split('?')[0] || '/';
  const route = pickUpstream(hostname, pathname);

  // Convenience redirects still available on the marketing host
  if (route.label === 'marketing') {
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      res.writeHead(302, { Location: `http://admin.localhost:${GATEWAY_PORT}/` });
      res.end();
      return;
    }
    if (pathname === '/app' || pathname.startsWith('/app/')) {
      res.writeHead(302, { Location: `http://app.localhost:${GATEWAY_PORT}/` });
      res.end();
      return;
    }
    if (pathname === '/store' || pathname.startsWith('/store/')) {
      res.writeHead(302, {
        Location: `http://techworld-bd.localhost:${GATEWAY_PORT}/`,
      });
      res.end();
      return;
    }
  }

  proxyRequest(req, res, route.target, {
    preserveHost: route.label === 'api',
    rewritePath: route.rewritePath,
  });
});

// WebSocket upgrade for Vite HMR
server.on('upgrade', (req, socket, head) => {
  const host = req.headers.host || 'localhost';
  const hostname = host.split(':')[0] || 'localhost';
  const pathname = (req.url || '/').split('?')[0] || '/';
  const route = pickUpstream(hostname, pathname);
  if (!route.target) {
    socket.destroy();
    return;
  }

  const upstream = new URL(route.target);
  const proxyReq = http.request({
    protocol: upstream.protocol,
    hostname: upstream.hostname,
    port: upstream.port,
    path: req.url,
    method: 'GET',
    headers: { ...req.headers, host: upstream.host },
  });

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(proxyRes.headers)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join('\r\n') +
        '\r\n\r\n',
    );
    if (proxyHead?.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  proxyReq.on('error', () => socket.destroy());
  proxyReq.end();
});

server.listen(GATEWAY_PORT, '0.0.0.0', () => {
  console.log(`[gateway] CommerceNest edge on http://localhost:${GATEWAY_PORT}`);
  console.log(`[gateway]   Marketing  http://localhost:${GATEWAY_PORT}`);
  console.log(`[gateway]   Master     http://admin.localhost:${GATEWAY_PORT}`);
  console.log(`[gateway]   Store Admin http://app.localhost:${GATEWAY_PORT}`);
  console.log(`[gateway]   Storefront http://techworld-bd.localhost:${GATEWAY_PORT}`);
});
