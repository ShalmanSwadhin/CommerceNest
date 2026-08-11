import { z } from 'zod';
import {
  SupportTicketPriority,
  SupportTicketStatus,
} from '@commercenest/types';
import type { Prisma } from '@commercenest/prisma';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog } from './audit.service.js';

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
) {
  const data = createTicketSchema.parse(input);
  const ticket = await prisma.supportTicket.create({
    data: {
      storeId,
      requesterId: actor.id,
      subject: data.subject,
      priority: data.priority,
      status: SupportTicketStatus.OPEN,
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
