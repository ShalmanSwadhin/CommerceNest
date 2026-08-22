import { z } from 'zod';
import {
  SupportTicketPriority,
  SupportTicketStatus,
  ThemeRequestStatus,
} from '@commercenest/types';
import type { Prisma } from '@commercenest/prisma';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog } from './audit.service.js';
import { notifyStoreStaff } from './notification.service.js';

const patchTicketSchema = z
  .object({
    status: z
      .enum([
        SupportTicketStatus.OPEN,
        SupportTicketStatus.IN_PROGRESS,
        SupportTicketStatus.WAITING_ON_CUSTOMER,
        SupportTicketStatus.RESOLVED,
        SupportTicketStatus.CLOSED,
      ])
      .optional(),
    priority: z
      .enum([
        SupportTicketPriority.LOW,
        SupportTicketPriority.NORMAL,
        SupportTicketPriority.HIGH,
        SupportTicketPriority.URGENT,
      ])
      .optional(),
  })
  .strict();

const replySchema = z
  .object({
    body: z.string().trim().min(1).max(10000),
  })
  .strict();

export async function listSupportTickets(params: {
  storeId?: string;
  status?: string;
  priority?: string;
  page?: number;
  limit?: number;
}) {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 50, 100);
  const where: Prisma.SupportTicketWhereInput = {};
  if (params.storeId) where.storeId = params.storeId;
  if (params.status) where.status = params.status as never;
  if (params.priority) where.priority = params.priority as never;

  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: {
        store: { select: { id: true, name: true, slug: true } },
        requester: { select: { id: true, name: true, email: true } },
        _count: { select: { replies: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return { items, total, page, limit };
}

const createTicketSchema = z
  .object({
    subject: z.string().trim().min(3).max(200),
    body: z.string().trim().min(1).max(10000),
    priority: z
      .enum([
        SupportTicketPriority.LOW,
        SupportTicketPriority.NORMAL,
        SupportTicketPriority.HIGH,
        SupportTicketPriority.URGENT,
      ])
      .default(SupportTicketPriority.NORMAL),
  })
  .strict();

export async function createSupportTicket(
  storeId: string,
  input: unknown,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
  opts: { isThemeCustomizationRequest?: boolean } = {},
) {
  const data = createTicketSchema.parse(input);
  const ticket = await prisma.supportTicket.create({
    data: {
      storeId,
      requesterId: actor.id,
      subject: data.subject,
      priority: data.priority,
      status: SupportTicketStatus.OPEN,
      ...(opts.isThemeCustomizationRequest ? { themeRequestStatus: ThemeRequestStatus.PENDING } : {}),
      replies: {
        create: {
          authorId: actor.id,
          body: data.body,
        },
      },
    },
    include: {
      replies: true,
      store: { select: { id: true, name: true, slug: true } },
    },
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'SUPPORT_TICKET_CREATED',
    targetType: 'SupportTicket',
    targetId: ticket.id,
    storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  return ticket;
}

export async function getSupportTicket(id: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      store: { select: { id: true, name: true, slug: true } },
      requester: { select: { id: true, name: true, email: true } },
      replies: {
        orderBy: { createdAt: 'asc' },
        include: {
          author: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!ticket) throw AppError.notFound('Support ticket not found');
  return ticket;
}

export async function patchSupportTicket(
  id: string,
  input: unknown,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const data = patchTicketSchema.parse(input);
  await getSupportTicket(id);

  const updated = await prisma.supportTicket.update({
    where: { id },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
    },
    include: {
      store: { select: { id: true, name: true, slug: true } },
    },
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'SUPPORT_TICKET_UPDATED',
    targetType: 'SupportTicket',
    targetId: id,
    storeId: updated.storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { changes: data },
  });

  return updated;
}

export async function replyToSupportTicket(
  id: string,
  input: unknown,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const data = replySchema.parse(input);
  const ticket = await getSupportTicket(id);

  const reply = await prisma.supportReply.create({
    data: {
      ticketId: id,
      authorId: actor.id,
      body: data.body,
    },
    include: {
      author: { select: { id: true, name: true, email: true } },
    },
  });

  await prisma.supportTicket.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'SUPPORT_TICKET_REPLIED',
    targetType: 'SupportReply',
    targetId: reply.id,
    storeId: ticket.storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { ticketId: id },
  });

  return reply;
}

// ---------------------------------------------------------------------------
// Theme customization requests — a thin layer over the SupportTicket rows
// created by POST /theme/customization-request (store.routes.ts). Approving
// never touches the Theme Builder / any theme data — Master Admin still
// makes the actual changes manually afterward, same as before this existed.
// ---------------------------------------------------------------------------

export async function listThemeCustomizationRequests(params: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 50, 100);
  const where: Prisma.SupportTicketWhereInput = {
    themeRequestStatus: params.status ? (params.status as never) : { not: null },
  };

  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: {
        store: { select: { id: true, name: true, slug: true } },
        requester: { select: { id: true, name: true, email: true } },
        replies: { orderBy: { createdAt: 'asc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return { items, total, page, limit };
}

async function getThemeCustomizationRequest(id: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket || !ticket.themeRequestStatus) {
    throw AppError.notFound('Theme customization request not found');
  }
  return ticket;
}

export async function approveThemeCustomizationRequest(
  id: string,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const ticket = await getThemeCustomizationRequest(id);
  if (ticket.themeRequestStatus !== ThemeRequestStatus.PENDING) {
    throw AppError.conflict('This request has already been decided.');
  }

  const updated = await prisma.supportTicket.update({
    where: { id },
    data: { themeRequestStatus: ThemeRequestStatus.APPROVED, status: SupportTicketStatus.IN_PROGRESS },
    include: { store: { select: { id: true, name: true, slug: true } } },
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'THEME_REQUEST_APPROVED',
    targetType: 'SupportTicket',
    targetId: id,
    storeId: updated.storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  await notifyStoreStaff(updated.storeId, {
    type: 'THEME_REQUEST_APPROVED',
    title: 'Theme customization request approved',
    body: 'CommerceNest approved your theme customization request and will make the changes shortly.',
  }).catch(() => undefined);

  return updated;
}

export async function rejectThemeCustomizationRequest(
  id: string,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
  reason: string,
) {
  if (!reason.trim()) throw AppError.badRequest('A reason is required.');
  const ticket = await getThemeCustomizationRequest(id);
  if (ticket.themeRequestStatus !== ThemeRequestStatus.PENDING) {
    throw AppError.conflict('This request has already been decided.');
  }

  const updated = await prisma.supportTicket.update({
    where: { id },
    data: { themeRequestStatus: ThemeRequestStatus.REJECTED, status: SupportTicketStatus.CLOSED },
    include: { store: { select: { id: true, name: true, slug: true } } },
  });

  await prisma.supportReply.create({
    data: { ticketId: id, authorId: actor.id, body: reason },
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'THEME_REQUEST_REJECTED',
    targetType: 'SupportTicket',
    targetId: id,
    storeId: updated.storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { reason },
  });

  await notifyStoreStaff(updated.storeId, {
    type: 'THEME_REQUEST_REJECTED',
    title: 'Theme customization request declined',
    body: reason,
  }).catch(() => undefined);

  return updated;
}

export async function completeThemeCustomizationRequest(
  id: string,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const ticket = await getThemeCustomizationRequest(id);
  if (ticket.themeRequestStatus !== ThemeRequestStatus.APPROVED) {
    throw AppError.conflict('Only an approved request can be marked completed.');
  }

  const updated = await prisma.supportTicket.update({
    where: { id },
    data: { themeRequestStatus: ThemeRequestStatus.COMPLETED, status: SupportTicketStatus.RESOLVED },
    include: { store: { select: { id: true, name: true, slug: true } } },
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'THEME_REQUEST_COMPLETED',
    targetType: 'SupportTicket',
    targetId: id,
    storeId: updated.storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  await notifyStoreStaff(updated.storeId, {
    type: 'THEME_REQUEST_COMPLETED',
    title: 'Your theme customization is live',
    body: 'CommerceNest has finished making the requested changes to your storefront theme.',
  }).catch(() => undefined);

  return updated;
}
