import type { Prisma } from '@commercenest/prisma';
import { ProductStatus } from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Fallback limits used only when a store's planTier doesn't match any
 * Package row (e.g. the package was deleted, or a fresh install hasn't
 * seeded packages yet). The Package table — Master Admin-editable via
 * /admin/packages — is the actual source of truth; this is a safety net,
 * not the primary mechanism. `null` means unlimited.
 */
const FALLBACK_LIMITS: Record<
  string,
  { maxProducts: number | null; maxStaff: number | null; storageLimitMb: number | null; platformFeeRate: number }
> = {
  starter: { maxProducts: 50, maxStaff: 2, storageLimitMb: 1024, platformFeeRate: 0.005 },
  business: { maxProducts: 250, maxStaff: 5, storageLimitMb: 5120, platformFeeRate: 0.004 },
  pro: { maxProducts: 1000, maxStaff: 15, storageLimitMb: 20480, platformFeeRate: 0.0025 },
};
const DEFAULT_FALLBACK = FALLBACK_LIMITS.starter!;

export interface PlanLimits {
  planTier: string;
  planName: string;
  maxProducts: number | null;
  maxStaff: number | null;
  storageLimitMb: number | null;
  platformFeeRate: number;
}

/** Centralized plan-limit lookup — every enforcement check and every usage
 * display must go through this, not a re-hardcoded copy of these numbers.
 * Accepts an optional transaction client so callers holding a store-row
 * lock (see `withStoreLock`) can read through the same transaction. */
export async function limitsFor(planTier: string, db: Db = prisma): Promise<PlanLimits> {
  const pkg = await db.package.findUnique({ where: { slug: planTier } });
  if (pkg) {
    return {
      planTier,
      planName: pkg.name,
      maxProducts: pkg.maxProducts,
      maxStaff: pkg.maxStaff,
      storageLimitMb: pkg.storageLimitMb,
      platformFeeRate: Number(pkg.platformFeeRate),
    };
  }
  const fallback = FALLBACK_LIMITS[planTier] ?? DEFAULT_FALLBACK;
  return { planTier, planName: planTier, ...fallback };
}

async function storeAndLimits(storeId: string, db: Db = prisma) {
  const store = await db.store.findUnique({
    where: { id: storeId },
    select: { planTier: true },
  });
  if (!store) throw AppError.notFound('Store not found');
  return { store, limits: await limitsFor(store.planTier, db) };
}

/** The single definition of "active product" for commercial/limit purposes:
 * ACTIVE (published) only. DRAFT and ARCHIVED products are excluded — a
 * merchant iterating on unpublished drafts should never be blocked from
 * publishing because of them. Matches analytics.service's existing
 * `status: 'ACTIVE'` product-count convention. */
export async function getActiveProductCount(storeId: string, db: Db = prisma): Promise<number> {
  return db.product.count({ where: { storeId, status: ProductStatus.ACTIVE } });
}

/** Staff count includes the store owner — this preserves existing behavior
 * (the owner has always had `storeId` set and been included in this count);
 * changing that would be a silent, unrequested behavior change. */
export async function getStaffCount(storeId: string, db: Db = prisma): Promise<number> {
  return db.user.count({ where: { storeId } });
}

export async function getStorageUsedBytes(storeId: string, db: Db = prisma): Promise<number> {
  const agg = await db.mediaAsset.aggregate({
    where: { storeId },
    _sum: { bytes: true },
  });
  return agg._sum.bytes ?? 0;
}

// ---------------------------------------------------------------------------
// Concurrency-safe enforcement.
//
// A plain "COUNT then INSERT" is a check-then-act race: two concurrent
// requests can both read count=49 against a limit of 50, both pass, and both
// insert — landing at 51. Postgres serializable transactions would work but
// need a retry loop on serialization failure; the simpler, equally-correct
// fix here is `SELECT ... FOR UPDATE` on the store's own row before
// checking. Row locks are held for the transaction's lifetime, so a second
// concurrent transaction trying to lock the same store row simply waits
// until the first commits (or rolls back) — at which point it re-reads the
// now-current count. This serializes limit-sensitive writes per store
// (never across stores, since each locks a different row), which is exactly
// the granularity needed.
// ---------------------------------------------------------------------------

