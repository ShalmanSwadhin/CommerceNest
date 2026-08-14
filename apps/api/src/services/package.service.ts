import { z } from 'zod';
import { CustomThemeAvailability } from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog } from './audit.service.js';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const packageInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(60).regex(slugRegex, 'lowercase letters, numbers, hyphens only'),
  description: z.string().trim().max(2000).optional(),
  monthlyPrice: z.number().min(0),
  yearlyPrice: z.number().min(0).optional(),
  currency: z.string().trim().min(2).max(8).default('BDT'),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
  displayOrder: z.number().int().default(0),
  maxProducts: z.number().int().min(0).nullable().optional(),
  maxStaff: z.number().int().min(0).nullable().optional(),
  maxOrders: z.number().int().min(0).nullable().optional(),
  storageLimitMb: z.number().int().min(0).nullable().optional(),
  features: z.array(z.string().trim().min(1).max(200)).default([]),
  trialDays: z.number().int().min(0).max(90).default(7),
  customThemeAvailability: z
    .enum([CustomThemeAvailability.INCLUDED, CustomThemeAvailability.ADDITIONAL_CHARGE])
    .default(CustomThemeAvailability.ADDITIONAL_CHARGE),
  supportLevel: z.string().trim().min(2).max(40).default('basic'),
});

const packageUpdateSchema = packageInputSchema.partial();

export async function listPublicPackages() {
  return prisma.package.findMany({
    where: { active: true },
    orderBy: [{ displayOrder: 'asc' }, { monthlyPrice: 'asc' }],
  });
}

export async function listAllPackages() {
  return prisma.package.findMany({
    orderBy: [{ displayOrder: 'asc' }, { monthlyPrice: 'asc' }],
  });
}

export async function getPackage(id: string) {
  const pkg = await prisma.package.findUnique({ where: { id } });
  if (!pkg) throw AppError.notFound('Package not found');
  return pkg;
}

export async function getPackageBySlug(slug: string) {
  return prisma.package.findUnique({ where: { slug } });
}

export async function createPackage(
  input: unknown,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const data = packageInputSchema.parse(input);
  const existing = await prisma.package.findUnique({ where: { slug: data.slug } });
  if (existing) throw AppError.conflict('A package with this slug already exists');

  const pkg = await prisma.package.create({ data });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'PACKAGE_CREATED',
    targetType: 'Package',
    targetId: pkg.id,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { slug: pkg.slug },
  });

  return pkg;
}

export async function updatePackage(
  id: string,
  input: unknown,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const data = packageUpdateSchema.parse(input);
  await getPackage(id);

  if (data.slug) {
    const slugOwner = await prisma.package.findUnique({ where: { slug: data.slug } });
    if (slugOwner && slugOwner.id !== id) {
      throw AppError.conflict('A package with this slug already exists');
    }
  }

  const pkg = await prisma.package.update({ where: { id }, data });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'PACKAGE_UPDATED',
    targetType: 'Package',
    targetId: id,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { changes: data },
  });

  return pkg;
}

export async function deletePackage(
  id: string,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const existing = await getPackage(id);
  const inUse = await prisma.store.count({ where: { planTier: existing.slug } });

  const pkg = inUse
    ? await prisma.package.update({ where: { id }, data: { active: false } })
    : await prisma.package.delete({ where: { id } });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: inUse ? 'PACKAGE_DEACTIVATED' : 'PACKAGE_DELETED',
    targetType: 'Package',
    targetId: id,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { storesUsingPlan: inUse },
  });

  return { deactivatedInstead: Boolean(inUse), package: pkg };
}
