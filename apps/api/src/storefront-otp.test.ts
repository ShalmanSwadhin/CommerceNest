import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { hasDatabase } from './test/setup.js';
import { initRedis } from './lib/redis.js';
import { kvDel, kvGet, kvSet } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import {
  resolveSmsMode,
  toE164Bangladesh,
  getLastStubMessage,
  clearStubOutbox,
} from './lib/sms.js';
import * as storefrontService from './services/storefront.service.js';

const app = createApp();

function randomBdPhone(): string {
  // 01[3-9]XXXXXXXX — valid shape, random enough that parallel test cases
  // never collide on the OTP resend-cooldown / attempt-limit kv keys.
  const secondDigit = String(3 + Math.floor(Math.random() * 7));
  const rest = String(Math.floor(10000000 + Math.random() * 89999999));
  return `01${secondDigit}${rest}`;
}

describe('lib/sms.ts — resolveSmsMode (pure — no DB, no network, no env mutation)', () => {
  it('uses the local stub in development with no provider configured', () => {
    expect(
      resolveSmsMode({ nodeEnv: 'development', providerConfigured: false }),
    ).toBe('stub');
  });

  it('uses the local stub in test with no provider configured', () => {
    expect(resolveSmsMode({ nodeEnv: 'test', providerConfigured: false })).toBe(
      'stub',
    );
  });

  it('refuses to silently stub in production with no provider configured', () => {
    expect(
      resolveSmsMode({ nodeEnv: 'production', providerConfigured: false }),
    ).toBe('unconfigured-production');
  });

  it('uses the real provider whenever one is configured, in any environment', () => {
    expect(
      resolveSmsMode({ nodeEnv: 'production', providerConfigured: true }),
    ).toBe('real');
    expect(
      resolveSmsMode({ nodeEnv: 'development', providerConfigured: true }),
    ).toBe('real');
  });
});

describe('lib/sms.ts — toE164Bangladesh', () => {
  it('converts local format to E.164', () => {
    expect(toE164Bangladesh('01712345678')).toBe('+8801712345678');
  });

  it('throws for a non-Bangladesh-shaped number', () => {
    expect(() => toE164Bangladesh('+8801712345678')).toThrow();
    expect(() => toE164Bangladesh('12345')).toThrow();
  });
});

