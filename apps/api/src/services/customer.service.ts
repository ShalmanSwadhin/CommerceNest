import { z } from 'zod';
import type { Prisma } from '@commercenest/prisma';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import {
  calculateRiskLevel,
  recalculateRisk,
  type RiskCounters,
  type RiskTransition,
} from './customer-risk.service.js';

const listQuerySchema = z.object({
  riskLevel: z.enum(['NONE', 'CAUTION', 'HIGH_RISK']).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function listCustomers(storeId: string, query: unknown) {
  const q = listQuerySchema.parse(query);
  const where: Prisma.CustomerWhereInput = { storeId };
  if (q.riskLevel) where.riskLevel = q.riskLevel;
  if (q.search) {
    where.OR = [
      { phone: { contains: q.search } },
      { name: { contains: q.search, mode: 'insensitive' } },
      { email: { contains: q.search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.customer.count({ where }),
  ]);

  return { items, total, page: q.page, limit: q.limit };
}

export async function getCustomer(storeId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId },
    include: {
      addresses: true,
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { items: true },
      },
    },
  });
  if (!customer) throw AppError.notFound('Customer not found');
  return customer;
}

/** Pure helper re-export for tests / callers */
export function computeRisk(counters: RiskCounters) {
  return calculateRiskLevel(counters);
}

export function applyDeliveryOutcome(
  counters: RiskCounters,
  transition: RiskTransition,
) {
  return recalculateRisk(counters, transition);
}
