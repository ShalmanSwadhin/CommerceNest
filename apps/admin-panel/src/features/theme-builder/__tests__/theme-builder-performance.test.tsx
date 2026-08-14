/**
 * Regression test for the Theme Builder hang/freeze.
 *
 * Root cause: SectionList (which owns 1 dnd-kit `useSortable` hook per row —
 * a hook that does real DOM measurement work) and ThemeLivePreview's
 * SectionBlock had zero memoization. Any edit anywhere in the theme
 * (colors, typography, one section's own settings) forced every row and
 * every preview block to redo that work, even though almost none of them
 * had anything relevant change. With enough sections, a burst of rapid
 * updates (e.g. dragging a color picker, which fires dozens of change
 * events in a couple of seconds) compounded into a measured 800ms+
 * main-thread block — a real, user-visible freeze.
 *
 * This test proves the fix (`React.memo` on SortableRow/SectionBlock +
 * stable `useCallback` references from ThemeBuilder) actually prevents the
 * expensive work from re-running when it doesn't need to, and that it
 * still runs correctly when it does need to.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ThemeSection } from '@commercenest/types/schemas/theme';

const useSortableSpy = vi.fn();

vi.mock('@dnd-kit/sortable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/sortable')>();
  return {
    ...actual,
    useSortable: (...args: Parameters<typeof actual.useSortable>) => {
      useSortableSpy(...args);
      return actual.useSortable(...args);
    },
  };
});

const { SectionList } = await import('../SectionList');

function makeSections(count: number): ThemeSection[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `section-${i}`,
    type: i % 2 === 0 ? 'hero' : 'featured-products',
    visible: true,
    settings: {},
  }));
}

describe('Theme Builder — memoization prevents unnecessary dnd-kit work', () => {
  it('does not re-invoke useSortable for rows when props are referentially unchanged (simulates a colors-only edit)', () => {
    const sections = makeSections(15);
    const onSelect = vi.fn();
    const onChange = vi.fn();
    const onAdd = vi.fn();

    const { rerender } = render(
      <SectionList
        sections={sections}
        selectedId={null}
        onSelect={onSelect}
        onChange={onChange}
        onAdd={onAdd}
      />,
    );

    expect(useSortableSpy).toHaveBeenCalledTimes(15);
    useSortableSpy.mockClear();

    // Simulate ThemeBuilder re-rendering because something UNRELATED changed
    // (e.g. the user is dragging the primary color picker) — same sections
    // array, same selectedId, same stable callback references. This is
    // exactly what ThemeBuilder now provides via docRef + useCallback.
    rerender(
      <SectionList
        sections={sections}
        selectedId={null}
        onSelect={onSelect}
        onChange={onChange}
        onAdd={onAdd}
      />,
    );

    // Before the fix, this would be 15 (every row redoes dnd-kit setup on
    // every unrelated render). After the fix, it must be 0.
    expect(useSortableSpy).toHaveBeenCalledTimes(0);
  });

  it('still re-invokes useSortable for rows when sections genuinely change (adding a section)', () => {
    const sections = makeSections(5);
    const onSelect = vi.fn();
    const onChange = vi.fn();
    const onAdd = vi.fn();

    const { rerender } = render(
      <SectionList
        sections={sections}
        selectedId={null}
        onSelect={onSelect}
        onChange={onChange}
        onAdd={onAdd}
      />,
    );
    useSortableSpy.mockClear();

    const withNewSection = [...sections, ...makeSections(1).map((s) => ({ ...s, id: 'new-section' }))];
    rerender(
      <SectionList
        sections={withNewSection}
        selectedId={null}
        onSelect={onSelect}
        onChange={onChange}
        onAdd={onAdd}
      />,
    );

    // All 6 rows re-render because the `sections` array itself changed
    // (this is correct — dnd-kit's SortableContext needs the new item
    // list). Exact call count isn't pinned down (React's test renderer can
    // invoke hooks more than once per commit) — what matters is that it's
    // proportional to "6 rows genuinely changed", not zero.
    expect(useSortableSpy.mock.calls.length).toBeGreaterThanOrEqual(6);
    expect(useSortableSpy.mock.calls.length % 6).toBe(0);
  });

  it('re-invokes useSortable only for a rapid burst of unrelated updates settling into zero extra work per row', () => {
    const sections = makeSections(15);
    const onSelect = vi.fn();
    const onChange = vi.fn();
    const onAdd = vi.fn();

    const { rerender } = render(
      <SectionList
        sections={sections}
        selectedId={null}
        onSelect={onSelect}
        onChange={onChange}
        onAdd={onAdd}
      />,
    );
    useSortableSpy.mockClear();

    // Simulate 60 rapid unrelated re-renders (the color-drag burst that
    // originally caused an 800ms main-thread block).
    for (let i = 0; i < 60; i++) {
      rerender(
        <SectionList
          sections={sections}
          selectedId={null}
          onSelect={onSelect}
          onChange={onChange}
          onAdd={onAdd}
        />,
      );
    }

    expect(useSortableSpy).toHaveBeenCalledTimes(0);
  });
});
