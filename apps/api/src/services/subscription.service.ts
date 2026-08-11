import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

/**
 * V1 plan-tier limits. Deliberately simple (product count, staff seats) —
 * no billing/metering infrastructure, just soft caps enforced at the two
 * places merchants would otherwise grow past what their plan is meant for.
 * `null` means unlimited.
 */
const PLAN_LIMITS: Record<string, { maxProducts: number | null; maxStaff: number | null }> = {
  starter: { maxProducts: 50, maxStaff: 3 },
  growth: { maxProducts: 500, maxStaff: 10 },
  pro: { maxProducts: null, maxStaff: null },
};

function limitsFor(planTier: string) {
  return PLAN_LIMITS[planTier] ?? PLAN_LIMITS.starter!;
}

export async function assertWithinProductLimit(storeId: string) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { planTier: true },
  });
  if (!store) throw AppError.notFound('Store not found');
  const { maxProducts } = limitsFor(store.planTier);
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
  const { maxStaff } = limitsFor(store.planTier);
  if (maxStaff === null) return;

  const count = await prisma.user.count({ where: { storeId } });
  if (count >= maxStaff) {
    throw AppError.forbidden(
      `Your ${store.planTier} plan allows up to ${maxStaff} staff accounts. Upgrade your plan to invite more.`,
      'PLAN_LIMIT_EXCEEDED',
    );
  }
}

export function getPlanLimits(planTier: string) {
  return limitsFor(planTier);
}
