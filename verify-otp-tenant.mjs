import { chromium } from 'playwright';

const browser = await chromium.launch();
const phone = '019' + String(Math.floor(10000000 + Math.random() * 89999999));
console.log('shared phone:', phone);

async function loginAt(host) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://${host}.localhost:8080/login`);
  await page.waitForTimeout(1000);
  await page.fill('#phone', phone);
  await page.getByRole('button', { name: 'Send OTP' }).click();
  await page.waitForTimeout(1200);
  const devCodeText = await page.locator('text=/Dev OTP/i').locator('..').textContent();
  const code = devCodeText.match(/(\d{6})/)[1];
  await page.fill('#code', code);
  await page.getByRole('button', { name: 'Verify & continue' }).click();
  await page.waitForTimeout(1500);
  const accountText = await page.locator('h1').first().textContent().catch(() => null);
  const storeName = await page.locator('header, nav').first().textContent().catch(() => null);
  await page.screenshot({ path: `C:/Users/USER/AppData/Local/Temp/claude/e--commercenest/66ea4f37-9057-4b78-a338-6995c80c2a30/scratchpad/fix-shots/tenant-${host}.png` });
  await page.close();
  return { url: page.url, accountText, storeName };
}

const techworld = await loginAt('techworld-bd');
console.log('techworld-bd result:', JSON.stringify(techworld));
const rahim = await loginAt('rahim-mobile');
console.log('rahim-mobile result:', JSON.stringify(rahim));

await browser.close();
