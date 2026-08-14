import { UserRole, UserStatus } from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

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
  if (admins.length === 0) return;

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      storeId: params.storeId ?? null,
      type: params.type,
      title: params.title,
      body: params.body,
    })),
  });
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
