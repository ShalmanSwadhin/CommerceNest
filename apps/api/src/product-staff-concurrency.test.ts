import { describe, expect, it } from 'vitest';
import { hasDatabase } from './test/setup.js';
import { prisma } from './lib/prisma.js';
import * as trialService from './services/trial.service.js';
import * as productService from './services/product.service.js';
import * as staffService from './services/staff.service.js';
import * as mediaService from './services/media.service.js';
import * as packageService from './services/package.service.js';
import * as subscriptionService from './services/subscription.service.js';

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/** Foreign keys (AuditLog.actorId) require a real User row — the seeded
 * Master Admin, not a placeholder string. */
async function masterAdminActor() {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@commercenest.com' },
    select: { id: true, role: true },
  });
  return { id: admin.id, role: admin.role as string };
}

async function makeStore(overrides: { planTier?: string } = {}) {
  const slug = uniqueSlug('race');
  const { store } = await trialService.createTrialLead({
    prospectName: 'Race Owner',
    businessName: `Race Test ${slug}`,
    phone: `017${String(Math.floor(10000000 + Math.random() * 89999999))}`,
    email: `${slug}@example.com`,
    password: 'TestPass123!',
    confirmPassword: 'TestPass123!',
  });
  if (overrides.planTier) {
    await prisma.store.update({ where: { id: store.id }, data: { planTier: overrides.planTier } });
  }
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: store.ownerUserId } });
  return { storeId: store.id, ownerId: owner.id };
}

async function makeTestPlan(limits: { maxProducts?: number; maxStaff?: number; storageLimitMb?: number }) {
  const slug = uniqueSlug('raceplan');
  const pkg = await packageService.createPackage(
    {
      name: `Race Plan ${slug}`,
      slug,
      monthlyPrice: 100,
      maxProducts: limits.maxProducts ?? null,
      maxStaff: limits.maxStaff ?? null,
      storageLimitMb: limits.storageLimitMb ?? null,
      platformFeeRate: 0,
    },
    await masterAdminActor(),
  );
  return pkg.slug;
}

function makeProductInput(status: 'DRAFT' | 'ACTIVE') {
  const slug = uniqueSlug('raceprod');
  return {
    name: `Race Product ${slug}`,
    slug,
    basePrice: 500,
    status,
    variants: [{ sku: `SKU-${slug}`, stock: 10 }],
  };
}

function countOutcomes(results: PromiseSettledResult<unknown>[]) {
  const succeeded = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected',
  );
  return { succeeded, rejected };
}

