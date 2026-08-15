import {
  DEFAULT_SECTION_DEFS,
  type ThemeSection,
  type ThemeSectionType,
} from '@commercenest/types/schemas/theme';

/**
 * Pure section-array operations for Theme Builder Pro.
 *
 * Kept separate from any React state/editor code so add/delete/duplicate/
 * reorder can be unit-tested directly, and so the isolated Pro module never
 * needs to reach into (or duplicate) the Standard Builder's editor logic —
 * both editors ultimately read/write the same `ThemeSection[]` shape from
 * `@commercenest/types`.
 */

export function newSectionId(type: string): string {
  return `${type}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createSection(type: ThemeSectionType): ThemeSection {
  const def = DEFAULT_SECTION_DEFS.find((d) => d.type === type);
  return {
    id: newSectionId(type),
    type,
    visible: true,
    settings: { ...(def?.defaultSettings || {}) },
  };
}

/** Inserts a new section of `type` at `index` (end of list when omitted). */
export function insertSection(
  sections: ThemeSection[],
  type: ThemeSectionType,
  index?: number,
): { sections: ThemeSection[]; section: ThemeSection } {
  const section = createSection(type);
  const at = index === undefined ? sections.length : Math.max(0, Math.min(index, sections.length));
  const next = [...sections.slice(0, at), section, ...sections.slice(at)];
  return { sections: next, section };
}

export function deleteSection(sections: ThemeSection[], id: string): ThemeSection[] {
  return sections.filter((s) => s.id !== id);
}

/**
 * Deep-clones the settings object so editing the duplicate can never mutate
 * the original through a shared nested reference (arrays like `items` on
 * why-choose-us/testimonials would otherwise be shared, not copied).
 */
export function duplicateSection(
  sections: ThemeSection[],
  id: string,
): { sections: ThemeSection[]; section: ThemeSection | null } {
  const index = sections.findIndex((s) => s.id === id);
  if (index === -1) return { sections, section: null };
  const original = sections[index]!;
  const clone: ThemeSection = {
    id: newSectionId(original.type),
    type: original.type,
    visible: original.visible,
    settings: JSON.parse(JSON.stringify(original.settings)) as Record<string, unknown>,
  };
  const next = [...sections.slice(0, index + 1), clone, ...sections.slice(index + 1)];
  return { sections: next, section: clone };
}

export function moveSection(
  sections: ThemeSection[],
  id: string,
  direction: 'up' | 'down',
): ThemeSection[] {
  const index = sections.findIndex((s) => s.id === id);
  if (index === -1) return sections;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= sections.length) return sections;
  const next = [...sections];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}

export function reorderSections(
  sections: ThemeSection[],
  fromIndex: number,
  toIndex: number,
): ThemeSection[] {
  if (
    fromIndex < 0 ||
    fromIndex >= sections.length ||
    toIndex < 0 ||
    toIndex >= sections.length ||
    fromIndex === toIndex
  ) {
    return sections;
  }
  const next = [...sections];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved!);
  return next;
}

export function toggleVisibility(sections: ThemeSection[], id: string): ThemeSection[] {
  return sections.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s));
}

export function patchSectionSettings(
  sections: ThemeSection[],
  id: string,
  patch: Record<string, unknown>,
): ThemeSection[] {
  return sections.map((s) =>
    s.id === id ? { ...s, settings: { ...s.settings, ...patch } } : s,
  );
}

// ---------------------------------------------------------------------------
// Responsive foundation (V1 scope): a small, universally-applicable set of
// per-breakpoint overrides — visibility and vertical spacing — stored under
// `settings.responsive`. This is additive and namespaced so it never
// collides with the Standard Builder's existing per-type settings; a theme
// edited in Pro remains fully valid when reopened in Standard (unknown keys
// are simply preserved, per the "do not destroy Pro-only properties"
// requirement), and a theme with no `responsive` key behaves exactly as
// before (desktop-only) in both editors.

export type ResponsiveDevice = 'tablet' | 'mobile';
export const SPACING_VALUES = ['sm', 'md', 'lg', 'xl'] as const;
export type SpacingValue = (typeof SPACING_VALUES)[number];

export type ResponsiveOverride = {
  hidden?: boolean;
  spacing?: SpacingValue;
};

function asResponsiveMap(settings: Record<string, unknown>): Record<ResponsiveDevice, ResponsiveOverride> {
  const raw = settings.responsive;
  const map = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  return {
    tablet: (map.tablet as ResponsiveOverride) || {},
    mobile: (map.mobile as ResponsiveOverride) || {},
  };
}

export function getResponsiveOverride(
  section: ThemeSection,
  device: ResponsiveDevice,
): ResponsiveOverride {
  return asResponsiveMap(section.settings)[device];
}

export function isHiddenOnDevice(section: ThemeSection, device: 'desktop' | ResponsiveDevice): boolean {
  if (device === 'desktop') return false;
  return getResponsiveOverride(section, device).hidden === true;
}

export function resolveSpacing(
  section: ThemeSection,
  device: 'desktop' | ResponsiveDevice,
): SpacingValue {
  const base = SPACING_VALUES.includes(section.settings.spacing as SpacingValue)
    ? (section.settings.spacing as SpacingValue)
    : 'md';
  if (device === 'desktop') return base;
  const override = getResponsiveOverride(section, device).spacing;
  return override && SPACING_VALUES.includes(override) ? override : base;
}

export function setResponsiveOverride(
  sections: ThemeSection[],
  id: string,
  device: ResponsiveDevice,
  patch: ResponsiveOverride,
): ThemeSection[] {
  return sections.map((s) => {
    if (s.id !== id) return s;
    const current = asResponsiveMap(s.settings);
    const nextOverride = { ...current[device], ...patch };
    return {
      ...s,
      settings: {
        ...s.settings,
        responsive: { ...current, [device]: nextOverride },
      },
    };
  });
}
