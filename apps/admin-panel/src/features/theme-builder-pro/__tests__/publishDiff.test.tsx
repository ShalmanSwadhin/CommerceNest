import { describe, expect, it } from 'vitest';
import type { ThemeSection } from '@commercenest/types/schemas/theme';
import { diffSections, summarizeDiff } from '../publishDiff';

function section(id: string, overrides: Partial<ThemeSection> = {}): ThemeSection {
  return { id, type: 'hero', visible: true, settings: { title: id }, ...overrides };
}

describe('diffSections', () => {
  it('marks everything as added when there is no published version yet (first publish)', () => {
    const entries = diffSections([section('a'), section('b')], null);
    expect(entries.every((e) => e.kind === 'added')).toBe(true);
    expect(entries).toHaveLength(2);
  });

  it('detects an added section not present in the published version', () => {
    const entries = diffSections([section('a'), section('b')], [section('a')]);
    expect(entries.find((e) => e.id === 'b')?.kind).toBe('added');
  });

  it('detects a removed section present in published but not current', () => {
    const entries = diffSections([section('a')], [section('a'), section('b')]);
    expect(entries.find((e) => e.id === 'b')?.kind).toBe('removed');
  });

  it('detects an unchanged section (identical settings/visibility/type)', () => {
    const entries = diffSections([section('a')], [section('a')]);
    expect(entries.find((e) => e.id === 'a')?.kind).toBe('unchanged');
  });

  it('detects a changed section when settings differ', () => {
    const entries = diffSections(
      [section('a', { settings: { title: 'New' } })],
      [section('a', { settings: { title: 'Old' } })],
    );
    expect(entries.find((e) => e.id === 'a')?.kind).toBe('changed');
  });

  it('detects a changed section when only visibility differs', () => {
    const entries = diffSections(
      [section('a', { visible: false })],
      [section('a', { visible: true })],
    );
    expect(entries.find((e) => e.id === 'a')?.kind).toBe('changed');
  });

  it('detects a changed section when only type differs (same id)', () => {
    const entries = diffSections(
      [section('a', { type: 'newsletter' })],
      [section('a', { type: 'hero' })],
    );
    expect(entries.find((e) => e.id === 'a')?.kind).toBe('changed');
  });

  it('handles a mixed diff correctly (added + removed + changed + unchanged together)', () => {
    const current = [
      section('a'), // unchanged
      section('b', { settings: { title: 'edited' } }), // changed
      section('d'), // added
    ];
    const published = [
      section('a'),
      section('b', { settings: { title: 'original' } }),
      section('c'), // removed
    ];
    const entries = diffSections(current, published);
    expect(summarizeDiff(entries)).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 1 });
  });
});