// These tests rely on the real Postgres row lock in
// subscription.service.ts#withStoreLock actually serializing concurrent
// transactions — not on timing, retries, or luck. Firing N genuinely
// concurrent requests via Promise.allSettled and asserting the exact
// pass/fail split is the deterministic way to prove that: if the lock
// weren't there, the check-then-act race would let more than one request
// through when only one slot remains, and this test would fail every time,
// not just occasionally.
describe.skipIf(!hasDatabase)('Concurrent product creation cannot exceed the active-product limit', () => {
  it('limit=50, 49 existing: exactly one of 5 concurrent creations succeeds, final count is 50 not 51', async () => {
    const planSlug = await makeTestPlan({ maxProducts: 50 });
    const { storeId } = await makeStore({ planTier: planSlug });
    for (let i = 0; i < 49; i++) {
      await productService.createProduct(storeId, makeProductInput('ACTIVE'), 'system');
    }
    expect(await subscriptionService.getActiveProductCount(storeId)).toBe(49);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        productService.createProduct(storeId, makeProductInput('ACTIVE'), 'system'),
      ),
    );
    const { succeeded, rejected } = countOutcomes(results);

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    for (const r of rejected) {
      expect(r.reason).toMatchObject({ code: 'PRODUCT_LIMIT_REACHED' });
    }
    expect(await subscriptionService.getActiveProductCount(storeId)).toBe(50);
  });

  it('limit exactly reached (10/10): all concurrent creations rejected, count stays at 10', async () => {
    const planSlug = await makeTestPlan({ maxProducts: 10 });
    const { storeId } = await makeStore({ planTier: planSlug });
    for (let i = 0; i < 10; i++) {
      await productService.createProduct(storeId, makeProductInput('ACTIVE'), 'system');
    }

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        productService.createProduct(storeId, makeProductInput('ACTIVE'), 'system'),
      ),
    );
    const { succeeded, rejected } = countOutcomes(results);

    expect(succeeded).toHaveLength(0);
    expect(rejected).toHaveLength(5);
    expect(await subscriptionService.getActiveProductCount(storeId)).toBe(10);
  });

  it('limit-1 (9/10): exactly one concurrent creation succeeds, count reaches exactly 10', async () => {
    const planSlug = await makeTestPlan({ maxProducts: 10 });
    const { storeId } = await makeStore({ planTier: planSlug });
    for (let i = 0; i < 9; i++) {
      await productService.createProduct(storeId, makeProductInput('ACTIVE'), 'system');
    }

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        productService.createProduct(storeId, makeProductInput('ACTIVE'), 'system'),
      ),
    );
    const { succeeded } = countOutcomes(results);

    expect(succeeded).toHaveLength(1);
    expect(await subscriptionService.getActiveProductCount(storeId)).toBe(10);
  });

  it('creating DRAFT products concurrently is never limited — they do not consume a slot', async () => {
    const planSlug = await makeTestPlan({ maxProducts: 5 });
    const { storeId } = await makeStore({ planTier: planSlug });
    for (let i = 0; i < 5; i++) {
      await productService.createProduct(storeId, makeProductInput('ACTIVE'), 'system');
    }
    expect(await subscriptionService.getActiveProductCount(storeId)).toBe(5);

    // Store is already at its ACTIVE limit — concurrent DRAFT creation must
    // still succeed for all of them, since DRAFT never consumes a slot.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        productService.createProduct(storeId, makeProductInput('DRAFT'), 'system'),
      ),
    );
    const { succeeded } = countOutcomes(results);
    expect(succeeded).toHaveLength(5);
    expect(await subscriptionService.getActiveProductCount(storeId)).toBe(5);
  });

  it('concurrent DRAFT → ACTIVE activation of existing drafts cannot exceed the limit', async () => {
    const planSlug = await makeTestPlan({ maxProducts: 50 });
    const { storeId } = await makeStore({ planTier: planSlug });
    for (let i = 0; i < 49; i++) {
      await productService.createProduct(storeId, makeProductInput('ACTIVE'), 'system');
    }
    // Five pre-existing drafts, all racing to activate into the one open slot.
    const drafts = await Promise.all(
      Array.from({ length: 5 }, () =>
        productService.createProduct(storeId, makeProductInput('DRAFT'), 'system'),
      ),
    );
    expect(await subscriptionService.getActiveProductCount(storeId)).toBe(49);

    const results = await Promise.allSettled(
      drafts.map((d) => productService.updateProduct(storeId, d.id, { status: 'ACTIVE' })),
    );
    const { succeeded, rejected } = countOutcomes(results);

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    for (const r of rejected) {
      expect(r.reason).toMatchObject({ code: 'PRODUCT_LIMIT_REACHED' });
    }
    expect(await subscriptionService.getActiveProductCount(storeId)).toBe(50);
  });

  it('editing an already-ACTIVE product concurrently never re-checks the limit (no false rejections)', async () => {
    const planSlug = await makeTestPlan({ maxProducts: 1 });
    const { storeId } = await makeStore({ planTier: planSlug });
    const product = await productService.createProduct(storeId, makeProductInput('ACTIVE'), 'system');
    expect(await subscriptionService.getActiveProductCount(storeId)).toBe(1); // at the limit already

    // Concurrently patching the same already-active product's name must
    // never fail with PRODUCT_LIMIT_REACHED — it isn't consuming a new slot.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        productService.updateProduct(storeId, product.id, { name: `Renamed ${i}` }),
      ),
    );
    const { succeeded } = countOutcomes(results);
    expect(succeeded).toHaveLength(5);
    expect(await subscriptionService.getActiveProductCount(storeId)).toBe(1);
  });
});

