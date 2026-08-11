import { z } from 'zod';
import { AnnouncementStatus } from '@commercenest/types';
import type { Prisma } from '@commercenest/prisma';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog } from './audit.service.js';

const createSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(10000),
    audience: z.unknown().default({}),
    status: z
      .enum([
        AnnouncementStatus.DRAFT,
        AnnouncementStatus.SCHEDULED,
        AnnouncementStatus.PUBLISHED,
        AnnouncementStatus.EXPIRED,
        AnnouncementStatus.ARCHIVED,
      ])
      .default(AnnouncementStatus.DRAFT),
    publishAt: z.coerce.date().nullable().optional(),
    expireAt: z.coerce.date().nullable().optional(),
  })
  .strict();

const patchSchema = createSchema.partial();

/** Published platform announcements visible to store staff. */
export async function listPublishedAnnouncementsForStores(params?: {
  page?: number;
  limit?: number;
}) {
  const page = params?.page ?? 1;
  const limit = Math.min(params?.limit ?? 50, 100);
  const now = new Date();
  const where: Prisma.AnnouncementWhereInput = {
    status: AnnouncementStatus.PUBLISHED,
    AND: [
      { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
      { OR: [{ expireAt: null }, { expireAt: { gt: now } }] },
    ],
  };

  const [items, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      select: {
        id: true,
        title: true,
        body: true,
        publishAt: true,
        expireAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.announcement.count({ where }),
  ]);

  return { items, total, page, limit };
}

export async function listAnnouncements(params?: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  const page = params?.page ?? 1;
  const limit = Math.min(params?.limit ?? 50, 100);
  const where: Prisma.AnnouncementWhereInput = {};
  if (params?.status) where.status = params.status as never;

  const [items, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.announcement.count({ where }),
  ]);

  return { items, total, page, limit };
}

export async function createAnnouncement(
  input: unknown,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const data = createSchema.parse(input);
  const announcement = await prisma.announcement.create({
    data: {
      title: data.title,
      body: data.body,
      audience: (data.audience ?? {}) as Prisma.InputJsonValue,
      status: data.status,
      publishAt: data.publishAt ?? null,
      expireAt: data.expireAt ?? null,
      createdById: actor.id,
    },
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'ANNOUNCEMENT_CREATED',
    targetType: 'Announcement',
    targetId: announcement.id,
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  return announcement;
}

export async function patchAnnouncement(
  id: string,
  input: unknown,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const data = patchSchema.parse(input);
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound('Announcement not found');

  const updated = await prisma.announcement.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.body !== undefined ? { body: data.body } : {}),
      ...(data.audience !== undefined
        ? { audience: data.audience as Prisma.InputJsonValue }
        : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.publishAt !== undefined ? { publishAt: data.publishAt } : {}),
      ...(data.expireAt !== undefined ? { expireAt: data.expireAt } : {}),
    },
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'ANNOUNCEMENT_UPDATED',
    targetType: 'Announcement',
    targetId: id,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { changes: data } as Prisma.InputJsonValue,
  });

  return updated;
}
