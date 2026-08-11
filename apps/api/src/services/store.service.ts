import {
  createStoreSchema,
  StoreStatus,
  UserRole,
  UserStatus,
  updateStoreSchema,
} from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';
import { emitAfterCommit } from '../events/emit.js';
import { createInviteToken } from './auth.service.js';
import { writeAuditLog } from './audit.service.js';

const defaultLayout = {
  sections: [
    { type: 'hero', title: 'Welcome', subtitle: 'Shop with CommerceNest' },
    { type: 'featured-products', limit: 8 },
  ],
};

const defaultTheme = {
  primaryColor: '#0F766E',
  accentColor: '#F59E0B',
  fontFamily: 'DM Sans',
  borderRadius: '8px',
};

export async function createStore(
  input: unknown,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const data = createStoreSchema.parse(input);

  const existingSlug = await prisma.store.findUnique({
    where: { slug: data.slug },
  });
  if (existingSlug) {
    throw AppError.conflict('Store slug already exists');
  }

  const existingOwner = await prisma.user.findUnique({
    where: { email: data.ownerEmail },
  });
  if (existingOwner) {
    throw AppError.conflict('Owner email already registered');
  }

  const invite = await createInviteToken();
  const hostname = `${data.slug}.${env.PLATFORM_DOMAIN}`;

  const result = await prisma.$transaction(async (tx) => {
    const owner = await tx.user.create({
      data: {
        email: data.ownerEmail,
        name: data.ownerName,
        phone: data.ownerPhone,
        role: UserRole.STORE_OWNER,
        status: UserStatus.INVITED,
        inviteTokenHash: invite.hash,
        inviteExpiresAt: invite.expiresAt,
      },
    });

    const store = await tx.store.create({
      data: {
        name: data.name,
        slug: data.slug,
        status: StoreStatus.PENDING_SETUP,
        ownerUserId: owner.id,
        category: data.category,
        tagline: data.tagline,
        planTier: data.planTier,
      },
    });

    await tx.user.update({
      where: { id: owner.id },
      data: { storeId: store.id },
    });

    const storefront = await tx.storefront.create({
      data: { storeId: store.id },
    });

    const draft = await tx.storefrontVersion.create({
      data: {
        storefrontId: storefront.id,
        storeId: store.id,
        versionNumber: 1,
        status: 'DRAFT',
        layout: defaultLayout,
        themeSettings: defaultTheme,
        createdById: actor.id,
      },
    });

    await tx.storefront.update({
      where: { id: storefront.id },
      data: { draftVersionId: draft.id },
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

    return { store, owner, inviteToken: invite.token, draft };
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'STORE_CREATED',
    targetType: 'Store',
    targetId: result.store.id,
    storeId: result.store.id,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { slug: result.store.slug },
  });

  emitAfterCommit('StoreCreated', {
    storeId: result.store.id,
    actorId: actor.id,
    payload: {
      storeId: result.store.id,
      ownerUserId: result.owner.id,
      storeName: result.store.name,
      slug: result.store.slug,
      planTier: result.store.planTier,
    },
  });

  return {
    store: result.store,
    owner: {
      id: result.owner.id,
      email: result.owner.email,
      name: result.owner.name,
    },
    inviteToken:
      env.NODE_ENV === 'development' ? result.inviteToken : undefined,
  };
}

export async function listStores(params: {
  status?: string;
  page?: number;
  limit?: number;
  search?: string;
}) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const where: Record<string, unknown> = {};
  if (params.status) where.status = params.status;
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { slug: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.store.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        owner: { select: { id: true, email: true, name: true } },
        _count: { select: { products: true, orders: true, customers: true } },
      },
    }),
    prisma.store.count({ where }),
  ]);

  return { items, total, page, limit };
}

export async function getStore(storeId: string) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      owner: { select: { id: true, email: true, name: true, phone: true } },
      domains: true,
      storefront: {
        include: {
          draftVersion: true,
          publishedVersion: true,
        },
      },
    },
  });
  if (!store) throw AppError.notFound('Store not found');
  return store;
}

