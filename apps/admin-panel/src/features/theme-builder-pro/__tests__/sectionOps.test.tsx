import { describe, expect, it } from 'vitest';
import type { ThemeSection } from '@commercenest/types/schemas/theme';
import {
  createSection,
  deleteSection,
  duplicateSection,
  getResponsiveOverride,
  insertSection,
  isHiddenOnDevice,
  moveSection,
  patchSectionSettings,
  reorderSections,
  resolveSpacing,
  setResponsiveOverride,
  toggleVisibility,
} from '../sectionOps';

function section(id: string, type: ThemeSection['type'] = 'hero'): ThemeSection {
  return { id, type, visible: true, settings: { title: id } };
}

describe('insertSection', () => {
  it('appends to the end by default', () => {
    const { sections, section: created } = insertSection([section('a')], 'newsletter');
    expect(sections.map((s) => s.id)).toEqual(['a', created.id]);
    expect(created.type).toBe('newsletter');
    expect(created.settings.title).toBe('Stay in the loop');
  });

  it('inserts at a specific index', () => {
    const { sections, section: created } = insertSection(
      [section('a'), section('b')],
      'newsletter',
      1,
    );
    expect(sections.map((s) => s.id)).toEqual(['a', created.id, 'b']);
  });

  it('generates a unique id per call', () => {
    const first = insertSection([], 'hero').section;
    const second = insertSection([], 'hero').section;
    expect(first.id).not.toBe(second.id);
  });
});

describe('deleteSection', () => {
  it('removes only the targeted section and preserves order', () => {
    const sections = [section('a'), section('b'), section('c')];
    expect(deleteSection(sections, 'b').map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('is a no-op when the id does not exist', () => {
    const sections = [section('a')];
    expect(deleteSection(sections, 'missing')).toEqual(sections);
  });
});

describe('duplicateSection', () => {
  it('inserts a clone immediately after the original with a new id', () => {
    const sections = [section('a'), section('b')];
    const { sections: next, section: clone } = duplicateSection(sections, 'a');
    expect(next.map((s) => s.id)).toEqual(['a', clone!.id, 'b']);
    expect(clone!.id).not.toBe('a');
  });

  it('deep-clones settings so editing the duplicate never mutates the original', () => {
    const original: ThemeSection = {
      id: 'w1',
      type: 'why-choose-us',
      visible: true,
      settings: { title: 'Why us', items: [{ title: 'Fast delivery' }] },
    };
    const { sections: next, section: clone } = duplicateSection([original], 'w1');
    (clone!.settings.items as Array<{ title: string }>)[0]!.title = 'Changed';
    const untouchedOriginal = next.find((s) => s.id === 'w1')!;
    expect((untouchedOriginal.settings.items as Array<{ title: string }>)[0]!.title).toBe(
      'Fast delivery',
    );
  });

  it('returns the original list unchanged (by content) when the id does not exist', () => {
    const sections = [section('a')];
    const result = duplicateSection(sections, 'missing');
    expect(result.section).toBeNull();
    expect(result.sections).toEqual(sections);
  });
});

describe('moveSection', () => {
  it('moves a section up one position', () => {
    const sections = [section('a'), section('b'), section('c')];
    expect(moveSection(sections, 'b', 'up').map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });

  it('moves a section down one position', () => {
    const sections = [section('a'), section('b'), section('c')];
    expect(moveSection(sections, 'b', 'down').map((s) => s.id)).toEqual(['a', 'c', 'b']);
  });

  it('does nothing when already at the top/bottom boundary', () => {
    const sections = [section('a'), section('b')];
    expect(moveSection(sections, 'a', 'up').map((s) => s.id)).toEqual(['a', 'b']);
    expect(moveSection(sections, 'b', 'down').map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('reorderSections', () => {
  it('moves an item from one index to another (drag-drop semantics)', () => {
    const sections = [section('a'), section('b'), section('c'), section('d')];
    expect(reorderSections(sections, 0, 2).map((s) => s.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('is a no-op for out-of-range or identical indexes', () => {
    const sections = [section('a'), section('b')];
    expect(reorderSections(sections, 0, 0)).toEqual(sections);
    expect(reorderSections(sections, -1, 1)).toEqual(sections);
    expect(reorderSections(sections, 0, 5)).toEqual(sections);
  });
});

describe('toggleVisibility', () => {
  it('flips only the targeted section', () => {
    const sections = [section('a'), section('b')];
    const next = toggleVisibility(sections, 'a');
    expect(next.find((s) => s.id === 'a')!.visible).toBe(false);
    expect(next.find((s) => s.id === 'b')!.visible).toBe(true);
  });
});

describe('patchSectionSettings', () => {
  it('merges into the existing settings without dropping other keys', () => {
    const sections = [{ id: 'a', type: 'hero' as const, visible: true, settings: { title: 'T', subtitle: 'S' } }];
    const next = patchSectionSettings(sections, 'a', { title: 'New' });
    expect(next[0]!.settings).toEqual({ title: 'New', subtitle: 'S' });
  });
});

describe('createSection', () => {
  it('seeds real default settings from DEFAULT_SECTION_DEFS, not an empty object', () => {
    const s = createSection('hero');
    expect(s.settings.primaryCtaLabel).toBe('Shop Now');
    expect(s.visible).toBe(true);
  });
});

describe('responsive foundation (spacing + visibility overrides)', () => {
  it('resolves desktop spacing to the base value with no override present', () => {
    const s = section('a');
    expect(resolveSpacing(s, 'desktop')).toBe('md');
    expect(resolveSpacing(s, 'tablet')).toBe('md');
    expect(resolveSpacing(s, 'mobile')).toBe('md');
  });

  it('setResponsiveOverride sets a per-device spacing override without touching the other device', () => {
    let sections = [section('a')];
    sections = setResponsiveOverride(sections, 'a', 'mobile', { spacing: 'sm' });
    const s = sections[0]!;
    expect(resolveSpacing(s, 'desktop')).toBe('md');
    expect(resolveSpacing(s, 'tablet')).toBe('md');
    expect(resolveSpacing(s, 'mobile')).toBe('sm');
    expect(getResponsiveOverride(s, 'tablet')).toEqual({});
  });

  it('desktop can never be hidden via responsive overrides — only tablet/mobile', () => {
    let sections = [section('a')];
    sections = setResponsiveOverride(sections, 'a', 'mobile', { hidden: true });
    const s = sections[0]!;
    expect(isHiddenOnDevice(s, 'desktop')).toBe(false);
    expect(isHiddenOnDevice(s, 'tablet')).toBe(false);
    expect(isHiddenOnDevice(s, 'mobile')).toBe(true);
  });

  it('editing tablet then mobile then desktop again does not overwrite unrelated values (V1 spec §16)', () => {
    let sections = [section('a')];
    sections = setResponsiveOverride(sections, 'a', 'tablet', { spacing: 'lg' });
    sections = setResponsiveOverride(sections, 'a', 'mobile', { spacing: 'sm' });
    const s = sections[0]!;
    expect(resolveSpacing(s, 'tablet')).toBe('lg');
    expect(resolveSpacing(s, 'mobile')).toBe('sm');
    expect(resolveSpacing(s, 'desktop')).toBe('md');
  });
});
