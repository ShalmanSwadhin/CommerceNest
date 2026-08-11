import { z } from 'zod';
import {
  UserRole,
  UserStatus,
  bangladeshPhoneSchema,
  emailSchema,
} from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { emitAfterCommit } from '../events/emit.js';
import { createInviteToken } from './auth.service.js';
import { writeAuditLog } from './audit.service.js';
import { env } from '../lib/env.js';
import { assertWithinStaffLimit } from './subscription.service.js';

const inviteSchema = z
  .object({
    email: emailSchema,
    name: z.string().trim().min(1).max(120),
    phone: bangladeshPhoneSchema.optional(),
    role: z.enum([
      UserRole.STORE_MANAGER,
      UserRole.INVENTORY_MANAGER,
      UserRole.ORDER_MANAGER,
      UserRole.CUSTOMER_SUPPORT,
    ]),
  })
  .strict();

const patchStaffSchema = z
  .object({
    role: z
      .enum([
        UserRole.STORE_MANAGER,
        UserRole.INVENTORY_MANAGER,
        UserRole.ORDER_MANAGER,
        UserRole.CUSTOMER_SUPPORT,
      ])
      .optional(),
    status: z
      .enum([UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.INVITED])
      .optional(),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export async function listStoreStaff(storeId: string) {
  const items = await prisma.user.findMany({
    where: { storeId },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });
  return { items };
}

export async function inviteStoreStaff(
  storeId: string,
  input: unknown,
  actor: {
    id: string;
    role: string;
    impersonationSessionId?: string;
    ip?: string;
    userAgent?: string;
  },
) {
  const data = inviteSchema.parse(input);

  await assertWithinStaffLimit(storeId);

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existing) {
    throw AppError.conflict('Email already registered');
  }

  const invite = await createInviteToken();
  const user = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      phone: data.phone,
      role: data.role,
      status: UserStatus.INVITED,
      storeId,
      inviteTokenHash: invite.hash,
      inviteExpiresAt: invite.expiresAt,
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
    action: 'STAFF_INVITED',
    targetType: 'User',
    targetId: user.id,
    storeId,
    impersonationSessionId: actor.impersonationSessionId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { email: user.email, role: user.role },
  });

  emitAfterCommit('UserRegistered', {
    storeId,
    actorId: actor.id,
    payload: {
      userId: user.id,
      role: user.role as never,
      storeId,
      email: user.email,
      invitedByUserId: actor.id,
    },
  });

  return {
    user,
    inviteToken:
      env.NODE_ENV === 'development' ? invite.token : undefined,
  };
}

export async function patchStoreStaff(
  storeId: string,
  userId: string,
  input: unknown,
  actor: {
    id: string;
    role: string;
    impersonationSessionId?: string;
    ip?: string;
    userAgent?: string;
  },
) {
  const data = patchStaffSchema.parse(input);
  const user = await prisma.user.findFirst({
    where: { id: userId, storeId },
  });
  if (!user) throw AppError.notFound('Staff user not found');
  if (user.role === UserRole.STORE_OWNER) {
    throw AppError.forbidden('Cannot change store owner via staff update');
  }
  if (user.role === UserRole.MASTER_ADMIN) {
    throw AppError.forbidden('Cannot modify Master Admin');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
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
    action: 'STAFF_UPDATED',
    targetType: 'User',
    targetId: userId,
    storeId,
    impersonationSessionId: actor.impersonationSessionId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { changes: data },
  });

  return updated;
}

export async function removeStoreStaff(
  storeId: string,
  userId: string,
  actor: {
    id: string;
    role: string;
    impersonationSessionId?: string;
    ip?: string;
    userAgent?: string;
  },
) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw AppError.notFound('Store not found');

  const user = await prisma.user.findFirst({
    where: { id: userId, storeId },
  });
  if (!user) throw AppError.notFound('Staff user not found');
  if (user.id === store.ownerUserId || user.role === UserRole.STORE_OWNER) {
    throw AppError.forbidden('Cannot remove the store owner');
  }

  await prisma.user.delete({ where: { id: userId } });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'STAFF_REMOVED',
    targetType: 'User',
    targetId: userId,
    storeId,
    impersonationSessionId: actor.impersonationSessionId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { email: user.email, role: user.role },
  });

  return { ok: true };
}
