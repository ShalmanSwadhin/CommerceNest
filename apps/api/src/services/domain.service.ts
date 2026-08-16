import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  addStoreDomainSchema,
  DomainRequestStatus,
  DomainType,
  setPrimaryDomainSchema,
  STORE_SLUG_REGEX,
  verifyStoreDomainSchema,
} from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { env } from '../lib/env.js';
import { writeAuditLog } from './audit.service.js';

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

// ---------------------------------------------------------------------------
// CommerceNest-namespace domain requests — a merchant asking for an
// allocated slice of the shared *.commercenest namespace (curated, Master
// Admin reviews/assigns). Distinct from the self-service "bring your own
// custom domain + verify via token challenge" flow above, which stays
// untouched — that's for a domain the merchant already owns; this is for a
// CommerceNest-branded address, which is why it's gated instead of
// self-service. See DomainRequest's schema doc comment.
// ---------------------------------------------------------------------------

const domainLabelSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, { message: 'Must be at least 3 characters' })
  .max(63, { message: 'Must be at most 63 characters' })
  .regex(STORE_SLUG_REGEX, {
    message: 'Only lowercase letters, numbers, and hyphens (not at the start/end)',
  });

/** Reserved so a merchant can never claim the platform's own operational
 * subdomains out from under it. */
const RESERVED_LABELS = new Set([
  'www', 'app', 'admin', 'api', 'gateway', 'mail', 'ftp', 'localhost',
  'commercenest', 'store', 'stores', 'trial', 'staging', 'dev', 'test',
]);

function hostnameForLabel(label: string) {
  return `${label}.${env.PLATFORM_DOMAIN}`;
}

/** Authoritative, server-side availability check — the frontend's own
 * live-as-you-type check calls this same function; nothing about "is this
 * available" is ever decided client-side. */
export async function checkDomainLabelAvailability(rawLabel: string) {
  const label = domainLabelSchema.parse(rawLabel);
  const hostname = hostnameForLabel(label);

  if (RESERVED_LABELS.has(label)) {
    return { label, hostname, available: false, reason: 'reserved' as const };
  }

  const [existingDomain, existingRequest] = await Promise.all([
    prisma.storeDomain.findUnique({ where: { hostname }, select: { id: true } }),
    prisma.domainRequest.findFirst({
      where: {
        requestedHostname: hostname,
        status: { in: [DomainRequestStatus.PENDING, DomainRequestStatus.APPROVED, DomainRequestStatus.ASSIGNED] },
      },
      select: { id: true },
    }),
  ]);

  if (existingDomain || existingRequest) {
    return { label, hostname, available: false, reason: 'taken' as const };
  }
  return { label, hostname, available: true as const };
}

export async function requestDomain(
  storeId: string,
  input: unknown,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const data = z
    .object({ label: z.string(), note: z.string().trim().max(500).optional() })
    .parse(input);

  const availability = await checkDomainLabelAvailability(data.label);
  if (!availability.available) {
    throw AppError.conflict(
      availability.reason === 'reserved'
        ? 'This name is reserved and cannot be requested.'
        : 'This CommerceNest address is already taken or has a pending request.',
    );
  }

  // A store shouldn't stack up unlimited pending requests — superseding
  // makes more sense than accumulating.
  await prisma.domainRequest.updateMany({
    where: { storeId, status: DomainRequestStatus.PENDING },
    data: { status: DomainRequestStatus.REJECTED, rejectionReason: 'Superseded by a new request' },
  });

  const request = await prisma.domainRequest.create({
    data: {
      storeId,
      requestedLabel: availability.label,
      requestedHostname: availability.hostname,
      note: data.note,
    },
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'DOMAIN_REQUEST_CREATED',
    targetType: 'DomainRequest',
    targetId: request.id,
    storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { requestedHostname: request.requestedHostname },
  });

  return request;
}

export async function listMyDomainRequests(storeId: string) {
  return prisma.domainRequest.findMany({
    where: { storeId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listDomainRequests(params: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 30, 100);
  const where: Record<string, unknown> = {};
  if (params.status) where.status = params.status;

  const [items, total] = await Promise.all([
    prisma.domainRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        store: { select: { id: true, name: true, slug: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.domainRequest.count({ where }),
  ]);

  return { items, total, page, limit };
}

async function getDomainRequestOrThrow(id: string) {
  const request = await prisma.domainRequest.findUnique({ where: { id } });
  if (!request) throw AppError.notFound('Domain request not found');
  return request;
}

export async function approveDomainRequest(
  id: string,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  await getDomainRequestOrThrow(id);
  const request = await prisma.domainRequest.update({
    where: { id },
    data: {
      status: DomainRequestStatus.APPROVED,
      reviewedById: actor.id,
      reviewedAt: new Date(),
    },
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'DOMAIN_REQUEST_APPROVED',
    targetType: 'DomainRequest',
    targetId: id,
    storeId: request.storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  return request;
}

export async function rejectDomainRequest(
  id: string,
  reason: string | undefined,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  await getDomainRequestOrThrow(id);
  const request = await prisma.domainRequest.update({
    where: { id },
    data: {
      status: DomainRequestStatus.REJECTED,
      rejectionReason: reason,
      reviewedById: actor.id,
      reviewedAt: new Date(),
    },
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'DOMAIN_REQUEST_REJECTED',
    targetType: 'DomainRequest',
    targetId: id,
    storeId: request.storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { reason: reason ?? null },
  });

  return request;
}

/**
 * Creates the real, live StoreDomain — admin-assigned, so (like the
 * auto-provisioned trial subdomain) it goes straight to VERIFIED/ACTIVE
 * with no token-challenge dance; Master Admin's decision to assign IS the
 * verification. Callable directly from PENDING (fast path) or from
 * APPROVED — assign is the one step that actually creates a resolvable
 * hostname, distinct from the softer "yes, this is fine" of approve.
 */
export async function assignDomainRequest(
  id: string,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const request = await getDomainRequestOrThrow(id);
  if (request.status === DomainRequestStatus.REJECTED) {
    throw AppError.badRequest('Cannot assign a rejected domain request.');
  }
  if (request.status === DomainRequestStatus.ASSIGNED) {
    throw AppError.conflict('This request has already been assigned.');
  }

  const existing = await prisma.storeDomain.findUnique({
    where: { hostname: request.requestedHostname },
  });
  if (existing) {
    throw AppError.conflict('Hostname already in use.');
  }

  const [domain, updatedRequest] = await prisma.$transaction([
    prisma.storeDomain.create({
      data: {
        storeId: request.storeId,
        hostname: request.requestedHostname,
        type: DomainType.SUBDOMAIN,
        isPrimary: false,
        status: 'VERIFIED',
        sslStatus: 'ACTIVE',
      },
    }),
    prisma.domainRequest.update({
      where: { id },
      data: {
        status: DomainRequestStatus.ASSIGNED,
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
    }),
  ]);

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'DOMAIN_REQUEST_ASSIGNED',
    targetType: 'DomainRequest',
    targetId: id,
    storeId: request.storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { hostname: request.requestedHostname },
  });

  return { domain, request: updatedRequest };
}
