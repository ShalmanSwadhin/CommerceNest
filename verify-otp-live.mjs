import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://techworld-bd.localhost:8080/login');
await page.waitForTimeout(1500);

const phone = '017' + String(Math.floor(10000000 + Math.random() * 89999999));
console.log('using phone', phone);

await page.fill('#phone', phone);
await page.getByRole('button', { name: 'Send OTP' }).click();
await page.waitForTimeout(1500);

const devCodeText = await page.locator('text=/Dev OTP/i').locator('..').textContent().catch(() => null);
console.log('dev OTP box text:', devCodeText);

// Extract the 6-digit code from the alert
const codeMatch = devCodeText?.match(/(\d{6})/);
const code = codeMatch?.[1];
console.log('extracted code:', code);

if (!code) {
  console.log('FAILED — no dev code visible on page');
  await page.screenshot({ path: 'C:/Users/USER/AppData/Local/Temp/claude/e--commercenest/66ea4f37-9057-4b78-a338-6995c80c2a30/scratchpad/fix-shots/otp-no-code.png' });
  await browser.close();
  process.exit(1);
}

await page.fill('#code', code);
await page.getByRole('button', { name: 'Verify & continue' }).click();
await page.waitForTimeout(2000);

console.log('url after verify:', page.url());
const onAccountPage = page.url().includes('/account');
console.log('redirected to account:', onAccountPage);

console.log('CONSOLE_ERRORS:', JSON.stringify(errors));
await page.screenshot({ path: 'C:/Users/USER/AppData/Local/Temp/claude/e--commercenest/66ea4f37-9057-4b78-a338-6995c80c2a30/scratchpad/fix-shots/otp-success.png' });
await browser.close();
