/**
 * CommerceNest browser smoke test against the single-port gateway.
 * Run while `npm run dev` is up: npm run test:e2e
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const { chromium } = require('playwright');

const PORT = process.env.GATEWAY_PORT || '8080';
const MARKETING = `http://localhost:${PORT}`;
const ADMIN = `http://admin.localhost:${PORT}`;
const DASH = `http://app.localhost:${PORT}`;
const STORE = `http://techworld-bd.localhost:${PORT}`;

const results = { errors: [], visited: [] };

function attachErrorCollectors(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      const loc = msg.location();
      if (
        text.includes('favicon.ico') ||
        (loc?.url && loc.url.endsWith('/favicon.ico'))
      ) {
        return;
      }
      results.errors.push(
        `[${label}] console.error: ${text}${loc?.url ? ` @ ${loc.url}` : ''}`,
      );
    }
  });
  page.on('pageerror', (err) => {
    results.errors.push(`[${label}] pageerror: ${err.message}`);
  });
  page.on('response', (res) => {
    if (res.status() === 404) {
      const url = res.url();
      if (url.endsWith('/favicon.ico')) return;
      results.errors.push(`[${label}] http404: ${url}`);
    }
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (!url.startsWith('data:')) {
      results.errors.push(
        `[${label}] requestfailed: ${url} ${req.failure()?.errorText ?? ''}`,
      );
    }
  });
}

async function visit(page, url, label, opts = {}) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(opts.settle ?? 800);
    results.visited.push(`${label}: OK`);
    return true;
  } catch (err) {
    results.errors.push(`[${label}] navigation failed: ${err.message}`);
    return false;
  }
}

async function main() {
  let browser;
  const launchAttempts = [
    { channel: 'chrome' },
    { channel: 'msedge' },
    { channel: 'chromium' },
    {},
  ];
  for (const opts of launchAttempts) {
    try {
      browser = await chromium.launch({ headless: true, ...opts });
      break;
    } catch {
      // try next
    }
  }
  if (!browser) {
    throw new Error(
      'Could not launch Chrome/Edge/Chromium. Run: npx playwright install chromium',
    );
  }

  // --- Marketing homepage ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    attachErrorCollectors(page, 'marketing');
    await visit(page, `${MARKETING}/`, 'marketing:home');
    await visit(page, `${MARKETING}/#features`, 'marketing:features');
    await visit(page, `${MARKETING}/#contact`, 'marketing:contact');
    await ctx.close();
  }

  // --- Master Admin ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    attachErrorCollectors(page, 'admin');
    await visit(page, `${ADMIN}/login`, 'admin:login');
    try {
      await page.fill('#email', 'admin@commercenest.com');
      await page.fill('#password', 'Admin123!');
      await page.click('button[type="submit"]');
      await page.waitForURL(new RegExp(`admin\\.localhost:${PORT}/?$`), {
        timeout: 15000,
      });
      results.visited.push('admin:login submit: OK');
    } catch (err) {
      results.errors.push(`[admin:login submit] ${err.message}`);
    }
    for (const [path, label] of [
      ['/stores', 'stores'],
      ['/users', 'users'],
      ['/payments', 'payments'],
      ['/themes', 'themes'],
      ['/analytics', 'analytics'],
      ['/licenses', 'subscriptions'],
      ['/support', 'support'],
      ['/announcements', 'announcements'],
      ['/audit-logs', 'logs'],
      ['/settings', 'settings'],
    ]) {
      await visit(page, `${ADMIN}${path}`, `admin:${label}`);
    }
    await ctx.close();
  }

  // --- Store Dashboard ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    attachErrorCollectors(page, 'dashboard');
    await visit(page, `${DASH}/login`, 'dashboard:login');
    try {
      await page.fill('#email', 'owner@techworld.bd');
      await page.fill('#password', 'Owner123!');
      await page.click('button[type="submit"]');
      await page.waitForURL(new RegExp(`app\\.localhost:${PORT}/?$`), {
        timeout: 15000,
      });
      results.visited.push('dashboard:login submit: OK');
    } catch (err) {
      results.errors.push(`[dashboard:login submit] ${err.message}`);
    }
    for (const [path, label] of [
      ['/orders', 'orders'],
      ['/products', 'products'],
      ['/customers', 'customers'],
      ['/payments', 'payments'],
      ['/analytics', 'analytics'],
      ['/cms', 'cms'],
      ['/media', 'media'],
      ['/theme', 'theme'],
      ['/announcements', 'announcements'],
      ['/support', 'support'],
      ['/settings', 'settings'],
    ]) {
      await visit(page, `${DASH}${path}`, `dashboard:${label}`);
    }
    await ctx.close();
  }

  // --- Storefront ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    attachErrorCollectors(page, 'storefront');
    const ok = await visit(page, `${STORE}/`, 'storefront:home');
    if (ok) {
      await visit(page, `${STORE}/c/all`, 'storefront:category');
      try {
        const productLink = page.locator('a[href^="/p/"]').first();
        if (await productLink.count()) {
          await productLink.click();
          await page.waitForTimeout(800);
          results.visited.push('storefront:product: OK');
        }
      } catch (err) {
        results.errors.push(`[storefront:product] ${err.message}`);
      }
      await visit(page, `${STORE}/cart`, 'storefront:cart');
      await visit(page, `${STORE}/track`, 'storefront:track');
      await visit(page, `${STORE}/login`, 'storefront:login');
      await visit(page, `${STORE}/account`, 'storefront:account');
      await visit(page, `${STORE}/pages/about`, 'storefront:cms');
      await visit(page, `${STORE}/checkout`, 'storefront:checkout');
    }
    await ctx.close();
  }

  await browser.close();

  console.log('\n=== VISITED ===');
  for (const v of results.visited) console.log(' ✓', v);
  console.log('\n=== ERRORS ===');
  if (results.errors.length === 0) {
    console.log(' none');
  } else {
    for (const e of results.errors) console.log(' ✗', e);
  }
  process.exit(results.errors.length ? 1 : 0);
}

main().catch((err) => {
  console.error('e2e runner failed:', err);
  process.exit(1);
});
