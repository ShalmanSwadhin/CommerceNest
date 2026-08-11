import type { Prisma, UserRole } from '@commercenest/prisma';
import { prisma } from '../lib/prisma.js';
import { emitAfterCommit } from '../events/emit.js';

export interface WriteAuditInput {
  actorId?: string | null;
  actorRole?: UserRole | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  storeId?: string | null;
  impersonationSessionId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

export async function writeAuditLog(input: WriteAuditInput) {
  const log = await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      storeId: input.storeId ?? null,
      impersonationSessionId: input.impersonationSessionId ?? null,
      metadata: input.metadata ?? undefined,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  emitAfterCommit('AuditLogWritten', {
    storeId: log.storeId,
    actorId: log.actorId,
    payload: {
      auditLogId: log.id,
      actorId: log.actorId,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      storeId: log.storeId,
      impersonationSessionId: log.impersonationSessionId,
    },
  });

  return log;
}

export async function listAuditLogs(params: {
  storeId?: string;
  action?: string;
  page?: number;
  limit?: number;
}) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const where: Prisma.AuditLogWhereInput = {};
  if (params.storeId) where.storeId = params.storeId;
  if (params.action) where.action = params.action;

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        actor: { select: { id: true, email: true, name: true, role: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total, page, limit };
}