export async function suspendStore(
  storeId: string,
  reason: string,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const store = await prisma.store.update({
    where: { id: storeId },
    data: {
      status: StoreStatus.SUSPENDED,
      suspendedReason: reason,
      suspendedAt: new Date(),
    },
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'STORE_SUSPENDED',
    targetType: 'Store',
    targetId: storeId,
    storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { reason },
  });

  emitAfterCommit('StoreSuspended', {
    storeId,
    actorId: actor.id,
    payload: { storeId, actorId: actor.id, reason },
  });

  return store;
}

export async function reactivateStore(
  storeId: string,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const store = await prisma.store.update({
    where: { id: storeId },
    data: {
      status: StoreStatus.ACTIVE,
      suspendedReason: null,
      suspendedAt: null,
    },
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'STORE_REACTIVATED',
    targetType: 'Store',
    targetId: storeId,
    storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  return store;
}

export async function archiveStore(
  storeId: string,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const store = await prisma.store.update({
    where: { id: storeId },
    data: { status: StoreStatus.ARCHIVED },
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'STORE_ARCHIVED',
    targetType: 'Store',
    targetId: storeId,
    storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  return store;
}

export async function updateStore(
  storeId: string,
  input: unknown,
  actor?: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const data = updateStoreSchema.parse(input);
  const existing = await prisma.store.findUnique({ where: { id: storeId } });
  if (!existing) throw AppError.notFound('Store not found');

  const store = await prisma.store.update({
    where: { id: storeId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.tagline !== undefined ? { tagline: data.tagline } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.planTier !== undefined ? { planTier: data.planTier } : {}),
      ...(data.bkashNumber !== undefined
        ? { bkashNumber: data.bkashNumber }
        : {}),
      ...(data.bkashInstructions !== undefined
        ? { bkashInstructions: data.bkashInstructions }
        : {}),
    },
  });

  if (actor) {
    await writeAuditLog({
      actorId: actor.id,
      actorRole: actor.role as never,
      action: 'STORE_UPDATED',
      targetType: 'Store',
      targetId: storeId,
      storeId,
      ip: actor.ip,
      userAgent: actor.userAgent,
      metadata: { changes: data },
    });
  }

  return store;
}

export async function getStoreDashboardInfo(storeId: string) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      category: true,
      tagline: true,
      planTier: true,
      bkashNumber: true,
      bkashInstructions: true,
      domains: {
        where: { isPrimary: true },
        take: 1,
        select: {
          id: true,
          hostname: true,
          type: true,
          status: true,
          isPrimary: true,
        },
      },
    },
  });
  if (!store) throw AppError.notFound('Store not found');

  const primaryDomain = store.domains[0] ?? null;
  const { domains: _domains, ...rest } = store;
  return { ...rest, primaryDomain };
}

export async function updateBusinessSettings(storeId: string, rawInput: unknown) {
  const input = updateStoreSchema.parse(rawInput ?? {});
  return prisma.store.update({
    where: { id: storeId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.bkashNumber !== undefined
        ? { bkashNumber: input.bkashNumber }
        : {}),
      ...(input.bkashInstructions !== undefined
        ? { bkashInstructions: input.bkashInstructions }
        : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
      ...(input.shippingInsideDhaka !== undefined
        ? { shippingInsideDhaka: input.shippingInsideDhaka }
        : {}),
      ...(input.shippingOutsideDhaka !== undefined
        ? { shippingOutsideDhaka: input.shippingOutsideDhaka }
        : {}),
      ...(input.freeShippingThreshold !== undefined
        ? { freeShippingThreshold: input.freeShippingThreshold }
        : {}),
      ...(input.bkashNumber || input.category
        ? { status: StoreStatus.ACTIVE }
        : {}),
    },
  });
}