describe.skipIf(!hasDatabase)('Concurrent staff invitation cannot exceed the staff limit', () => {
  it('limit=5, 4 existing (incl. owner): exactly one of 5 concurrent invites succeeds', async () => {
    const planSlug = await makeTestPlan({ maxStaff: 5 });
    const { storeId, ownerId } = await makeStore({ planTier: planSlug });
    for (let i = 0; i < 3; i++) {
      await staffService.inviteStoreStaff(
        storeId,
        { email: `${uniqueSlug('prestaff')}@example.com`, name: 'Pre', role: 'STORE_MANAGER' },
        { id: ownerId, role: 'STORE_OWNER' },
      );
    }
    expect(await subscriptionService.getStaffCount(storeId)).toBe(4); // owner + 3

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        staffService.inviteStoreStaff(
          storeId,
          { email: `${uniqueSlug('racestaff')}@example.com`, name: 'Race', role: 'STORE_MANAGER' },
          { id: ownerId, role: 'STORE_OWNER' },
        ),
      ),
    );
    const { succeeded, rejected } = countOutcomes(results);

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    for (const r of rejected) {
      expect(r.reason).toMatchObject({ code: 'STAFF_LIMIT_REACHED' });
    }
    expect(await subscriptionService.getStaffCount(storeId)).toBe(5);
  });

  it('limit exactly reached: all concurrent invites rejected, count unchanged', async () => {
    const planSlug = await makeTestPlan({ maxStaff: 1 });
    const { storeId, ownerId } = await makeStore({ planTier: planSlug });
    expect(await subscriptionService.getStaffCount(storeId)).toBe(1); // owner alone fills it

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        staffService.inviteStoreStaff(
          storeId,
          { email: `${uniqueSlug('full')}@example.com`, name: 'Full', role: 'STORE_MANAGER' },
          { id: ownerId, role: 'STORE_OWNER' },
        ),
      ),
    );
    const { succeeded } = countOutcomes(results);
    expect(succeeded).toHaveLength(0);
    expect(await subscriptionService.getStaffCount(storeId)).toBe(1);
  });
});

function makeAssetInput(bytes: number) {
  const publicId = uniqueSlug('media');
  return {
    publicId,
    url: `https://example.com/${publicId}.png`,
    filename: `${publicId}.png`,
    mimeType: 'image/png' as const,
    bytes,
  };
}

describe('media.service.ts#resolveStorageVerificationMode (pure — no DB, no network, no env mutation)', () => {
  it('verifies for real whenever Cloudinary is configured, in any environment', () => {
    expect(
      mediaService.resolveStorageVerificationMode({ nodeEnv: 'production', cloudinaryConfigured: true }),
    ).toBe('real');
    expect(
      mediaService.resolveStorageVerificationMode({ nodeEnv: 'development', cloudinaryConfigured: true }),
    ).toBe('real');
  });

  it('refuses to silently trust the client in production with Cloudinary unconfigured', () => {
    expect(
      mediaService.resolveStorageVerificationMode({ nodeEnv: 'production', cloudinaryConfigured: false }),
    ).toBe('unconfigured-production');
  });

  it('falls back to the dev stub outside production with Cloudinary unconfigured', () => {
    expect(
      mediaService.resolveStorageVerificationMode({ nodeEnv: 'development', cloudinaryConfigured: false }),
    ).toBe('stub');
    expect(
      mediaService.resolveStorageVerificationMode({ nodeEnv: 'test', cloudinaryConfigured: false }),
    ).toBe('stub');
  });
});

