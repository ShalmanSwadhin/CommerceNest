import type { ThemeSection } from '@commercenest/types/schemas/theme';

/**
 * Compares the current draft's sections against the last published
 * version's sections — real structural diffing (id/type/settings
 * equality), not a guess. Used by the Pro publish flow so a merchant can
 * see exactly what's about to go live before confirming (V3/V4 "Preview
 * Difference" / "Visual Diff" / "Publish Gate").
 */
export type SectionDiffKind = 'added' | 'removed' | 'changed' | 'unchanged';

export type SectionDiffEntry = {
  id: string;
  type: string;
  kind: SectionDiffKind;
};

function sectionsEqual(a: ThemeSection, b: ThemeSection): boolean {
  return (
    a.type === b.type &&
    a.visible === b.visible &&
    JSON.stringify(a.settings) === JSON.stringify(b.settings)
  );
}

export function diffSections(
  current: ThemeSection[],
  published: ThemeSection[] | null | undefined,
): SectionDiffEntry[] {
  const publishedById = new Map((published || []).map((s) => [s.id, s]));
  const currentIds = new Set(current.map((s) => s.id));

  const entries: SectionDiffEntry[] = current.map((section) => {
    const previous = publishedById.get(section.id);
    if (!previous) return { id: section.id, type: section.type, kind: 'added' };
    return {
      id: section.id,
      type: section.type,
      kind: sectionsEqual(section, previous) ? 'unchanged' : 'changed',
    };
  });

  for (const previous of published || []) {
    if (!currentIds.has(previous.id)) {
      entries.push({ id: previous.id, type: previous.type, kind: 'removed' });
    }
  }

  return entries;
}

export function summarizeDiff(entries: SectionDiffEntry[]) {
  return {
    added: entries.filter((e) => e.kind === 'added').length,
    removed: entries.filter((e) => e.kind === 'removed').length,
    changed: entries.filter((e) => e.kind === 'changed').length,
    unchanged: entries.filter((e) => e.kind === 'unchanged').length,
  };
}