/** Runs `fn` inside a transaction that holds an exclusive row lock on the
 * given store for the transaction's duration. Any limit check + write that
 * must be race-free (product activation, staff invite) goes through this. */
export async function withStoreLock<T>(
  storeId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "stores" WHERE id = ${storeId} FOR UPDATE`;
    return fn(tx);
  });
}

/** Must be called with a `tx` obtained from `withStoreLock` for the same
 * `storeId` — the lock is what makes the count-then-compare safe. */
export async function assertWithinProductLimitTx(tx: Prisma.TransactionClient, storeId: string) {
  const { limits } = await storeAndLimits(storeId, tx);
  if (limits.maxProducts === null) return;

  const count = await getActiveProductCount(storeId, tx);
  if (count >= limits.maxProducts) {
    throw AppError.forbidden(
      `You're using ${count}/${limits.maxProducts} active products on the ${limits.planName} plan. Upgrade your plan to add more.`,
      'PRODUCT_LIMIT_REACHED',
    );
  }
}

/** Must be called with a `tx` obtained from `withStoreLock` for the same
 * `storeId` — the lock is what makes the count-then-compare safe. */
export async function assertWithinStaffLimitTx(tx: Prisma.TransactionClient, storeId: string) {
  const { limits } = await storeAndLimits(storeId, tx);
  if (limits.maxStaff === null) return;

  const count = await getStaffCount(storeId, tx);
  if (count >= limits.maxStaff) {
    throw AppError.forbidden(
      `You're using ${count}/${limits.maxStaff} staff accounts on the ${limits.planName} plan. Upgrade your plan to invite more.`,
      'STAFF_LIMIT_REACHED',
    );
  }
}

/** Must be called with a `tx` obtained from `withStoreLock` for the same
 * `storeId` — the lock is what makes the count-then-compare safe. Storage
 * usage is derived from `MediaAsset.bytes`, summed live via SQL aggregate;
 * deleting a MediaAsset row frees the allowance immediately since the sum is
 * never cached. Callers must resolve `incomingBytes` from a trusted source
 * (e.g. a verified Cloudinary lookup) *before* acquiring the lock — this
 * function only does the check-and-compare, never a network call, so the
 * lock is held for a short DB-only transaction, not across an external
 * request (see media.service.ts#registerMediaAsset). */
export async function assertWithinStorageLimitTx(
  tx: Prisma.TransactionClient,
  storeId: string,
  incomingBytes: number,
) {
  const { limits } = await storeAndLimits(storeId, tx);
  if (limits.storageLimitMb === null) return;

  const usedBytes = await getStorageUsedBytes(storeId, tx);
  const limitBytes = limits.storageLimitMb * 1024 * 1024;
  if (usedBytes + incomingBytes > limitBytes) {
    throw AppError.forbidden(
      `This upload would exceed your ${limits.planName} plan's ${limits.storageLimitMb} MB storage limit. Delete unused media or upgrade your plan.`,
      'STORAGE_LIMIT_REACHED',
    );
  }
}

export async function getPlanLimits(planTier: string) {
  return limitsFor(planTier);
}

export interface StoreUsage {
  planTier: string;
  planName: string;
  products: { used: number; limit: number | null };
  staff: { used: number; limit: number | null };
  storage: { usedBytes: number; limitBytes: number | null };
}

/** One aggregate view of a store's current resource usage against its plan
 * — the shared basis for both the Store Admin "Plan & Usage" page and the
 * Master Admin per-store usage view, so the two can never disagree. */
export async function getStoreUsage(storeId: string): Promise<StoreUsage> {
  const { limits } = await storeAndLimits(storeId);
  const [products, staff, storageBytes] = await Promise.all([
    getActiveProductCount(storeId),
    getStaffCount(storeId),
    getStorageUsedBytes(storeId),
  ]);
  return {
    planTier: limits.planTier,
    planName: limits.planName,
    products: { used: products, limit: limits.maxProducts },
    staff: { used: staff, limit: limits.maxStaff },
    storage: {
      usedBytes: storageBytes,
      limitBytes: limits.storageLimitMb !== null ? limits.storageLimitMb * 1024 * 1024 : null,
    },
  };
}
