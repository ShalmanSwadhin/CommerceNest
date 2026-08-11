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
import { Eye, EyeOff, GripVertical, Plus, Settings2 } from 'lucide-react';

const LABELS: Record<ThemeSectionType, string> = Object.fromEntries(
  DEFAULT_SECTION_DEFS.map((d) => [d.type, d.label]),
) as Record<ThemeSectionType, string>;

function SortableRow({
  section,
  selected,
  onSelect,
  onToggle,
}: {
  section: ThemeSection;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
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
          ? 'border-brand bg-brand/[0.06]'
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
        onClick={onSelect}
      >
        {LABELS[section.type] || section.type}
      </button>
      <button
        type="button"
        className="rounded-md p-1.5 text-ink-secondary hover:bg-black/5"
        aria-label={section.visible ? 'Hide section' : 'Show section'}
        onClick={onToggle}
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
        onClick={onSelect}
      >
        <Settings2 className="h-4 w-4" />
      </button>
    </div>
  );
}

type SectionListProps = {
  sections: ThemeSection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (sections: ThemeSection[]) => void;
  onAdd: (type: ThemeSectionType) => void;
};

export function SectionList({
  sections,
  selectedId,
  onSelect,
  onChange,
  onAdd,
}: SectionListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(sections, oldIndex, newIndex));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">
          Pages
        </p>
        <div className="mt-2 space-y-0.5">
          <div className="rounded-lg bg-brand/10 px-2.5 py-1.5 text-xs font-semibold text-brand">
            Homepage
          </div>
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
        <p className="mt-3 text-xs font-bold uppercase tracking-wider text-ink-tertiary">
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
                onSelect={() => onSelect(section.id)}
                onToggle={() =>
                  onChange(
                    sections.map((s) =>
                      s.id === section.id ? { ...s, visible: !s.visible } : s,
                    ),
                  )
                }
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <div className="border-t border-line p-2">
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
              <Plus className="h-3.5 w-3.5 text-brand" />
              {def.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