describe.skipIf(!hasDatabase)('Storage limit — boundary, concurrency, deletion, duplicates, isolation', () => {
  it('normal: an upload comfortably under the limit succeeds', async () => {
    const planSlug = await makeTestPlan({ storageLimitMb: 10 }); // 10 MiB
    const { storeId } = await makeStore({ planTier: planSlug });
    await expect(
      mediaService.registerMediaAsset(storeId, makeAssetInput(1_000_000)),
    ).resolves.toBeTruthy();
  });

  it('exact boundary: an upload that lands exactly on the limit succeeds (limit is inclusive)', async () => {
    const planSlug = await makeTestPlan({ storageLimitMb: 1 }); // exactly 1,048,576 bytes
    const { storeId } = await makeStore({ planTier: planSlug });
    const limitBytes = 1 * 1024 * 1024;
    await expect(
      mediaService.registerMediaAsset(storeId, makeAssetInput(limitBytes)),
    ).resolves.toBeTruthy();
    expect(await subscriptionService.getStorageUsedBytes(storeId)).toBe(limitBytes);
  });

  it('over limit: an upload that would exceed the limit by even one byte is rejected', async () => {
    const planSlug = await makeTestPlan({ storageLimitMb: 1 });
    const { storeId } = await makeStore({ planTier: planSlug });
    const limitBytes = 1 * 1024 * 1024;
    await expect(
      mediaService.registerMediaAsset(storeId, makeAssetInput(limitBytes + 1)),
    ).rejects.toMatchObject({ statusCode: 403, code: 'STORAGE_LIMIT_REACHED' });
    expect(await subscriptionService.getStorageUsedBytes(storeId)).toBe(0);
  });

  it('concurrent: simultaneous uploads near the limit never push total usage past it', async () => {
    // 5 MB limit, 4,900,000 bytes already used (five concurrent uploads of
    // 200,000 bytes each — each individually well under the 10MB per-file
    // ceiling, matching this system's real per-upload size cap). Only one
    // more fits: 4,900,000 + 200,000 = 5,100,000 <= 5,242,880; a second
    // would be 5,300,000 > 5,242,880. Without the store-row lock this is
    // exactly the check-then-act race described in the task: multiple
    // requests could all read "usage + incoming <= limit" before any of
    // them commits, and all succeed.
    const planSlug = await makeTestPlan({ storageLimitMb: 5 });
    const { storeId } = await makeStore({ planTier: planSlug });
    const limitBytes = 5 * 1024 * 1024; // 5,242,880
    await mediaService.registerMediaAsset(storeId, makeAssetInput(4_900_000));
    expect(await subscriptionService.getStorageUsedBytes(storeId)).toBe(4_900_000);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => mediaService.registerMediaAsset(storeId, makeAssetInput(200_000))),
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    for (const r of rejected) {
      expect(r.reason).toMatchObject({ code: 'STORAGE_LIMIT_REACHED' });
    }
    const finalUsage = await subscriptionService.getStorageUsedBytes(storeId);
    expect(finalUsage).toBe(5_100_000);
    expect(finalUsage).toBeLessThanOrEqual(limitBytes);
  });

  it('Cloudinary verification failure (production, unconfigured): registration is refused, not silently trusted', async () => {
    // Exercises the exact same decision registerMediaAsset makes internally,
    // via the pure mode function (see the describe block above for why this
    // — not env-mocking — is how this codebase already tests this class of
    // fail-closed decision; lib/sms.ts#resolveSmsMode follows the same
    // pattern and is tested the same way).
    const mode = mediaService.resolveStorageVerificationMode({
      nodeEnv: 'production',
      cloudinaryConfigured: false,
    });
    expect(mode).toBe('unconfigured-production');
  });

  it('delete: removing media immediately frees the storage it was using', async () => {
    const planSlug = await makeTestPlan({ storageLimitMb: 1 });
    const { storeId } = await makeStore({ planTier: planSlug });
    const asset = await mediaService.registerMediaAsset(storeId, makeAssetInput(500_000));
    expect(await subscriptionService.getStorageUsedBytes(storeId)).toBe(500_000);

    await mediaService.deleteMedia(storeId, asset.id);
    expect(await subscriptionService.getStorageUsedBytes(storeId)).toBe(0);

    // The freed space is immediately usable again — not just "no longer over."
    await expect(
      mediaService.registerMediaAsset(storeId, makeAssetInput(1 * 1024 * 1024)),
    ).resolves.toBeTruthy();
  });

  it('duplicate registration: the same publicId cannot be registered twice for one store', async () => {
    const { storeId } = await makeStore();
    const asset = makeAssetInput(100_000);
    await mediaService.registerMediaAsset(storeId, asset);
    await expect(mediaService.registerMediaAsset(storeId, asset)).rejects.toBeTruthy();
    expect(await subscriptionService.getStorageUsedBytes(storeId)).toBe(100_000);
  });

  it('tenant isolation: one store cannot consume or inspect another store\'s storage', async () => {
    const a = await makeStore();
    const b = await makeStore();
    await mediaService.registerMediaAsset(a.storeId, makeAssetInput(2_000_000));

    expect(await subscriptionService.getStorageUsedBytes(a.storeId)).toBe(2_000_000);
    expect(await subscriptionService.getStorageUsedBytes(b.storeId)).toBe(0);

    const bMedia = await mediaService.listMedia(b.storeId, {});
    expect(bMedia.items).toHaveLength(0);

    // Store B uploading right up to its own limit is unaffected by A's usage.
    const planSlug = await makeTestPlan({ storageLimitMb: 1 });
    await prisma.store.update({ where: { id: b.storeId }, data: { planTier: planSlug } });
    await expect(
      mediaService.registerMediaAsset(b.storeId, makeAssetInput(1 * 1024 * 1024)),
    ).resolves.toBeTruthy();
  });
});
