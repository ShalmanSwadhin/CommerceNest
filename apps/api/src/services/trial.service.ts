import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  passwordSchema,
  StoreApprovalStatus,
  StoreStatus,
  TrialLeadStatus,
  UserRole,
  UserStatus,
} from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';
import { emitAfterCommit } from '../events/emit.js';
import { writeAuditLog } from './audit.service.js';
import { defaultLayout, defaultTheme } from './store.service.js';
import { seedDefaultCmsBlocks } from './cms-defaults.service.js';
import { hashPassword } from '../lib/password.js';

const DEFAULT_TRIAL_DURATION_DAYS = 7;
const TRIAL_DURATION_SETTING_KEY = 'trial.defaultDurationDays';

const createTrialLeadSchema = z
  .object({
    prospectName: z.string().trim().min(2).max(120),
    businessName: z.string().trim().min(2).max(150),
    phone: z.string().trim().min(6).max(20),
    email: z.string().trim().email().max(200),
    password: passwordSchema,
    confirmPassword: z.string(),
    category: z.string().trim().max(80).optional(),
    catalogSize: z.string().trim().max(40).optional(),
    message: z.string().trim().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      });
    }
  });

/**
 * Trial duration is Master Admin-configurable via the existing
 * PlatformSettings key/value store — never hardcoded past this one
 * fallback, which only applies if the setting has never been touched.
 */
export async function getDefaultTrialDurationDays(): Promise<number> {
  const setting = await prisma.platformSettings.findUnique({
    where: { key: TRIAL_DURATION_SETTING_KEY },
  });
  const value = setting?.value;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return DEFAULT_TRIAL_DURATION_DAYS;
}

export async function setDefaultTrialDurationDays(days: number) {
  const parsed = z.number().int().min(1).max(90).parse(days);
  return prisma.platformSettings.upsert({
    where: { key: TRIAL_DURATION_SETTING_KEY },
    create: { key: TRIAL_DURATION_SETTING_KEY, value: parsed },
    update: { value: parsed },
  });
}

/** Random, non-guessable — deliberately not derived from the business name
 * or email, since a trial URL must not leak prospect information. */
async function generateUniqueTrialSlug(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const slug = `trial-${randomBytes(4).toString('hex')}`;
    const exists = await prisma.store.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!exists) return slug;
  }
  throw new Error('Could not generate a unique trial store slug');
}

/** `.localhost` subdomains resolve to loopback in every modern browser with
 * zero DNS/hosts-file configuration (RFC 6761); PLATFORM_DOMAIN
 * (commercenest.local by default) does not — mDNS-reserved `.local` needs
 * real DNS or a hosts entry. Using PLATFORM_DOMAIN here would hand the
 * prospect a link their browser can't actually resolve in local dev. */
function trialHostnameFor(slug: string) {
  return env.NODE_ENV === 'production' ? `${slug}.${env.PLATFORM_DOMAIN}` : `${slug}.localhost`;
}

function trialUrlFor(hostname: string) {
  return env.NODE_ENV === 'production'
    ? `https://${hostname}`
    : `http://${hostname}:8080`;
}

/**
 * Submits a trial request and — unless something is actually wrong with the
 * input — provisions a real, isolated tenant store immediately so the
 * prospect gets a working link in the same response ("instead of losing the
 * lead"). The store is created ACTIVE + published from a default layout so
 * the demo storefront is live the moment the form is submitted; Master
 * Admin can suspend/reject afterward if a lead turns out to be spam.
 */