describe.skipIf(!hasDatabase)('OTP service — requestOtp / verifyOtp', () => {
  beforeAll(async () => {
    await initRedis();
  });

  it('happy path: send, verify with the correct code, receive a session, customer is created', async () => {
    const phone = randomBdPhone();
    clearStubOutbox();

    const sendRes = await storefrontService.requestOtp('techworld-bd', phone);
    expect(sendRes.ok).toBe(true);
    expect(sendRes.devCode).toBeTruthy();

    // The local-stub SMS provider actually "sent" it — confirms the OTP
    // flow is wired through lib/sms.ts, not silently skipping it.
    const stubMsg = getLastStubMessage(phone);
    expect(stubMsg?.body).toContain(sendRes.devCode!);

    const verifyRes = await storefrontService.verifyOtp(
      'techworld-bd',
      phone,
      sendRes.devCode!,
    );
    expect(verifyRes.accessToken).toBeTruthy();
    expect(verifyRes.customer.phone).toBe(phone);

    const dbCustomer = await prisma.customer.findFirst({ where: { phone } });
    expect(dbCustomer).toBeTruthy();
    expect(dbCustomer!.storeId).toBeTruthy();
  });

  it('a second OTP login for the same phone reuses the existing customer (no duplicate)', async () => {
    const phone = randomBdPhone();
    const first = await storefrontService.requestOtp('techworld-bd', phone);
    const firstVerify = await storefrontService.verifyOtp(
      'techworld-bd',
      phone,
      first.devCode!,
    );

    // Isolate this test from the resend-cooldown behavior (covered by its
    // own dedicated test below) — a real "log in again later" scenario
    // would naturally have the cooldown expired by then.
    await kvDel(`otp:cooldown:techworld-bd:${phone}`);
    const second = await storefrontService.requestOtp('techworld-bd', phone);
    const secondVerify = await storefrontService.verifyOtp(
      'techworld-bd',
      phone,
      second.devCode!,
    );

    expect(secondVerify.customer.id).toBe(firstVerify.customer.id);
    const count = await prisma.customer.count({ where: { phone, storeId: firstVerify.customer.storeId } });
    expect(count).toBe(1);
  });

  it('rejects an invalid phone number before ever generating a code', async () => {
    await expect(
      storefrontService.requestOtp('techworld-bd', '12345'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a wrong OTP code', async () => {
    const phone = randomBdPhone();
    await storefrontService.requestOtp('techworld-bd', phone);
    await expect(
      storefrontService.verifyOtp('techworld-bd', phone, '000000'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('invalidates the code after 5 incorrect attempts, even if the 6th guess is correct', async () => {
    const phone = randomBdPhone();
    const sent = await storefrontService.requestOtp('techworld-bd', phone);
    const wrongCode = sent.devCode === '111111' ? '222222' : '111111';

    for (let i = 0; i < 5; i++) {
      await expect(
        storefrontService.verifyOtp('techworld-bd', phone, wrongCode),
      ).rejects.toMatchObject({ statusCode: 401 });
    }

    // The code itself was correct, but the attempt budget is exhausted.
    await expect(
      storefrontService.verifyOtp('techworld-bd', phone, sent.devCode!),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects an expired code', async () => {
    const phone = randomBdPhone();
    const sent = await storefrontService.requestOtp('techworld-bd', phone);

    // Force expiry without waiting 5 real minutes: read the stored entry,
    // rewrite it with expiresAt in the past.
    const raw = await kvGet(`otp:techworld-bd:${phone}`);
    expect(raw).toBeTruthy();
    const stored = JSON.parse(raw!);
    await kvSet(
      `otp:techworld-bd:${phone}`,
      JSON.stringify({ ...stored, expiresAt: Date.now() - 1000 }),
      60,
    );

    await expect(
      storefrontService.verifyOtp('techworld-bd', phone, sent.devCode!),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects reuse of an already-verified code', async () => {
    const phone = randomBdPhone();
    const sent = await storefrontService.requestOtp('techworld-bd', phone);
    await storefrontService.verifyOtp('techworld-bd', phone, sent.devCode!);

    await expect(
      storefrontService.verifyOtp('techworld-bd', phone, sent.devCode!),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('enforces the resend cooldown', async () => {
    const phone = randomBdPhone();
    await storefrontService.requestOtp('techworld-bd', phone);
    await expect(
      storefrontService.requestOtp('techworld-bd', phone),
    ).rejects.toMatchObject({ statusCode: 429 });
  });

  it('multi-tenant: the same phone number at two different stores gets independent codes and customer records', async () => {
    const phone = randomBdPhone();

    const sentA = await storefrontService.requestOtp('techworld-bd', phone);
    const sentB = await storefrontService.requestOtp('rahim-mobile', phone);
    expect(sentA.devCode).not.toBe(sentB.devCode);

    // Store A's code must not verify against Store B.
    await expect(
      storefrontService.verifyOtp('rahim-mobile', phone, sentA.devCode!),
    ).rejects.toMatchObject({ statusCode: 401 });

    const verifyA = await storefrontService.verifyOtp(
      'techworld-bd',
      phone,
      sentA.devCode!,
    );
    const verifyB = await storefrontService.verifyOtp(
      'rahim-mobile',
      phone,
      sentB.devCode!,
    );

    expect(verifyA.customer.id).not.toBe(verifyB.customer.id);
    expect(verifyA.customer.storeId).not.toBe(verifyB.customer.storeId);
  });
});

describe.skipIf(!hasDatabase)('OTP HTTP routes (end-to-end wiring + rate limiting)', () => {
  beforeAll(async () => {
    await initRedis();
  });

  it('POST /auth/otp/request then /auth/otp/verify succeeds through the real HTTP app', async () => {
    const phone = randomBdPhone();
    const sendRes = await request(app)
      .post('/api/storefront/techworld-bd/auth/otp/request')
      .send({ phone });
    expect(sendRes.status).toBe(200);
    expect(sendRes.body.devCode).toBeTruthy();

    const verifyRes = await request(app)
      .post('/api/storefront/techworld-bd/auth/otp/verify')
      .send({ phone, code: sendRes.body.devCode });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.accessToken).toBeTruthy();

    const me = await request(app)
      .get('/api/storefront/techworld-bd/me')
      .set('Authorization', `Bearer ${verifyRes.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.customer.phone).toBe(phone);
  });

  it('rate-limits repeated /auth/otp/request calls from the same client', async () => {
    // 10/minute/IP (see SECURITY.md). One phone per call so we're hitting
    // the IP limiter specifically, not the phone-scoped resend cooldown.
    let sawRateLimited = false;
    for (let i = 0; i < 14; i++) {
      const res = await request(app)
        .post('/api/storefront/techworld-bd/auth/otp/request')
        .send({ phone: randomBdPhone() });
      if (res.status === 429) {
        sawRateLimited = true;
        expect(res.body.error.code).toBe('RATE_LIMITED');
        break;
      }
    }
    expect(sawRateLimited).toBe(true);
  });
});
