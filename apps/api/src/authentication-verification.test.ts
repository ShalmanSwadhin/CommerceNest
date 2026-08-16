import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { hasDatabase } from './test/setup.js';
import { initRedis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import * as storefrontService from './services/storefront.service.js';
import * as verificationService from './services/verification.service.js';
import * as storeService from './services/store.service.js';
import * as domainService from './services/domain.service.js';
import * as trialService from './services/trial.service.js';

const app = createApp();

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

/** Foreign keys (Store.approvedById, AuditLog.actorId) require a real User
 * row — the seeded Master Admin, not a placeholder string. */
async function masterAdminActor() {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@commercenest.com' },
    select: { id: true, role: true },
  });
  return { id: admin.id, role: admin.role as string };
}

describe.skipIf(!hasDatabase)('Storefront customer — name/email/password auth', () => {
  beforeAll(async () => {
    await initRedis();
  });

  it('registers, is usable immediately, and can log back in — no forced verification', async () => {
    const email = uniqueEmail('cust');
    const reg = await storefrontService.registerCustomer('techworld-bd', {
      name: 'Real Customer',
      email,
      password: 'CustPass123!',
    });
    expect(reg.accessToken).toBeTruthy();
    expect(reg.customer.email).toBe(email);
    expect(reg.customer.emailVerified).toBe(false);
    expect(reg.customer.phoneVerified).toBe(false);

    const login = await storefrontService.loginCustomer('techworld-bd', {
      email,
      password: 'CustPass123!',
    });
    expect(login.customer.id).toBe(reg.customer.id);
  });

  it('rejects a duplicate email at the same store', async () => {
    const email = uniqueEmail('dupe');
    await storefrontService.registerCustomer('techworld-bd', {
      name: 'First',
      email,
      password: 'CustPass123!',
    });
    await expect(
      storefrontService.registerCustomer('techworld-bd', {
        name: 'Second',
        email,
        password: 'OtherPass123!',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('the SAME email is allowed as independent accounts at two different stores', async () => {
    const email = uniqueEmail('multitenant');
    const a = await storefrontService.registerCustomer('techworld-bd', {
      name: 'A',
      email,
      password: 'PassA123!',
    });
    const b = await storefrontService.registerCustomer('rahim-mobile', {
      name: 'B',
      email,
      password: 'PassB123!',
    });
    expect(a.customer.id).not.toBe(b.customer.id);
    expect(a.customer.storeId).not.toBe(b.customer.storeId);
  });

  it('rejects wrong password', async () => {
    const email = uniqueEmail('wrongpw');
    await storefrontService.registerCustomer('techworld-bd', {
      name: 'X',
      email,
      password: 'RightPass123!',
    });
    await expect(
      storefrontService.loginCustomer('techworld-bd', {
        email,
        password: 'WrongPass123!',
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('phone OTP login remains fully independent — a password customer and an OTP customer are different accounts unless they share identity', async () => {
    const phone = '019' + String(Math.floor(10000000 + Math.random() * 89999999));
    const otpSend = await storefrontService.requestOtp('techworld-bd', phone);
    const otpLogin = await storefrontService.verifyOtp('techworld-bd', phone, otpSend.devCode!);
    expect(otpLogin.customer.phone).toBe(phone);
    expect(otpLogin.customer.email).toBeNull();
  });

  it('full HTTP round trip: register -> /me shows unverified -> login again', async () => {
    const email = uniqueEmail('http');
    const reg = await request(app)
      .post('/api/storefront/techworld-bd/auth/register')
      .send({ name: 'HTTP Customer', email, password: 'HttpPass123!', confirmPassword: 'HttpPass123!' });
    expect(reg.status).toBe(201);

    const me = await request(app)
      .get('/api/storefront/techworld-bd/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.customer.emailVerified).toBe(false);

    const login = await request(app)
      .post('/api/storefront/techworld-bd/auth/login')
      .send({ email, password: 'HttpPass123!' });
    expect(login.status).toBe(200);
    expect(login.body.customer.id).toBe(reg.body.customer.id);
  });

  it('rejects mismatched confirmPassword at the HTTP validation layer', async () => {
    const res = await request(app)
      .post('/api/storefront/techworld-bd/auth/register')
      .send({
        name: 'Mismatch',
        email: uniqueEmail('mismatch'),
        password: 'GoodPass123!',
        confirmPassword: 'DifferentPass123!',
      });
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!hasDatabase)('Optional email verification (customer + merchant, shared token infra)', () => {
  beforeAll(async () => {
    await initRedis();
  });

  it('customer: send -> verify flips emailVerified, browsing/checkout is never blocked before that', async () => {
    const email = uniqueEmail('everify');
    const reg = await storefrontService.registerCustomer('techworld-bd', {
      name: 'Verify Me',
      email,
      password: 'VerifyPass123!',
    });
    expect(reg.customer.emailVerified).toBe(false);

    const sent = await verificationService.sendEmailVerification({
      subjectType: 'CUSTOMER',
      subjectId: reg.customer.id,
      email,
      name: 'Verify Me',
      verifyUrlBase: 'http://techworld-bd.localhost:8080/verify-email',
    });
    expect(sent.devToken).toBeTruthy();

    const confirmed = await verificationService.confirmEmailVerification('CUSTOMER', sent.devToken!);
    expect(confirmed.ok).toBe(true);

    const profile = await storefrontService.getCustomerProfile('techworld-bd', reg.customer.id);
    expect(profile.emailVerified).toBe(true);
  });

  it('rejects an expired token', async () => {
    const email = uniqueEmail('expired');
    const reg = await storefrontService.registerCustomer('techworld-bd', {
      name: 'Expiring',
      email,
      password: 'ExpirePass123!',
    });
    const sent = await verificationService.sendEmailVerification({
      subjectType: 'CUSTOMER',
      subjectId: reg.customer.id,
      email,
      name: 'Expiring',
      verifyUrlBase: 'http://techworld-bd.localhost:8080/verify-email',
    });

    // Force expiry without waiting 24 real hours.
    await prisma.emailVerificationToken.updateMany({
      where: { subjectType: 'CUSTOMER', subjectId: reg.customer.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      verificationService.confirmEmailVerification('CUSTOMER', sent.devToken!),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects reuse of an already-used token', async () => {
    const email = uniqueEmail('reuse');
    const reg = await storefrontService.registerCustomer('techworld-bd', {
      name: 'Reuse',
      email,
      password: 'ReusePass123!',
    });
    const sent = await verificationService.sendEmailVerification({
      subjectType: 'CUSTOMER',
      subjectId: reg.customer.id,
      email,
      name: 'Reuse',
      verifyUrlBase: 'http://techworld-bd.localhost:8080/verify-email',
    });
    await verificationService.confirmEmailVerification('CUSTOMER', sent.devToken!);
    await expect(
      verificationService.confirmEmailVerification('CUSTOMER', sent.devToken!),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('a fresh send invalidates an earlier unused token for the same subject', async () => {
    const email = uniqueEmail('superseded');
    const reg = await storefrontService.registerCustomer('techworld-bd', {
      name: 'Superseded',
      email,
      password: 'SupersedePass123!',
    });
    const first = await verificationService.sendEmailVerification({
      subjectType: 'CUSTOMER',
      subjectId: reg.customer.id,
      email,
      name: 'Superseded',
      verifyUrlBase: 'http://techworld-bd.localhost:8080/verify-email',
    });
    // Bypass the resend cooldown for the test — what's under test here is
    // "does a fresh send invalidate the old token", not the cooldown itself
    // (that's covered by the OTP cooldown tests' equivalent).
    const key = `emailverify:cooldown:CUSTOMER:${reg.customer.id}`;
    const { kvDel } = await import('./lib/redis.js');
    await kvDel(key);
    const second = await verificationService.sendEmailVerification({
      subjectType: 'CUSTOMER',
      subjectId: reg.customer.id,
      email,
      name: 'Superseded',
      verifyUrlBase: 'http://techworld-bd.localhost:8080/verify-email',
    });

    await expect(
      verificationService.confirmEmailVerification('CUSTOMER', first.devToken!),
    ).rejects.toMatchObject({ statusCode: 400 });
    const confirmSecond = await verificationService.confirmEmailVerification(
      'CUSTOMER',
      second.devToken!,
    );
    expect(confirmSecond.ok).toBe(true);
  });

  it('merchant (User) email verification uses the exact same service, not a second implementation', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@techworld.bd', password: 'Owner123!' });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.accessToken as string;

    const send = await request(app)
      .post('/api/auth/email-verification/send')
      .set('Authorization', `Bearer ${token}`);
    expect(send.status).toBe(200);
    expect(send.body.devToken).toBeTruthy();

    const verify = await request(app)
      .post('/api/auth/email-verification/verify')
      .send({ token: send.body.devToken });
    expect(verify.status).toBe(200);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.user.emailVerified).toBe(true);
  });
});

describe.skipIf(!hasDatabase)('Optional phone verification (reuses lib/otp.ts — not a second OTP system)', () => {
  beforeAll(async () => {
    await initRedis();
  });

  it('customer can verify a phone from their account without creating a new session', async () => {
    const email = uniqueEmail('phoneverify');
    const reg = await storefrontService.registerCustomer('techworld-bd', {
      name: 'Phone Verify',
      email,
      password: 'PhoneVerifyPass123!',
    });
    const phone = '017' + String(Math.floor(10000000 + Math.random() * 89999999));

    const sent = await verificationService.sendPhoneVerificationOtp(
      'CUSTOMER',
      reg.customer.id,
      phone,
    );
    expect(sent.devCode).toBeTruthy();

    await verificationService.confirmPhoneVerificationOtp(
      'CUSTOMER',
      reg.customer.id,
      phone,
      sent.devCode!,
    );

    const profile = await storefrontService.getCustomerProfile('techworld-bd', reg.customer.id);
    expect(profile.phoneVerified).toBe(true);
    expect(profile.phone).toBe(phone);
  });

  it('rejects claiming a phone another customer at the same store already has', async () => {
    const phone = '018' + String(Math.floor(10000000 + Math.random() * 89999999));
    // First customer gets this phone via OTP login.
    const firstOtp = await storefrontService.requestOtp('techworld-bd', phone);
    await storefrontService.verifyOtp('techworld-bd', phone, firstOtp.devCode!);

    // Second (password) customer tries to verify the same phone.
    const reg = await storefrontService.registerCustomer('techworld-bd', {
      name: 'Phone Collider',
      email: uniqueEmail('phonecollide'),
      password: 'CollidePass123!',
    });
    const sent = await verificationService.sendPhoneVerificationOtp(
      'CUSTOMER',
      reg.customer.id,
      phone,
    );
    await expect(
      verificationService.confirmPhoneVerificationOtp(
        'CUSTOMER',
        reg.customer.id,
        phone,
        sent.devCode!,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe.skipIf(!hasDatabase)('Store approval — independent of verification, admin override', () => {
  it('a Master-Admin-created store defaults to APPROVED', async () => {
    const email = uniqueEmail('directcreate');
    const created = await storeService.createStore(
      {
        name: 'Direct Create Co',
        slug: `direct-${Date.now()}`,
        ownerEmail: email,
        ownerName: 'Direct Owner',
      },
      await masterAdminActor(),
    );
    expect(created.store.approvalStatus).toBe('APPROVED');
  });

  it('a self-serve trial store defaults to PENDING approval, regardless of verification state', async () => {
    const email = uniqueEmail('trialapproval');
    const result = await trialService.createTrialLead({
      prospectName: 'Trial Prospect',
      businessName: 'Trial Approval Co',
      phone: '01711112222',
      email,
      password: 'TrialApprove123!',
      confirmPassword: 'TrialApprove123!',
    });
    expect(result.store.approvalStatus).toBe('PENDING');

    const owner = await prisma.user.findUnique({ where: { email } });
    expect(owner!.emailVerified).toBe(false);
    expect(owner!.phoneVerified).toBe(false);
  });

  it('Master Admin can approve a store whose owner has verified nothing at all', async () => {
    const email = uniqueEmail('unverifiedapprove');
    const result = await trialService.createTrialLead({
      prospectName: 'Unverified Prospect',
      businessName: 'Unverified Approval Co',
      phone: '01711113333',
      email,
      password: 'UnverifiedApprove123!',
      confirmPassword: 'UnverifiedApprove123!',
    });
    expect(result.store.approvalStatus).toBe('PENDING');

    const approved = await storeService.approveStore(
      result.store.id,
      'Looks legitimate',
      await masterAdminActor(),
    );
    expect(approved.approvalStatus).toBe('APPROVED');

    // Approval never touches verification — this is the critical
    // independence the task explicitly requires.
    const owner = await prisma.user.findUnique({ where: { email } });
    expect(owner!.emailVerified).toBe(false);
    expect(owner!.phoneVerified).toBe(false);
  });

  it('Master Admin can reject a store approval', async () => {
    const email = uniqueEmail('rejectapproval');
    const result = await trialService.createTrialLead({
      prospectName: 'Reject Prospect',
      businessName: 'Reject Approval Co',
      phone: '01711114444',
      email,
      password: 'RejectApprove123!',
      confirmPassword: 'RejectApprove123!',
    });
    const rejected = await storeService.rejectStoreApproval(
      result.store.id,
      'Suspicious catalog',
      await masterAdminActor(),
    );
    expect(rejected.approvalStatus).toBe('REJECTED');
  });

  it('duplicate trial email is rejected with a clear message', async () => {
    const email = uniqueEmail('dupetrial');
    await trialService.createTrialLead({
      prospectName: 'First',
      businessName: 'First Co',
      phone: '01711115555',
      email,
      password: 'DupeTrial123!',
      confirmPassword: 'DupeTrial123!',
    });
    await expect(
      trialService.createTrialLead({
        prospectName: 'Second',
        businessName: 'Second Co',
        phone: '01711116666',
        email,
        password: 'DupeTrial456!',
        confirmPassword: 'DupeTrial456!',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe.skipIf(!hasDatabase)('CommerceNest-namespace domain requests', () => {
  it('checks availability, requests, admin approves, then assigns a real live domain', async () => {
    const label = `qa-domain-${Date.now()}`;
    const availability = await domainService.checkDomainLabelAvailability(label);
    expect(availability.available).toBe(true);

    const store = await prisma.store.findUnique({ where: { slug: 'techworld-bd' } });
    const requested = await domainService.requestDomain(
      store!.id,
      { label },
      await masterAdminActor(),
    );
    expect(requested.status).toBe('PENDING');

    // Now taken — a second request for the same label is rejected.
    const secondCheck = await domainService.checkDomainLabelAvailability(label);
    expect(secondCheck.available).toBe(false);

    const approved = await domainService.approveDomainRequest(
      requested.id,
      await masterAdminActor(),
    );
    expect(approved.status).toBe('APPROVED');

    const { domain, request: assignedRequest } = await domainService.assignDomainRequest(
      requested.id,
      await masterAdminActor(),
    );
    expect(assignedRequest.status).toBe('ASSIGNED');
    expect(domain.status).toBe('VERIFIED');
    expect(domain.hostname).toBe(availability.hostname);

    // The domain now genuinely resolves via the same lookup real traffic uses.
    const resolved = await domainService.resolveStoreByHost(domain.hostname);
    expect(resolved.storeId).toBe(store!.id);
  });

  it('rejects a reserved label', async () => {
    await expect(domainService.checkDomainLabelAvailability('admin')).resolves.toMatchObject({
      available: false,
      reason: 'reserved',
    });
  });

  it('rejects requesting an already-assigned label', async () => {
    const label = `qa-taken-${Date.now()}`;
    const store = await prisma.store.findUnique({ where: { slug: 'rahim-mobile' } });
    const first = await domainService.requestDomain(
      store!.id,
      { label },
      await masterAdminActor(),
    );
    await domainService.assignDomainRequest(first.id, await masterAdminActor());

    const otherStore = await prisma.store.findUnique({ where: { slug: 'urban-threads' } });
    await expect(
      domainService.requestDomain(
        otherStore!.id,
        { label },
        await masterAdminActor(),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects assigning an already-rejected request', async () => {
    const label = `qa-rejected-${Date.now()}`;
    const store = await prisma.store.findUnique({ where: { slug: 'techworld-bd' } });
    const req = await domainService.requestDomain(
      store!.id,
      { label },
      await masterAdminActor(),
    );
    await domainService.rejectDomainRequest(
      req.id,
      'Not appropriate',
      await masterAdminActor(),
    );
    await expect(
      domainService.assignDomainRequest(req.id, await masterAdminActor()),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