export async function createTrialLead(input: unknown) {
  const data = createTrialLeadSchema.parse(input);

  const existingOwner = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (existingOwner) {
    throw AppError.conflict(
      'An account with this email already exists. Try logging in instead.',
    );
  }

  const slug = await generateUniqueTrialSlug();
  const hostname = trialHostnameFor(slug);
  const trialDurationDays = await getDefaultTrialDurationDays();
  const now = new Date();
  const trialExpiresAt = new Date(
    now.getTime() + trialDurationDays * 24 * 60 * 60 * 1000,
  );
  const passwordHash = await hashPassword(data.password);

  const result = await prisma.$transaction(async (tx) => {
    // ACTIVE with a real password immediately — unlike the Master-Admin
    // -driven "invite a store owner" path (store.service.ts#createStore),
    // this is self-serve signup: the merchant sets their own password right
    // now and must be able to log into store-dashboard immediately, not
    // wait on an invite-token email that (for the trial path specifically)
    // nothing ever sends.
    const owner = await tx.user.create({
      data: {
        email: data.email,
        name: data.prospectName,
        phone: data.phone,
        role: UserRole.STORE_OWNER,
        status: UserStatus.ACTIVE,
        passwordHash,
      },
    });

    const store = await tx.store.create({
      data: {
        name: data.businessName,
        slug,
        status: StoreStatus.ACTIVE,
        // Independent of the store being immediately live/usable — Master
        // Admin still reviews self-serve trial signups before they're a
        // fully trusted CommerceNest customer (see AUTHENTICATION_ARCHITECTURE.md
        // "Verification vs Approval"). Master-Admin-initiated store creation
        // (store.service.ts#createStore) defaults to APPROVED instead, since
        // an admin creating the store directly is itself the vetting step.
        approvalStatus: StoreApprovalStatus.PENDING,
        ownerUserId: owner.id,
        category: data.category,
        planTier: 'starter',
        isTrial: true,
        trialStartedAt: now,
        trialExpiresAt,
      },
    });

    await tx.user.update({
      where: { id: owner.id },
      data: { storeId: store.id },
    });

    const storefront = await tx.storefront.create({
      data: { storeId: store.id },
    });

    // Published immediately (not left as a draft) — a trial store with no
    // visible storefront defeats the point of handing over a live link.
    const version = await tx.storefrontVersion.create({
      data: {
        storefrontId: storefront.id,
        storeId: store.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        layout: defaultLayout,
        themeSettings: defaultTheme,
        publishedAt: now,
      },
    });

    await tx.storefront.update({
      where: { id: storefront.id },
      data: { draftVersionId: version.id, publishedVersionId: version.id },
    });

    await tx.storeDomain.create({
      data: {
        storeId: store.id,
        hostname,
        type: 'SUBDOMAIN',
        isPrimary: true,
        status: 'VERIFIED',
        sslStatus: 'ACTIVE',
      },
    });

    await seedDefaultCmsBlocks(tx, store.id, store.name);

    const lead = await tx.trialLead.create({
      data: {
        prospectName: data.prospectName,
        businessName: data.businessName,
        phone: data.phone,
        email: data.email,
        category: data.category,
        catalogSize: data.catalogSize,
        message: data.message,
        status: TrialLeadStatus.TRIAL_ACTIVE,
        storeId: store.id,
        trialDurationDays,
        lastActivityAt: now,
      },
    });

    return { store, lead };
  });

  const trialUrl = trialUrlFor(hostname);

  await writeAuditLog({
    action: 'TRIAL_LEAD_CREATED',
    targetType: 'TrialLead',
    targetId: result.lead.id,
    storeId: result.store.id,
    metadata: { businessName: data.businessName, email: data.email, slug },
  });

  emitAfterCommit('TrialLeadCreated', {
    storeId: result.store.id,
    actorId: null,
    payload: {
      trialLeadId: result.lead.id,
      storeId: result.store.id,
      businessName: data.businessName,
      prospectName: data.prospectName,
      email: data.email,
      trialUrl,
    },
  });

  return { lead: result.lead, store: result.store, trialUrl };
}

/** Trial leads whose window has passed flip to TRIAL_EXPIRED lazily, on
 * read — there's no cron/queue infra in V1, so this runs wherever a lead or
 * its store might be looked at. Idempotent, cheap (indexed), safe to call
 * often. */
export async function syncExpiredTrials() {
  const now = new Date();
  await prisma.trialLead.updateMany({
    where: {
      status: TrialLeadStatus.TRIAL_ACTIVE,
      store: { trialExpiresAt: { lt: now } },
    },
    data: { status: TrialLeadStatus.TRIAL_EXPIRED },
  });
}

