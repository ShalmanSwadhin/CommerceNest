import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { hasDatabase } from './test/setup.js';
import { prisma } from './lib/prisma.js';
import * as trialService from './services/trial.service.js';
import * as storeService from './services/store.service.js';
import { backfillMissingCmsDefaults } from './services/cms-defaults.service.js';

const app = createApp();

const EXPECTED_KEYS = ['about', 'contact', 'faq', 'privacy', 'returns', 'shipping', 'terms'].sort();

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function masterAdminActor() {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@commercenest.com' },
    select: { id: true, role: true },
  });
  return { id: admin.id, role: admin.role as string };
}

describe.skipIf(!hasDatabase)('Default CMS content seeded on store creation', () => {
  it('a trial signup (createTrialLead) gets all 7 starter CMS pages, personalized with the store name, immediately editable and publicly readable', async () => {
    const slug = uniqueSlug('cmsseed');
    const businessName = `CMS Seed Trial ${slug}`;
    const { store } = await trialService.createTrialLead({
      prospectName: 'Seed Tester',
      businessName,
      phone: `019${String(Math.floor(10000000 + Math.random() * 89999999))}`,
      email: `${slug}@example.com`,
      password: 'TestPass123!',
      confirmPassword: 'TestPass123!',
    });

    const blocks = await prisma.cmsContentBlock.findMany({
      where: { storeId: store.id },
      orderBy: { key: 'asc' },
    });
    expect(blocks.map((b) => b.key).sort()).toEqual(EXPECTED_KEYS);

    const about = blocks.find((b) => b.key === 'about')!;
    const fields = about.fields as { title: string; body: string };
    expect(fields.title).toContain(businessName);
    expect(fields.body.length).toBeGreaterThan(50); // real starter copy, not a stub

    // Never fabricates real-world facts — only the 7 text pages get seeded.
    const contactInfo = blocks.find((b) => b.key === 'contact-info');
    const socialLinks = blocks.find((b) => b.key === 'social-links');
    expect(contactInfo).toBeUndefined();
    expect(socialLinks).toBeUndefined();
  });

  it('a Master-Admin-created store (createStore) gets the same 7 starter pages', async () => {
    const slug = uniqueSlug('cmsseedadmin');
    const result = await storeService.createStore(
      {
        name: `CMS Seed Admin ${slug}`,
        slug,
        ownerEmail: `${slug}@example.com`,
        ownerName: 'Admin-Created Owner',
        category: 'General',
        planTier: 'starter',
      },
      await masterAdminActor(),
    );

    const blocks = await prisma.cmsContentBlock.findMany({ where: { storeId: result.store.id } });
    expect(blocks.map((b) => b.key).sort()).toEqual(EXPECTED_KEYS);
  });

  it('the seeded "about" page is what the storefront actually serves at /pages/about — the exact link both themes\' footers already point to', async () => {
    const slug = uniqueSlug('cmsseedread');
    const { store } = await trialService.createTrialLead({
      prospectName: 'Seed Tester',
      businessName: `CMS Seed Read ${slug}`,
      phone: `018${String(Math.floor(10000000 + Math.random() * 89999999))}`,
      email: `${slug}@example.com`,
      password: 'TestPass123!',
      confirmPassword: 'TestPass123!',
    });

    const res = await request(app).get(`/api/storefront/${store.slug}/cms/about`);
    expect(res.status).toBe(200);
    expect(res.body.title).toContain('CMS Seed Read');
    expect(res.body.body).toContain('quality products');
  });
});

describe.skipIf(!hasDatabase)('backfillMissingCmsDefaults — fixing a store that existed before this feature', () => {
  it('fills in only the missing keys, never touches a key that already exists (even a merchant-customized one)', async () => {
    const slug = uniqueSlug('cmsbackfill');
    const { store } = await trialService.createTrialLead({
      prospectName: 'Backfill Tester',
      businessName: `CMS Backfill ${slug}`,
      phone: `019${String(Math.floor(10000000 + Math.random() * 89999999))}`,
      email: `${slug}@example.com`,
      password: 'TestPass123!',
      confirmPassword: 'TestPass123!',
    });

    // Simulate a pre-existing store from before this feature existed:
    // delete all but "about", and customize "about" so we can prove it
    // survives untouched.
    await prisma.cmsContentBlock.deleteMany({ where: { storeId: store.id, key: { not: 'about' } } });
    await prisma.cmsContentBlock.update({
      where: { storeId_key: { storeId: store.id, key: 'about' } },
      data: { fields: { title: 'My Custom About Title', body: 'My custom body.', sortOrder: 0 } },
    });

    const created = await backfillMissingCmsDefaults(store.id);
    expect(created.sort()).toEqual(EXPECTED_KEYS.filter((k) => k !== 'about'));

    const blocks = await prisma.cmsContentBlock.findMany({ where: { storeId: store.id } });
    expect(blocks.map((b) => b.key).sort()).toEqual(EXPECTED_KEYS);
    const about = blocks.find((b) => b.key === 'about')!.fields as { title: string };
    expect(about.title).toBe('My Custom About Title'); // untouched

    // Calling it again is a no-op — nothing left to fill in.
    const secondCall = await backfillMissingCmsDefaults(store.id);
    expect(secondCall).toEqual([]);
  });
});
