import { randomBytes } from 'node:crypto';
import {
  addStoreDomainSchema,
  DomainType,
  setPrimaryDomainSchema,
  verifyStoreDomainSchema,
} from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export async function listDomains(storeId: string) {
  return prisma.storeDomain.findMany({
    where: { storeId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function addCustomDomain(storeId: string, input: unknown) {
  const data = addStoreDomainSchema.parse(input);
  const existing = await prisma.storeDomain.findUnique({
    where: { hostname: data.hostname },
  });
  if (existing) throw AppError.conflict('Hostname already in use');

  const verificationToken = randomBytes(16).toString('hex');

  if (data.isPrimary) {
    await prisma.storeDomain.updateMany({
      where: { storeId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  return prisma.storeDomain.create({
    data: {
      storeId,
      hostname: data.hostname,
      type: data.type ?? DomainType.CUSTOM,
      isPrimary: data.isPrimary,
      status: 'PENDING',
      sslStatus: 'PENDING',
      verificationToken,
    },
  });
}

/**
 * V1 domain verification (no live DNS lookup).
 *
 * Challenge: client must POST the stored `verificationToken` (as `token` or
 * `verificationToken`) for the domain identified by `domainId` or `hostname`.
 * Status becomes VERIFIED only when the challenge matches — free approve is not allowed.
 */
export async function verifyDomain(storeId: string, input: unknown) {
  const data = verifyStoreDomainSchema.parse(input);
  const challenge = data.verificationToken ?? data.token;

  const domain = data.domainId
    ? await prisma.storeDomain.findFirst({
        where: { id: data.domainId, storeId },
      })
    : await prisma.storeDomain.findFirst({
        where: { hostname: data.hostname!, storeId },
      });

  if (!domain) throw AppError.notFound('Domain not found');

  if (!domain.verificationToken) {
    throw AppError.badRequest(
      'Domain has no verification token; re-add the domain to receive a challenge',
    );
  }

  if (!challenge || challenge !== domain.verificationToken) {
    return prisma.storeDomain.update({
      where: { id: domain.id },
      data: { status: 'FAILED' },
    });
  }

  return prisma.storeDomain.update({
    where: { id: domain.id },
    data: { status: 'VERIFIED', sslStatus: 'ACTIVE' },
  });
}

export async function setPrimaryDomain(storeId: string, input: unknown) {
  const data = setPrimaryDomainSchema.parse(input);
  const domain = await prisma.storeDomain.findFirst({
    where: { id: data.domainId, storeId },
  });
  if (!domain) throw AppError.notFound('Domain not found');
  if (domain.status !== 'VERIFIED') {
    throw AppError.badRequest('Only verified domains can be primary');
  }

  await prisma.$transaction([
    prisma.storeDomain.updateMany({
      where: { storeId, isPrimary: true },
      data: { isPrimary: false },
    }),
    prisma.storeDomain.update({
      where: { id: domain.id },
      data: { isPrimary: true },
    }),
  ]);

  return getDomain(storeId, domain.id);
}

export async function resolveStoreByHost(host: string) {
  const hostname = host.trim().toLowerCase().split(':')[0]!;
  if (!hostname) throw AppError.badRequest('host is required');

  const domain = await prisma.storeDomain.findUnique({
    where: { hostname },
    include: {
      store: { select: { id: true, slug: true, name: true, status: true } },
    },
  });

  if (!domain || !domain.store) {
    throw AppError.notFound('Store not found for host');
  }
  if (
    domain.store.status === 'ARCHIVED' ||
    domain.store.status === 'SUSPENDED'
  ) {
    throw AppError.notFound('Store not found for host');
  }
  // Unverified custom/subdomain hostnames must not resolve another tenant.
  if (domain.status !== 'VERIFIED') {
    throw AppError.notFound('Store not found for host');
  }

  return {
    storeId: domain.store.id,
    slug: domain.store.slug,
    name: domain.store.name,
    hostname: domain.hostname,
  };
}

async function getDomain(storeId: string, domainId: string) {
  const domain = await prisma.storeDomain.findFirst({
    where: { id: domainId, storeId },
  });
  if (!domain) throw AppError.notFound('Domain not found');
  return domain;
}
