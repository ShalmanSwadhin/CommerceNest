import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { hasDatabase } from './test/setup.js';
import { initRedis } from './lib/redis.js';

const app = createApp();

async function loginAs(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

describe.skipIf(!hasDatabase)('Theme permission model — Master Admin only', () => {
  let ownerToken: string;
  let masterToken: string;
  let storeId: string;

  beforeAll(async () => {
    await initRedis();
    const loginOwner = await request(app).post('/api/auth/login').send({
      email: 'owner@techworld.bd',
      password: 'Owner123!',
    });
    ownerToken = loginOwner.body.accessToken;
    storeId = loginOwner.body.user.storeId;
    masterToken = await loginAs('admin@commercenest.com', 'Admin123!');
  });

  it('Store Owner CAN read the current theme (read-only info page)', async () => {
    const res = await request(app)
      .get(`/api/store/${storeId}/theme/current`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
  });

  it('Store Owner is FORBIDDEN from saving a theme draft', async () => {
    const res = await request(app)
      .put(`/api/store/${storeId}/theme/draft`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ layout: { sections: [] }, themeSettings: {} });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('Store Owner is FORBIDDEN from publishing a theme', async () => {
    const res = await request(app)
      .post(`/api/store/${storeId}/theme/publish`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it('Store Owner is FORBIDDEN from listing theme version history', async () => {
    const res = await request(app)
      .get(`/api/store/${storeId}/theme/versions`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it('Store Owner is FORBIDDEN from restoring a theme version', async () => {
    const res = await request(app)
      .post(`/api/store/${storeId}/theme/versions/nonexistent-id/restore`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it('Store Owner CAN submit a theme customization request (support ticket)', async () => {
    const res = await request(app)
      .post(`/api/store/${storeId}/theme/customization-request`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ message: 'Please redesign our hero section.' });
    expect(res.status).toBe(201);
    expect(res.body.subject).toBe('Theme customization request');
  });

  it('Store Owner is FORBIDDEN from listing prebuilt theme presets (Master Admin only)', async () => {
    const res = await request(app)
      .get('/api/admin/theme-presets')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it('Master Admin CAN save a draft, publish, list versions, and see presets', async () => {
    const draft = await request(app)
      .put(`/api/store/${storeId}/theme/draft`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send({ layout: { sections: [] }, themeSettings: {} });
    expect(draft.status).toBe(200);

    const versions = await request(app)
      .get(`/api/store/${storeId}/theme/versions`)
      .set('Authorization', `Bearer ${masterToken}`);
    expect(versions.status).toBe(200);

    const presets = await request(app)
      .get('/api/admin/theme-presets')
      .set('Authorization', `Bearer ${masterToken}`);
    expect(presets.status).toBe(200);
    expect(Array.isArray(presets.body.items)).toBe(true);
  });

  it('an unauthenticated request to any theme mutation endpoint is rejected', async () => {
    const res = await request(app)
      .put(`/api/store/${storeId}/theme/draft`)
      .send({ layout: { sections: [] }, themeSettings: {} });
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!hasDatabase)('Trial system', () => {
  let masterToken: string;
  let ownerToken: string;

  beforeAll(async () => {
    await initRedis();
    masterToken = await loginAs('admin@commercenest.com', 'Admin123!');
    ownerToken = await loginAs('owner@techworld.bd', 'Owner123!');
  });

  it('a public trial request provisions a real, isolated store with a working URL', async () => {
    const email = `trial-test-${Date.now()}@example.com`;
    const res = await request(app).post('/api/public/trial-leads').send({
      prospectName: 'Test Prospect',
      businessName: 'Test Trial Business',
      phone: '01712345678',
      email,
      category: 'Electronics',
    });
    expect(res.status).toBe(201);
    expect(res.body.trialUrl).toMatch(/^https?:\/\/trial-/);
    expect(res.body.businessName).toBe('Test Trial Business');

    // The lead must show up in the Master Admin's queue immediately.
    const leads = await request(app)
      .get('/api/admin/trial-leads')
      .set('Authorization', `Bearer ${masterToken}`)
      .query({ search: email });
    expect(leads.status).toBe(200);
    const found = leads.body.items.find((l: { email: string }) => l.email === email);
    expect(found).toBeTruthy();
    expect(found.status).toBe('TRIAL_ACTIVE');
    expect(found.store).toBeTruthy();
  });

  it('Store Admin (non-Master-Admin) cannot list, extend, convert, or reject trial leads', async () => {
    const list = await request(app)
      .get('/api/admin/trial-leads')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.status).toBe(403);

    const extend = await request(app)
      .post('/api/admin/trial-leads/some-id/extend')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ additionalDays: 7 });
    expect(extend.status).toBe(403);

    const convert = await request(app)
      .post('/api/admin/trial-leads/some-id/convert')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(convert.status).toBe(403);

    const reject = await request(app)
      .post('/api/admin/trial-leads/some-id/reject')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(reject.status).toBe(403);
  });

  it('rejects invalid trial request input (missing required fields)', async () => {
    const res = await request(app).post('/api/public/trial-leads').send({
      prospectName: 'A',
    });
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!hasDatabase)('Pricing packages', () => {
  let ownerToken: string;
  let masterToken: string;

  beforeAll(async () => {
    await initRedis();
    ownerToken = await loginAs('owner@techworld.bd', 'Owner123!');
    masterToken = await loginAs('admin@commercenest.com', 'Admin123!');
  });

  it('public pricing endpoint returns only active packages with no internal fields', async () => {
    const res = await request(app).get('/api/public/packages');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const pkg of res.body.items) {
      expect(pkg.active).toBe(true);
    }
  });

  it('Store Admin cannot create, edit, or delete packages (Master Admin only)', async () => {
    const create = await request(app)
      .post('/api/admin/packages')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Hacked', slug: 'hacked', monthlyPrice: 1 });
    expect(create.status).toBe(403);

    const list = await request(app)
      .get('/api/admin/packages')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.status).toBe(403);
  });

  it('Master Admin can manage packages end-to-end', async () => {
    const slug = `test-pkg-${Date.now()}`;
    const create = await request(app)
      .post('/api/admin/packages')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({ name: 'Test Package', slug, monthlyPrice: 1234, features: ['A feature'] });
    expect(create.status).toBe(201);

    const update = await request(app)
      .patch(`/api/admin/packages/${create.body.id}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send({ monthlyPrice: 4321, active: false });
    expect(update.status).toBe(200);
    expect(Number(update.body.monthlyPrice)).toBe(4321);

    // Deactivated packages must not appear on the public pricing page.
    const publicList = await request(app).get('/api/public/packages');
    expect(publicList.body.items.some((p: { slug: string }) => p.slug === slug)).toBe(false);

    const del = await request(app)
      .delete(`/api/admin/packages/${create.body.id}`)
      .set('Authorization', `Bearer ${masterToken}`);
    expect(del.status).toBe(200);
  });
});
