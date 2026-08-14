import { z } from 'zod';
import { normalizeThemeDocument } from '@commercenest/types';
import type { Prisma } from '@commercenest/prisma';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog } from './audit.service.js';
import * as themeService from './theme.service.js';

const presetInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(60),
  description: z.string().trim().max(1000).optional(),
  displayOrder: z.number().int().default(0),
  layout: z.unknown(),
  themeSettings: z.unknown(),
});

export async function listThemePresets() {
  return prisma.template.findMany({
    where: { isPreset: true },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getThemePreset(id: string) {
  const preset = await prisma.template.findFirst({ where: { id, isPreset: true } });
  if (!preset) throw AppError.notFound('Prebuilt layout not found');
  return preset;
}

export async function createThemePreset(
  input: unknown,
  actor: { id: string; role: string },
) {
  const data = presetInputSchema.parse(input);
  const normalized = normalizeThemeDocument({
    layout: data.layout,
    themeSettings: data.themeSettings,
  });

  return prisma.template.create({
    data: {
      name: data.name,
      category: data.category,
      description: data.description,
      displayOrder: data.displayOrder,
      isPreset: true,
      layout: normalized.layout as Prisma.InputJsonValue,
      themeSettings: normalized.themeSettings as Prisma.InputJsonValue,
      createdById: actor.id,
    },
  });
}

export async function updateThemePreset(
  id: string,
  input: unknown,
) {
  const data = presetInputSchema.partial().parse(input);
  await getThemePreset(id);

  const normalized =
    data.layout !== undefined || data.themeSettings !== undefined
      ? normalizeThemeDocument({ layout: data.layout, themeSettings: data.themeSettings })
      : null;

  return prisma.template.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.displayOrder !== undefined ? { displayOrder: data.displayOrder } : {}),
      ...(normalized
        ? {
            layout: normalized.layout as Prisma.InputJsonValue,
            themeSettings: normalized.themeSettings as Prisma.InputJsonValue,
          }
        : {}),
    },
  });
}

export async function deleteThemePreset(id: string) {
  await getThemePreset(id);
  await prisma.template.delete({ where: { id } });
  return { deleted: true };
}

/**
 * Applies a prebuilt layout to a store's DRAFT — never publishes directly.
 * Master Admin reviews the draft (and optionally customizes it further)
 * before explicitly publishing, exactly like any other draft edit.
 */
export async function applyThemePresetToStore(
  storeId: string,
  presetId: string,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const preset = await getThemePreset(presetId);

  const draft = await themeService.saveDraftTheme(
    storeId,
    { layout: preset.layout, themeSettings: preset.themeSettings },
    actor.id,
  );

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: 'THEME_PRESET_APPLIED',
    targetType: 'StorefrontVersion',
    targetId: draft.id,
    storeId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    metadata: { presetId, presetName: preset.name },
  });

  return draft;
}
