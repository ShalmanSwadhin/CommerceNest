import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://techworld-bd.localhost:8080/login');
await page.waitForTimeout(1000);

// Invalid phone
await page.fill('#phone', '12345');
const sendBtn = page.getByRole('button', { name: 'Send OTP' });
console.log('Send OTP disabled for empty-ish invalid input?', await sendBtn.isDisabled());
await sendBtn.click();
await page.waitForTimeout(1000);
const invalidErr = await page.locator('text=/Auth error/i').locator('..').textContent().catch(() => null);
console.log('invalid phone error shown:', invalidErr);

// Valid phone -> send -> resend cooldown UI
const phone = '018' + String(Math.floor(10000000 + Math.random() * 89999999));
await page.fill('#phone', phone);
await page.getByRole('button', { name: 'Send OTP' }).click();
await page.waitForTimeout(1200);
const resendBtnText1 = await page.getByRole('button', { name: /Resend OTP/i }).textContent();
console.log('resend button right after send:', resendBtnText1);
const resendDisabled = await page.getByRole('button', { name: /Resend OTP/i }).isDisabled();
console.log('resend disabled during cooldown:', resendDisabled);

// Wrong code
await page.fill('#code', '000000');
await page.getByRole('button', { name: 'Verify & continue' }).click();
await page.waitForTimeout(1200);
const wrongErr = await page.locator('text=/Auth error/i').locator('..').textContent().catch(() => null);
console.log('wrong OTP error shown:', wrongErr);
console.log('still on otp step (not navigated away):', page.url().includes('/login'));

// Change phone number link
await page.getByRole('button', { name: 'Change phone number' }).click();
await page.waitForTimeout(500);
const phoneInputVisible = await page.locator('#phone').isEnabled();
console.log('phone input editable again after Change phone number:', phoneInputVisible);

console.log('CONSOLE_ERRORS:', JSON.stringify(errors));
await page.screenshot({ path: 'C:/Users/USER/AppData/Local/Temp/claude/e--commercenest/66ea4f37-9057-4b78-a338-6995c80c2a30/scratchpad/fix-shots/otp-ux-states.png' });
await browser.close();
