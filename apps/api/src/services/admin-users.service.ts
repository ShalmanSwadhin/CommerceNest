import { z } from 'zod';
import {
  UserRole,
  UserStatus,
  type UserRole as UserRoleType,
} from '@commercenest/types';
import type { Prisma } from '@commercenest/prisma';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog } from './audit.service.js';

const staffRoles = [
  UserRole.STORE_OWNER,
  UserRole.STORE_MANAGER,
  UserRole.INVENTORY_MANAGER,
  UserRole.ORDER_MANAGER,
  UserRole.CUSTOMER_SUPPORT,
] as const;

const patchUserSchema = z
  .object({
    status: z
      .enum([UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.INVITED])
      .optional(),
    role: z.enum(staffRoles).optional(),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export async function listStaffUsers(params: {
  role?: string;
  storeId?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 50, 100);
  const where: Prisma.UserWhereInput = {
    role: { not: UserRole.MASTER_ADMIN },
  };

  if (params.role) where.role = params.role as UserRoleType;
  if (params.storeId) where.storeId = params.storeId;
  if (params.search) {
    where.OR = [
      { email: { contains: params.search, mode: 'insensitive' } },
      { name: { contains: params.search, mode: 'insensitive' } },
      { phone: { contains: params.search } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        storeId: true,
        createdAt: true,
        store: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, total, page, limit };
}

export async function patchStaffUser(
  userId: string,
  input: unknown,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const data = patchUserSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('User not found');
  if (user.role === UserRole.MASTER_ADMIN) {
    throw AppError.forbidden('Cannot modify Master Admin via this endpoint');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      status: true,
      storeId: true,
    },
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'USER_UPDATED',
    targetType: 'User',
    targetId: userId,
    storeId: updated.storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { changes: data },
  });

  return updated;
}
