import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

/**
 * Fallback limits used only when a store's planTier doesn't match any
 * Package row (e.g. the package was deleted, or a fresh install hasn't
 * seeded packages yet). The Package table — Master Admin-editable via
 * /admin/packages — is the actual source of truth; this is a safety net,
 * not the primary mechanism. `null` means unlimited.
 */
const FALLBACK_LIMITS: Record<string, { maxProducts: number | null; maxStaff: number | null }> = {
  starter: { maxProducts: 50, maxStaff: 3 },
  business: { maxProducts: 500, maxStaff: 10 },
  pro: { maxProducts: null, maxStaff: null },
};

async function limitsFor(planTier: string) {
  const pkg = await prisma.package.findUnique({ where: { slug: planTier } });
  if (pkg) {
    return { maxProducts: pkg.maxProducts, maxStaff: pkg.maxStaff };
  }
  return FALLBACK_LIMITS[planTier] ?? FALLBACK_LIMITS.starter!;
}

export async function assertWithinProductLimit(storeId: string) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { planTier: true },
  });
  if (!store) throw AppError.notFound('Store not found');
  const { maxProducts } = await limitsFor(store.planTier);
  if (maxProducts === null) return;

  const count = await prisma.product.count({ where: { storeId } });
  if (count >= maxProducts) {
    throw AppError.forbidden(
      `Your ${store.planTier} plan allows up to ${maxProducts} products. Upgrade your plan to add more.`,
      'PLAN_LIMIT_EXCEEDED',
    );
  }
}

export async function assertWithinStaffLimit(storeId: string) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { planTier: true },
  });
  if (!store) throw AppError.notFound('Store not found');
  const { maxStaff } = await limitsFor(store.planTier);
  if (maxStaff === null) return;

  const count = await prisma.user.count({ where: { storeId } });
  if (count >= maxStaff) {
    throw AppError.forbidden(
      `Your ${store.planTier} plan allows up to ${maxStaff} staff accounts. Upgrade your plan to invite more.`,
      'PLAN_LIMIT_EXCEEDED',
    );
  }
}

export async function getPlanLimits(planTier: string) {
  return limitsFor(planTier);
}
