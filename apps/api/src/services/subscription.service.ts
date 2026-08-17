import { ProductStatus } from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

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
 * display must go through this, not a re-hardcoded copy of these numbers. */
export async function limitsFor(planTier: string): Promise<PlanLimits> {
  const pkg = await prisma.package.findUnique({ where: { slug: planTier } });
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

async function storeAndLimits(storeId: string) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { planTier: true },
  });
  if (!store) throw AppError.notFound('Store not found');
  return { store, limits: await limitsFor(store.planTier) };
}

/** The single definition of "active product" for commercial/limit purposes:
 * ACTIVE (published) only. DRAFT and ARCHIVED products are excluded — a
 * merchant iterating on unpublished drafts should never be blocked from
 * publishing because of them. Matches analytics.service's existing
 * `status: 'ACTIVE'` product-count convention. */
export async function getActiveProductCount(storeId: string): Promise<number> {
  return prisma.product.count({ where: { storeId, status: ProductStatus.ACTIVE } });
}

/** Staff count includes the store owner — this preserves existing behavior
 * (the owner has always had `storeId` set and been included in this count);
 * changing that would be a silent, unrequested behavior change. */
export async function getStaffCount(storeId: string): Promise<number> {
  return prisma.user.count({ where: { storeId } });
}

export async function getStorageUsedBytes(storeId: string): Promise<number> {
  const agg = await prisma.mediaAsset.aggregate({
    where: { storeId },
    _sum: { bytes: true },
  });
  return agg._sum.bytes ?? 0;
}

export async function assertWithinProductLimit(storeId: string) {
  const { store, limits } = await storeAndLimits(storeId);
  if (limits.maxProducts === null) return;

  const count = await getActiveProductCount(storeId);
  if (count >= limits.maxProducts) {
    throw AppError.forbidden(
      `You're using ${count}/${limits.maxProducts} active products on the ${limits.planName} plan. Upgrade your plan to add more.`,
      'PRODUCT_LIMIT_REACHED',
    );
  }
  void store;
}

export async function assertWithinStaffLimit(storeId: string) {
  const { store, limits } = await storeAndLimits(storeId);
  if (limits.maxStaff === null) return;

  const count = await getStaffCount(storeId);
  if (count >= limits.maxStaff) {
    throw AppError.forbidden(
      `You're using ${count}/${limits.maxStaff} staff accounts on the ${limits.planName} plan. Upgrade your plan to invite more.`,
      'STAFF_LIMIT_REACHED',
    );
  }
  void store;
}

/** Called before a new media asset is persisted — rejects the upload if it
 * would push the store over its plan's storage allowance. Storage usage is
 * always derived from the trusted `MediaAsset.bytes` column (set once, at
 * upload-registration time, from the real uploaded file size — never a
 * client-supplied "current usage" number), summed live via SQL aggregate;
 * deleting a MediaAsset row frees the allowance immediately since the sum
 * is never cached. */
export async function assertWithinStorageLimit(storeId: string, incomingBytes: number) {
  const { store, limits } = await storeAndLimits(storeId);
  if (limits.storageLimitMb === null) return;

  const usedBytes = await getStorageUsedBytes(storeId);
  const limitBytes = limits.storageLimitMb * 1024 * 1024;
  if (usedBytes + incomingBytes > limitBytes) {
    throw AppError.forbidden(
      `This upload would exceed your ${limits.planName} plan's ${limits.storageLimitMb} MB storage limit. Delete unused media or upgrade your plan.`,
      'STORAGE_LIMIT_REACHED',
    );
  }
  void store;
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
  const { store, limits } = await storeAndLimits(storeId);
  void store;
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
