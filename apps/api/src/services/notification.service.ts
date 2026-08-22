import { UserRole, UserStatus } from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

/** Shared fan-out — every "notify this audience" helper below is a thin
 * wrapper around this, so there is exactly one place that ever writes to
 * the Notification model. */
async function notifyUsers(
  userIds: string[],
  params: { type: string; title: string; body: string; storeId?: string | null },
) {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      storeId: params.storeId ?? null,
      type: params.type,
      title: params.title,
      body: params.body,
    })),
  });
}

/** Fans an in-app notification out to every active Master Admin — the only
 * "broadcast" audience V1 needs. Uses the existing Notification model
 * (previously defined in schema but never written to). */
export async function notifyMasterAdmins(params: {
  type: string;
  title: string;
  body: string;
  storeId?: string | null;
}) {
  const admins = await prisma.user.findMany({
    where: { role: UserRole.MASTER_ADMIN, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  await notifyUsers(admins.map((a) => a.id), params);
}

/**
 * Fans a notification out to a specific store's billing-capable staff —
 * STORE_OWNER and STORE_MANAGER, the same pair already gated as
 * BILLING_ROLES for every invoice/merchant-payment route in
 * store.routes.ts. Other staff roles (e.g. INVENTORY_MANAGER,
 * CUSTOMER_SUPPORT) have no billing visibility today, so they're
 * deliberately excluded here too — this mirrors an existing access
 * boundary rather than inventing a new one.
 */
export async function notifyStoreStaff(
  storeId: string,
  params: { type: string; title: string; body: string },
) {
  const staff = await prisma.user.findMany({
    where: {
      storeId,
      role: { in: [UserRole.STORE_OWNER, UserRole.STORE_MANAGER] },
      status: UserStatus.ACTIVE,
    },
    select: { id: true },
  });
  await notifyUsers(
    staff.map((s) => s.id),
    { ...params, storeId },
  );
}

export async function listNotifications(
  userId: string,
  params: { unreadOnly?: boolean; page?: number; limit?: number },
) {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 50);
  const where: Record<string, unknown> = { userId };
  if (params.unreadOnly) where.readAt = null;

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return { items, total, unreadCount, page, limit };
}

export async function markNotificationRead(userId: string, id: string) {
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== userId) {
    throw AppError.notFound('Notification not found');
  }
  return prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
