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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DEFAULT_SECTION_DEFS,
  type ThemeSection,
  type ThemeSectionType,
} from '@commercenest/types/schemas/theme';
import { Button, Modal } from '@commercenest/ui';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react';

const LABELS: Record<ThemeSectionType, string> = Object.fromEntries(
  DEFAULT_SECTION_DEFS.map((d) => [d.type, d.label]),
) as Record<ThemeSectionType, string>;

/**
 * Memoized for the same reason as the Standard Builder's SortableRow: with
 * many sections, dnd-kit's `useSortable` does real DOM measurement per row,
 * so an edit anywhere else in the theme shouldn't force every row to redo
 * that setup. Requires the parent to pass stable (useCallback) handlers.
 */
const LayerRow = memo(function LayerRow({
  section,
  index,
  count,
  selected,
  onSelect,
  onToggleVisible,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  section: ThemeSection;
  index: number;
  count: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-xl border px-1.5 py-1.5 ${
        selected ? 'border-primary bg-primary/[0.06]' : 'border-transparent hover:border-line hover:bg-surface-raised'
      } ${isDragging ? 'z-10 bg-white shadow-lg' : ''} ${section.visible ? '' : 'opacity-55'}`}
    >
      <div className="flex items-center gap-1">
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
          onClick={() => onToggleVisible(section.id)}
        >
          {section.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      </div>
      {/* Keyboard/accessibility-reachable alternative to drag reorder, plus
          real delete/duplicate — the concrete Standard Builder gaps this
          module exists to close (see V1 spec §8 "keyboard/accessibility
          alternative for reordering" and §5/§10/§11 add/delete/duplicate). */}
      <div className="mt-1 flex items-center gap-0.5 pl-7">
        <button
          type="button"
          className="rounded-md p-1 text-ink-tertiary hover:bg-black/5 disabled:opacity-30"
          aria-label={`Move ${LABELS[section.type]} up`}
          disabled={index === 0}
          onClick={() => onMoveUp(section.id)}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="rounded-md p-1 text-ink-tertiary hover:bg-black/5 disabled:opacity-30"
          aria-label={`Move ${LABELS[section.type]} down`}
          disabled={index === count - 1}
          onClick={() => onMoveDown(section.id)}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="rounded-md p-1 text-ink-tertiary hover:bg-black/5"
          aria-label={`Duplicate ${LABELS[section.type]}`}
          onClick={() => onDuplicate(section.id)}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="ml-auto rounded-md p-1 text-red-500 hover:bg-red-50"
          aria-label={`Delete ${LABELS[section.type]}`}
          onClick={() => onDelete(section.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
});

type LayersPanelProps = {
  sections: ThemeSection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onToggleVisible: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (type: ThemeSectionType) => void;
};

export const LayersPanel = memo(function LayersPanel({
  sections,
  selectedId,
  onSelect,
  onReorder,
  onMove,
  onToggleVisible,
  onDuplicate,
  onDelete,
  onAdd,
}: LayersPanelProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fromIndex = sections.findIndex((s) => s.id === active.id);
      const toIndex = sections.findIndex((s) => s.id === over.id);
      if (fromIndex < 0 || toIndex < 0) return;
      onReorder(fromIndex, toIndex);
    },
    [sections, onReorder],
  );

  const requestDelete = useCallback((id: string) => setConfirmDeleteId(id), []);
  const sectionToDelete = sections.find((s) => s.id === confirmDeleteId) || null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">
          Layers
        </p>
        <p className="mt-0.5 text-xs text-ink-secondary">
          Drag or use the arrows to reorder · click to edit
        </p>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {sections.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-ink-tertiary">
            No sections yet — add one below.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {sections.map((section, index) => (
                <LayerRow
                  key={section.id}
                  section={section}
                  index={index}
                  count={sections.length}
                  selected={selectedId === section.id}
                  onSelect={onSelect}
                  onToggleVisible={onToggleVisible}
                  onDuplicate={onDuplicate}
                  onDelete={requestDelete}
                  onMoveUp={(id) => onMove(id, 'up')}
                  onMoveDown={(id) => onMove(id, 'down')}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="max-h-[220px] overflow-y-auto border-t border-line p-2">
        <p className="mb-1.5 px-1 text-[11px] font-semibold text-ink-tertiary">Add section</p>
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

      <Modal
        open={!!sectionToDelete}
        onClose={() => setConfirmDeleteId(null)}
        title="Delete section?"
        description={
          sectionToDelete
            ? `"${LABELS[sectionToDelete.type]}" will be removed from the draft. This does not publish automatically, and Undo restores it.`
            : undefined
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (confirmDeleteId) onDelete(confirmDeleteId);
              setConfirmDeleteId(null);
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
});