function withTrialUrl<T extends { store: { domains?: { hostname: string; isPrimary: boolean }[] } | null }>(
  lead: T,
) {
  const primary = lead.store?.domains?.find((d) => d.isPrimary) ?? lead.store?.domains?.[0];
  return {
    ...lead,
    trialUrl: primary ? trialUrlFor(primary.hostname) : null,
  };
}

export async function listTrialLeads(params: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  await syncExpiredTrials();
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 30, 100);
  const where: Record<string, unknown> = {};
  if (params.status) where.status = params.status;
  if (params.search) {
    where.OR = [
      { businessName: { contains: params.search, mode: 'insensitive' } },
      { prospectName: { contains: params.search, mode: 'insensitive' } },
      { email: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.trialLead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            trialStartedAt: true,
            trialExpiresAt: true,
            domains: { select: { hostname: true, isPrimary: true } },
          },
        },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.trialLead.count({ where }),
  ]);

  return { items: items.map(withTrialUrl), total, page, limit };
}

async function getLeadOrThrow(id: string) {
  const lead = await prisma.trialLead.findUnique({
    where: { id },
    include: {
      store: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          planTier: true,
          trialStartedAt: true,
          trialExpiresAt: true,
          domains: { select: { hostname: true, isPrimary: true } },
        },
      },
    },
  });
  if (!lead) throw AppError.notFound('Trial lead not found');
  return lead;
}

export async function getTrialLead(id: string) {
  await syncExpiredTrials();
  return withTrialUrl(await getLeadOrThrow(id));
}

export async function extendTrial(
  id: string,
  additionalDays: number,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const days = z.number().int().min(1).max(90).parse(additionalDays);
  const lead = await getLeadOrThrow(id);
  if (!lead.storeId || !lead.store) {
    throw AppError.badRequest('This lead has no provisioned trial store to extend');
  }

  const base =
    lead.store.trialExpiresAt && lead.store.trialExpiresAt > new Date()
      ? lead.store.trialExpiresAt
      : new Date();
  const trialExpiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.store.update({
      where: { id: lead.storeId },
      data: { trialExpiresAt, status: StoreStatus.ACTIVE },
    }),
    prisma.trialLead.update({
      where: { id },
      data: {
        status: TrialLeadStatus.TRIAL_ACTIVE,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        lastActivityAt: new Date(),
      },
    }),
  ]);

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'TRIAL_EXTENDED',
    targetType: 'TrialLead',
    targetId: id,
    storeId: lead.storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { additionalDays: days, newExpiry: trialExpiresAt.toISOString() },
  });

  return getTrialLead(id);
}

export async function convertTrial(
  id: string,
  input: { planTier?: string },
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const lead = await getLeadOrThrow(id);
  if (!lead.storeId) {
    throw AppError.badRequest('This lead has no provisioned trial store to convert');
  }

  await prisma.$transaction([
    prisma.store.update({
      where: { id: lead.storeId },
      data: {
        isTrial: false,
        trialExpiresAt: null,
        status: StoreStatus.ACTIVE,
        ...(input.planTier ? { planTier: input.planTier } : {}),
      },
    }),
    prisma.trialLead.update({
      where: { id },
      data: {
        status: TrialLeadStatus.CONVERTED,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        lastActivityAt: new Date(),
      },
    }),
  ]);

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'TRIAL_CONVERTED',
    targetType: 'TrialLead',
    targetId: id,
    storeId: lead.storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { planTier: input.planTier ?? null },
  });

  return getTrialLead(id);
}

export async function rejectTrial(
  id: string,
  reason: string | undefined,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const lead = await getLeadOrThrow(id);

  await prisma.$transaction([
    ...(lead.storeId
      ? [
          prisma.store.update({
            where: { id: lead.storeId },
            data: { status: StoreStatus.SUSPENDED, suspendedReason: reason || 'Trial rejected', suspendedAt: new Date() },
          }),
        ]
      : []),
    prisma.trialLead.update({
      where: { id },
      data: {
        status: TrialLeadStatus.REJECTED,
        rejectionReason: reason,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        lastActivityAt: new Date(),
      },
    }),
  ]);

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'TRIAL_REJECTED',
    targetType: 'TrialLead',
    targetId: id,
    storeId: lead.storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { reason: reason ?? null },
  });

  return getTrialLead(id);
}
