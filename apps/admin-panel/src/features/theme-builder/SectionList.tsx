import { memo, useCallback, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DEFAULT_SECTION_DEFS,
  type ThemeSection,
  type ThemeSectionType,
} from '@commercenest/types/schemas/theme';
import { Eye, EyeOff, FileText, GripVertical, Layers, Plus, Settings2 } from 'lucide-react';

const LABELS: Record<ThemeSectionType, string> = Object.fromEntries(
  DEFAULT_SECTION_DEFS.map((d) => [d.type, d.label]),
) as Record<ThemeSectionType, string>;

/**
 * Memoized so an edit anywhere else in the theme (colors, typography, a
 * different section's settings) doesn't force every row to redo dnd-kit's
 * `useSortable` setup — that hook does real DOM measurement work per row,
 * and with many sections that cost compounds fast under rapid successive
 * updates (e.g. dragging a color picker fires dozens of change events in a
 * couple seconds). `onSelect`/`onToggle` are id-parameterized so the parent
 * can pass one stable callback instead of a fresh closure per row, which is
 * what makes this memoization actually take effect.
 */
const SortableRow = memo(function SortableRow({
  section,
  selected,
  onSelect,
  onToggle,
}: {
  section: ThemeSection;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`flex items-center gap-1 rounded-xl border px-1.5 py-1.5 ${
        selected
          ? 'border-primary bg-primary/[0.06]'
          : 'border-transparent hover:border-line hover:bg-surface-raised'
      } ${isDragging ? 'z-10 bg-white shadow-lg' : ''} ${
        section.visible ? '' : 'opacity-55'
      }`}
    >
      <button
        type="button"
        className="cursor-grab rounded-md p-1.5 text-ink-tertiary active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 truncate px-1 text-left text-sm font-medium text-ink"
        onClick={() => onSelect(section.id)}
      >
        {LABELS[section.type] || section.type}
      </button>
      <button
        type="button"
        className="rounded-md p-1.5 text-ink-secondary hover:bg-black/5"
        aria-label={section.visible ? 'Hide section' : 'Show section'}
        onClick={() => onToggle(section.id)}
      >
        {section.visible ? (
          <Eye className="h-4 w-4" />
        ) : (
          <EyeOff className="h-4 w-4" />
        )}
      </button>
      <button
        type="button"
        className="rounded-md p-1.5 text-ink-secondary hover:bg-black/5"
        aria-label="Edit section"
        onClick={() => onSelect(section.id)}
      >
        <Settings2 className="h-4 w-4" />
      </button>
    </div>
  );
});

type SectionListProps = {
  sections: ThemeSection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (sections: ThemeSection[]) => void;
  onAdd: (type: ThemeSectionType) => void;
};

/**
 * Memoized for the same reason as SortableRow — this owns the whole
 * dnd-kit sortable list, and an edit to colors/typography/a single
 * section's settings has no business re-running 15 rows' worth of drag
 * setup. Requires the parent (ThemeBuilder) to pass stable callback
 * references via useCallback, otherwise the memo comparison always fails.
 */
type SidebarTab = 'pages' | 'sections';

export const SectionList = memo(function SectionList({
  sections,
  selectedId,
  onSelect,
  onChange,
  onAdd,
}: SectionListProps) {
  const [tab, setTab] = useState<SidebarTab>('sections');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = sections.findIndex((s) => s.id === active.id);
      const newIndex = sections.findIndex((s) => s.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      onChange(arrayMove(sections, oldIndex, newIndex));
    },
    [sections, onChange],
  );

  const onToggle = useCallback(
    (id: string) => {
      onChange(sections.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)));
    },
    [sections, onChange],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Two tabs instead of stacking Pages + Sections + Add section
          vertically — each tab now gets the sidebar's FULL height instead
          of all three competing for a slice of it, which is what made the
          sections list feel cramped once its available height was
          correctly clamped to the real viewport (see the grid/scroll fix
          in ThemeBuilder.tsx). */}
      <div className="flex gap-1 border-b border-line p-2">
        <button
          type="button"
          onClick={() => setTab('pages')}
          aria-pressed={tab === 'pages'}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
            tab === 'pages'
              ? 'bg-primary text-white'
              : 'text-ink-secondary hover:bg-surface-raised'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          Pages
        </button>
        <button
          type="button"
          onClick={() => setTab('sections')}
          aria-pressed={tab === 'sections'}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
            tab === 'sections'
              ? 'bg-primary text-white'
              : 'text-ink-secondary hover:bg-surface-raised'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          Sections
        </button>
      </div>

      {tab === 'pages' ? (
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">
            Pages
          </p>
          <div className="mt-2 space-y-0.5">
            <button
              type="button"
              onClick={() => setTab('sections')}
              className="w-full rounded-lg bg-primary/10 px-2.5 py-1.5 text-left text-xs font-semibold text-primary"
            >
              Homepage
            </button>
            {['Shop', 'Product', 'Cart', 'Checkout'].map((page) => (
              <div
                key={page}
                className="rounded-lg px-2.5 py-1.5 text-xs text-ink-tertiary"
                title="Homepage sections ship first; other pages follow the storefront templates."
              >
                {page}
                <span className="ml-1 text-[10px] opacity-70">(template)</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-ink-secondary">
            Only the homepage is section-editable today. Other pages follow the
            storefront&apos;s built-in templates.
          </p>
        </div>
      ) : (
        <>
          <div className="border-b border-line px-3 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">
              Homepage sections
            </p>
            <p className="mt-0.5 text-xs text-ink-secondary">
              Drag to reorder · Toggle visibility · Click to edit
            </p>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={sections.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {sections.map((section) => (
                  <SortableRow
                    key={section.id}
                    section={section}
                    selected={selectedId === section.id}
                    onSelect={onSelect}
                    onToggle={onToggle}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          {/* max-h + overflow-y-auto is load-bearing: without it, this
              footer has `overflow: visible`, so per the flexbox spec its
              automatic minimum size is its own full content height — it
              never shrinks, no matter how little room is available, which
              would squeeze the sections list above down to a sliver.
              Capping it and letting it scroll internally instead gives the
              sections list (the primary, more-used surface) priority for
              the available space. */}
          <div className="max-h-[220px] overflow-y-auto border-t border-line p-2">
            <p className="mb-1.5 px-1 text-[11px] font-semibold text-ink-tertiary">
              Add section
            </p>
            <div className="grid grid-cols-1 gap-1">
              {DEFAULT_SECTION_DEFS.map((def) => (
                <button
                  key={def.type}
                  type="button"
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-ink-secondary hover:bg-surface-raised hover:text-ink"
                  onClick={() => onAdd(def.type)}
                >
                  <Plus className="h-3.5 w-3.5 text-primary" />
                  {def.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
});
