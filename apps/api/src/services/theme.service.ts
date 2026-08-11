import { z } from 'zod';
import { normalizeThemeDocument } from '@commercenest/types';
import type { Prisma } from '@commercenest/prisma';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { emitAfterCommit } from '../events/emit.js';
import { writeAuditLog } from './audit.service.js';

const saveDraftSchema = z.object({
  layout: z.unknown(),
  themeSettings: z.unknown(),
});

export async function getDraftTheme(storeId: string) {
  const storefront = await prisma.storefront.findUnique({
    where: { storeId },
    include: {
      draftVersion: true,
      publishedVersion: true,
    },
  });
  if (!storefront) throw AppError.notFound('Storefront not found');
  return storefront;
}

function themeSlice(
  version:
    | {
        themeSettings: unknown;
        layout: unknown;
        versionNumber: number;
      }
    | null
    | undefined,
) {
  if (!version) return null;
  return {
    themeSettings: version.themeSettings,
    layout: version.layout,
    versionNumber: version.versionNumber,
  };
}

/** Dashboard shape: published + draft theme versions (no full storefront row). */
export async function getCurrentTheme(storeId: string) {
  const storefront = await getDraftTheme(storeId);
  return {
    published: themeSlice(storefront.publishedVersion),
    draft: themeSlice(storefront.draftVersion),
  };
}

export async function saveDraftTheme(
  storeId: string,
  input: unknown,
  actorId: string,
) {
  const data = saveDraftSchema.parse(input);
  const normalized = normalizeThemeDocument({
    layout: data.layout,
    themeSettings: data.themeSettings,
  });
  const storefront = await getDraftTheme(storeId);

  if (storefront.draftVersionId && storefront.draftVersion) {
    return prisma.storefrontVersion.update({
      where: { id: storefront.draftVersionId },
      data: {
        layout: normalized.layout as Prisma.InputJsonValue,
        themeSettings: normalized.themeSettings as Prisma.InputJsonValue,
      },
    });
  }

  const latest = await prisma.storefrontVersion.findFirst({
    where: { storefrontId: storefront.id },
    orderBy: { versionNumber: 'desc' },
  });

  const draft = await prisma.storefrontVersion.create({
    data: {
      storefrontId: storefront.id,
      storeId,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      status: 'DRAFT',
      layout: normalized.layout as Prisma.InputJsonValue,
      themeSettings: normalized.themeSettings as Prisma.InputJsonValue,
      createdById: actorId,
    },
  });

  await prisma.storefront.update({
    where: { id: storefront.id },
    data: { draftVersionId: draft.id },
  });

  return draft;
}

export async function publishTheme(
  storeId: string,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const storefront = await getDraftTheme(storeId);
  if (!storefront.draftVersion) {
    throw AppError.badRequest('No draft theme to publish');
  }

  const previousVersionId = storefront.publishedVersionId;

  const result = await prisma.$transaction(async (tx) => {
    if (previousVersionId) {
      await tx.storefrontVersion.update({
        where: { id: previousVersionId },
        data: { status: 'OBSOLETE' },
      });
    }

    const published = await tx.storefrontVersion.update({
      where: { id: storefront.draftVersion!.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });

    // Create a new draft copy for further edits
    const newDraft = await tx.storefrontVersion.create({
      data: {
        storefrontId: storefront.id,
        storeId,
        versionNumber: published.versionNumber + 1,
        status: 'DRAFT',
        layout: published.layout as Prisma.InputJsonValue,
        themeSettings: published.themeSettings as Prisma.InputJsonValue,
        createdById: actor.id,
      },
    });

    await tx.storefront.update({
      where: { id: storefront.id },
      data: {
        publishedVersionId: published.id,
        draftVersionId: newDraft.id,
      },
    });

    return { published, newDraft };
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'THEME_PUBLISHED',
    targetType: 'StorefrontVersion',
    targetId: result.published.id,
    storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: {
      versionNumber: result.published.versionNumber,
      previousVersionId,
    },
  });

  emitAfterCommit('StoreThemePublished', {
    storeId,
    actorId: actor.id,
    payload: {
      storeId,
      storefrontVersionId: result.published.id,
      publishedByUserId: actor.id,
      previousVersionId,
    },
  });

  return result;
}

export async function listThemeVersions(storeId: string) {
  return prisma.storefrontVersion.findMany({
    where: { storeId },
    orderBy: { versionNumber: 'desc' },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function restoreThemeVersion(
  storeId: string,
  versionId: string,
  actor: { id: string; role: string },
) {
  const version = await prisma.storefrontVersion.findFirst({
    where: { id: versionId, storeId },
  });
  if (!version) throw AppError.notFound('Theme version not found');

  const storefront = await getDraftTheme(storeId);
  const latest = await prisma.storefrontVersion.findFirst({
    where: { storefrontId: storefront.id },
    orderBy: { versionNumber: 'desc' },
  });

  const draft = await prisma.$transaction(async (tx) => {
    const newDraft = await tx.storefrontVersion.create({
      data: {
        storefrontId: storefront.id,
        storeId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        status: 'DRAFT',
        layout: version.layout as Prisma.InputJsonValue,
        themeSettings: version.themeSettings as Prisma.InputJsonValue,
        createdById: actor.id,
      },
    });

    await tx.storefront.update({
      where: { id: storefront.id },
      data: { draftVersionId: newDraft.id },
    });

    return newDraft;
  });

  emitAfterCommit('StoreThemeRolledBack', {
    storeId,
    actorId: actor.id,
    payload: {
      storeId,
      restoredFromVersionId: versionId,
      newDraftVersionId: draft.id,
      actorId: actor.id,
    },
  });

  return draft;
}
