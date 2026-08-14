/**
 * Theme Builder hang/freeze regression test.
 *
 * Reproduces the exact scenario that used to cause an 800ms+ main-thread
 * block (a real, user-visible freeze): rapid successive theme edits (e.g.
 * dragging a color picker fires dozens of change events in a couple of
 * seconds) with many sections present. Root cause + fix are documented in
 * apps/admin-panel/src/features/theme-builder/SectionList.tsx and
 * ThemeLivePreview.tsx (React.memo + stabilized callbacks).
 *
 * Run while `npm run dev` is up: node scripts/theme-builder-stress-test.mjs
 *
 * Exits non-zero if:
 *   - any step throws/times out
 *   - a browser "longtask" (>50ms main-thread block) is recorded
 *   - any console/page error occurs
 *   - typing after a burst of edits doesn't reflect correctly
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const { chromium } = require('playwright');

const PORT = process.env.GATEWAY_PORT || '8080';
const ADMIN = `http://admin.localhost:${PORT}`;
const LONGTASK_THRESHOLD_MS = 100; // generous margin over the browser's own 50ms definition

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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
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
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    window.__longTasks = [];
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__longTasks.push({ start: entry.startTime, duration: entry.duration });
      }
    });
    obs.observe({ entryTypes: ['longtask'] });
  });

  const addBtn = (label) =>
    page.locator(
      `xpath=//p[normalize-space()="Add section"]/following-sibling::div//button[normalize-space()="${label}"]`,
    );
  const labels = ['Hero', 'Featured Products', 'Promotional Banner', 'Testimonials', 'Why Choose Us'];

  // Baseline, not 0: this script is run repeatedly against the same dev
  // database and store picker (whichever store is "first" in the list), so
  // sections accumulate across runs. Assert relative growth, not an
  // absolute count.
  const baselineCount = await page.locator('[aria-label="Drag to reorder"]').count();
  console.log(`Starting from ${baselineCount} pre-existing sections.`);

  console.log('Adding sections progressively: 1, 3, 5, 10, 15...');
  const checkpoints = [1, 3, 5, 10, 15];
  let added = 0;
  for (const target of checkpoints) {
    while (added < target) {
      await addBtn(labels[added % labels.length]).click();
      added += 1;
      await page.waitForFunction(
        (n) => document.querySelectorAll('[aria-label="Drag to reorder"]').length >= n,
        baselineCount + added,
        { timeout: 15000 },
      );
    }
    console.log(`  reached ${target} sections`);
  }
  check('progressively adding up to 15 sections completed without hanging', added === 15);

  console.log('Firing 60 rapid color-change events (simulates dragging the color picker)...');
  await page.locator('button:has-text("Colors")').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const primary = document.querySelectorAll('input[type="color"]')[0];
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    for (let i = 0; i < 60; i++) {
      setter.call(primary, colors[i % colors.length]);
      primary.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await page.waitForTimeout(400);

  console.log('Confirming responsiveness immediately after the burst...');
  // Exact match: the right-panel inspector's "Section" tab, not the left
  // sidebar's "Sections" list/add-section toggle (added later, similarly
  // named).
  await page.getByRole('button', { name: 'Section', exact: true }).click();
  await page.waitForTimeout(200);
  const input = page.locator('input[type="text"]').first();
  await input.click();
  await input.fill('');
  await page.keyboard.type('ResponsiveAfterBurst', { delay: 5 });
  const finalValue = await input.inputValue();
  check('typing after the color burst reflects correctly', finalValue === 'ResponsiveAfterBurst');

  console.log('Saving draft, reloading, continuing to edit...');
  await page.locator('button:has-text("Save Draft")').click();
  await page.waitForSelector('text=Draft saved', { timeout: 15000 });
  await page.reload({ waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(800);
  const reloadedCount = await page.locator('[aria-label="Drag to reorder"]').count();
  check(
    'section count persisted correctly after save + reload',
    reloadedCount === baselineCount + 15,
  );

  const longTasks = await page.evaluate(() => window.__longTasks || []);
  const worstLongTask = longTasks.reduce((max, t) => Math.max(max, t.duration), 0);
  console.log(`\nLong tasks recorded: ${longTasks.length}, worst: ${worstLongTask.toFixed(0)}ms`);
  check(
    `no main-thread block over ${LONGTASK_THRESHOLD_MS}ms occurred`,
    worstLongTask < LONGTASK_THRESHOLD_MS,
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
