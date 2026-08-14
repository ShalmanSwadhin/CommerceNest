/**
 * Theme Builder live-draft scroll-height regression test.
 *
 * Reproduces the exact bug: after adding a section to an already-loaded
 * draft (no publish, no reload), the live preview's scroll container could
 * not reach the newly added content — even though the section existed in
 * the DOM with a correct height. Root cause (both required):
 *
 *   1. The 3-column workspace `<div className="grid ...">` in
 *      ThemeBuilder.tsx had no explicit `grid-template-rows`, so its
 *      implicit single row auto-sized to the CENTER item's own content
 *      height instead of clamping to the grid container's already-correct
 *      `flex-1 min-h-0` height — stretching the center column (and
 *      everything inside it) to an unbounded, content-driven size where
 *      `overflow-auto` never had anything to scroll.
 *   2. Even after fixing (1), the "phone mockup" frame div inside
 *      ThemeLivePreview.tsx (the `overflow-auto` container's single flex
 *      child) had no `flex-shrink: 0`, so the flex-column parent
 *      compressed it down to fit the available space instead of letting it
 *      keep its natural (larger) content height — and since that frame is
 *      `overflow-hidden`, the excess was silently clipped rather than
 *      overflowing into a scrollable parent.
 *
 * Fixes: `grid-rows-[minmax(0,1fr)]` on the workspace grid, `shrink-0` on
 * the frame div. Both are load-bearing; removing either reintroduces the
 * bug (verified during development).
 *
 * Follow-up bug (same root cause, different symptom): once the workspace
 * grid row was correctly clamped to real viewport height, the LEFT sidebar
 * (SectionList.tsx) was clamped to a realistic height too — and that
 * exposed a second, pre-existing layout bug in that sidebar: its "Add
 * section" footer has `overflow: visible`, so its automatic flex minimum
 * size is its own full content height (it never shrinks), which squeezed
 * the "Homepage sections" list above it down to a sliver whenever the
 * sidebar's real available height was small. Previously masked because the
 * (broken) oversized grid row gave every column — including this sidebar
 * — effectively unlimited height. Fix: cap the "Add section" footer with
 * `max-h-[220px] overflow-y-auto` so it scrolls internally instead of
 * refusing to shrink, giving the sections list priority for the sidebar's
 * real space.
 *
 * Run while `npm run dev` is up: node scripts/theme-builder-scroll-test.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const { chromium } = require('playwright');

const PORT = process.env.GATEWAY_PORT || '8080';
const ADMIN = `http://admin.localhost:${PORT}`;
const PREVIEW_SELECTOR = 'div.overflow-auto.bg-\\[\\#E8EAF0\\]';

const results = { pass: [], fail: [] };
function check(label, cond) {
  if (cond) {
    results.pass.push(label);
    console.log('PASS:', label);
  } else {
    results.fail.push(label);
    console.log('FAIL:', label);
  }
}

async function measureBottom(page) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    el.scrollTop = el.scrollHeight;
    return {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollTop: el.scrollTop,
      reachedBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 2,
    };
  }, PREVIEW_SELECTOR);
}

async function addSection(page, label) {
  const addSectionContainer = page.locator('div.border-t.border-line.p-2').last();
  await addSectionContainer.getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(400);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.fill('#email', 'admin@commercenest.com');
  await page.fill('#password', 'Admin123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(new RegExp(`admin\\.localhost:${PORT}/?$`), { timeout: 15000 });

  await page.goto(`${ADMIN}/themes`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Open Theme Builder")').first().click();
  await page.waitForTimeout(1500);

  // --- Test A: initial scroll reaches the actual bottom ---
  const initial = await measureBottom(page);
  console.log('Initial:', JSON.stringify(initial));
  check('Test A — initial load: scroll reaches the actual bottom', initial?.reachedBottom === true);
  const heightAfterA = initial?.scrollHeight ?? 0;

  // --- Test G: sidebar space allocation — the "Homepage sections" list
  //     must get real usable space, not be squeezed to a sliver by the
  //     "Add section" footer below it. ---
  const sidebar = await page.evaluate(() => {
    const list = document.querySelector('div.flex-1.space-y-1.overflow-y-auto.px-2.py-2');
    const footer = document.querySelector('div.max-h-\\[220px\\]');
    return {
      listClientHeight: list ? list.clientHeight : null,
      footerClientHeight: footer ? footer.clientHeight : null,
    };
  });
  console.log('Sidebar space allocation:', JSON.stringify(sidebar));
  check(
    'Test G — sidebar: "Homepage sections" list gets usable height (not squeezed to a sliver)',
    (sidebar.listClientHeight ?? 0) >= 150,
  );
  check(
    'Test G — sidebar: "Add section" footer is capped, not dominating the sidebar',
    (sidebar.footerClientHeight ?? 9999) <= 220,
  );

  // --- Test B: add Hero, must be reachable without publish/reload ---
  await addSection(page, 'Hero');
  const afterHero = await measureBottom(page);
  console.log('After add Hero:', JSON.stringify(afterHero));
  check('Test B — add Hero: scroll reaches the actual bottom', afterHero?.reachedBottom === true);
  check('Test B — add Hero: scrollHeight actually grew', (afterHero?.scrollHeight ?? 0) > heightAfterA);

  // --- Test C: add Promotional Banner, same expectation ---
  await addSection(page, 'Promotional Banner');
  const afterPromo = await measureBottom(page);
  console.log('After add Promotional Banner:', JSON.stringify(afterPromo));
  check('Test C — add Promotional Banner: scroll reaches the actual bottom', afterPromo?.reachedBottom === true);
  check(
    'Test C — add Promotional Banner: scrollHeight grew again',
    (afterPromo?.scrollHeight ?? 0) > (afterHero?.scrollHeight ?? 0),
  );

  // --- Test D: multiple further additions, every one remains reachable ---
  let prevHeight = afterPromo?.scrollHeight ?? 0;
  let allReachable = true;
  let allGrew = true;
  for (const label of ['Testimonials', 'Why Choose Us', 'Best Sellers']) {
    await addSection(page, label);
    const m = await measureBottom(page);
    console.log(`After add ${label}:`, JSON.stringify(m));
    if (!m?.reachedBottom) allReachable = false;
    if (!((m?.scrollHeight ?? 0) > prevHeight)) allGrew = false;
    prevHeight = m?.scrollHeight ?? prevHeight;
  }
  check('Test D — multiple additions: every one remains reachable without publish/reload', allReachable);
  check('Test D — multiple additions: scrollHeight grows monotonically', allGrew);

  // --- Test F (reorder): reordering does not break scroll range ---
  const firstHandle = page.locator('button[aria-label="Drag to reorder"]').first();
  await firstHandle.focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  const afterReorder = await measureBottom(page);
  console.log('After reorder:', JSON.stringify(afterReorder));
  check('Test F — reorder: scroll still reaches the actual bottom', afterReorder?.reachedBottom === true);

  // --- Test E: publish + reload preserves correct behavior, and further
  //     additions after reload continue to work ---
  await page.click('button:has-text("Publish")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Publish now")');
  await page.waitForTimeout(1500);

  await page.reload({ waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);
  const afterReload = await measureBottom(page);
  console.log('After publish + reload:', JSON.stringify(afterReload));
  check('Test E — publish + reload: scroll reaches the actual bottom', afterReload?.reachedBottom === true);

  await addSection(page, 'Hero');
  const afterReloadAdd = await measureBottom(page);
  console.log('After add post-reload:', JSON.stringify(afterReloadAdd));
  check(
    'Test E — add after reload: still reachable without a second reload',
    afterReloadAdd?.reachedBottom === true,
  );
  check(
    'Test E — add after reload: scrollHeight grew',
    (afterReloadAdd?.scrollHeight ?? 0) > (afterReload?.scrollHeight ?? 0),
  );

  check('no console/page errors occurred', errors.length === 0);
  if (errors.length) console.log('Errors:', errors);

  console.log('\n=== SUMMARY ===');
  console.log('PASS:', results.pass.length, 'FAIL:', results.fail.length);
  if (results.fail.length) console.log('Failures:', results.fail);

  await browser.close();
  if (results.fail.length) process.exit(1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
