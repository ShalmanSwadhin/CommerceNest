import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  DEFAULT_SECTION_DEFS,
  normalizeThemeDocument,
  type ThemeDocument,
  type ThemeSectionType,
} from '@commercenest/types/schemas/theme';
import { Badge, Button, Modal, useToast } from '@commercenest/ui';
import {
  ArrowLeft,
  Activity,
  ExternalLink,
  History,
  Monitor,
  PanelLeft,
  PanelRight,
  Palette,
  Smartphone,
  Sparkles,
  Tablet,
  Undo2,
  Redo2,
} from 'lucide-react';
import { DesignSystemPanel } from './DesignSystemPanel';
import { ThemeHealthPanel } from './ThemeHealthPanel';
import { diffSections, summarizeDiff } from './publishDiff';
import { adminApi, ApiClientError, unwrapList, type ThemeVersion } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { ErrorState, PageSkeleton } from '../../components/QueryState';
import { ThemeLivePreview } from '../theme-builder/ThemeLivePreview';
import { LayersPanel } from './LayersPanel';
import { ProInspector } from './ProInspector';
import {
  deleteSection,
  duplicateSection,
  insertSection,
  isHiddenOnDevice,
  moveSection,
  patchSectionSettings,
  reorderSections,
  setResponsiveOverride,
  toggleVisibility,
  type ResponsiveDevice,
  type SpacingValue,
} from './sectionOps';

type Device = 'desktop' | 'tablet' | 'mobile';

const SECTION_LABELS = Object.fromEntries(
  DEFAULT_SECTION_DEFS.map((d) => [d.type, d.label]),
) as Record<string, string>;

function storefrontPreviewUrl(slug: string) {
  if (typeof window === 'undefined') return '#';
  const { protocol, port } = window.location;
  const portSuffix =
    (protocol === 'http:' && (port === '80' || !port)) ||
    (protocol === 'https:' && (port === '443' || !port))
      ? ''
      : `:${port || '8080'}`;
  return `${protocol}//${slug}.localhost${portSuffix}/`;
}

type ThemeBuilderProProps = {
  storeId: string;
};

/**
 * Theme Builder Pro V1 — isolated from the Standard Builder (`../theme-builder/
 * ThemeBuilder.tsx`, `SectionList.tsx`, `SectionInspector.tsx` are untouched
 * by this feature). Reuses the same theme API, schema, media system, and
 * `ThemeLivePreview` renderer, so a theme edited here is immediately valid
 * and interoperable in the Standard Builder and vice versa — both editors
 * read/write the exact same draft document. New Pro-only capabilities
 * (delete/duplicate sections, keyboard-reachable reordering, per-breakpoint
 * spacing/visibility overrides) are stored under a namespaced
 * `settings.responsive` key that Standard simply ignores/preserves.
 */
export function ThemeBuilderPro({ storeId }: ThemeBuilderProProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [device, setDevice] = useState<Device>('desktop');
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [designSystemOpen, setDesignSystemOpen] = useState(false);
  const [themeHealthOpen, setThemeHealthOpen] = useState(false);
  const [publishLabel, setPublishLabel] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [doc, setDoc] = useState<ThemeDocument | null>(null);
  const [dirty, setDirty] = useState(false);
  const [past, setPast] = useState<ThemeDocument[]>([]);
  const [future, setFuture] = useState<ThemeDocument[]>([]);
  const skipHistory = useRef(false);
  const initializedForStore = useRef<string | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  const themeQ = useQuery({
    queryKey: ['admin', 'theme', storeId],
    queryFn: () => adminApi.getTheme(storeId),
    enabled: !!storeId,
  });

  const storeQ = useQuery({
    queryKey: ['admin', 'store', storeId],
    queryFn: async () => {
      const res = await adminApi.listStores({ limit: 100 });
      return unwrapList(res).find((s) => s.id === storeId) || null;
    },
    enabled: !!storeId,
  });

  const versionsQ = useQuery({
    queryKey: ['admin', 'theme-versions', storeId],
    queryFn: () => adminApi.themeVersions(storeId),
    enabled: !!storeId && (historyOpen || publishOpen),
  });

  // Same hydrate-once pattern as the Standard Builder: only sync from the
  // server the first time this store's theme loads, so save/publish
  // invalidations elsewhere don't silently wipe undo/redo history mid-edit.
  useEffect(() => {
    if (!themeQ.data?.draft || initializedForStore.current === storeId) return;
    initializedForStore.current = storeId;
    const normalized = normalizeThemeDocument({
      layout: themeQ.data.draft.layout,
      themeSettings: themeQ.data.draft.themeSettings,
    });
    skipHistory.current = true;
    setDoc(normalized);
    setDirty(false);
    setPast([]);
    setFuture([]);
    setSelectedId(normalized.layout.sections[0]?.id ?? null);
  }, [themeQ.data, storeId]);

  const pushHistory = useCallback((next: ThemeDocument) => {
    setDoc((prev) => {
      if (prev && !skipHistory.current) {
        setPast((p) => [...p.slice(-39), prev]);
        setFuture([]);
      }
      skipHistory.current = false;
      return next;
    });
    setDirty(true);
  }, []);

  const saveMut = useMutation({
    mutationFn: () => {
      if (!doc) throw new Error('No theme loaded');
      return adminApi.saveThemeDraft(storeId, {
        themeSettings: doc.themeSettings,
        layout: doc.layout,
      });
    },
    onSuccess: () => {
      toast({ title: 'Draft saved', tone: 'success' });
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ['admin', 'theme', storeId] });
      void qc.invalidateQueries({ queryKey: ['admin', 'theme-versions', storeId] });
    },
    onError: (err) =>
      toast({
        title: 'Save failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const publishMut = useMutation({
    mutationFn: async (label: string) => {
      if (dirty && doc) {
        await adminApi.saveThemeDraft(storeId, {
          themeSettings: doc.themeSettings,
          layout: doc.layout,
        });
      }
      return adminApi.publishTheme(storeId, label || undefined);
    },
    onSuccess: () => {
      toast({ title: 'Theme published', tone: 'success' });
      setPublishOpen(false);
      setPublishLabel('');
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ['admin', 'theme'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'theme-versions'] });
    },
    onError: (err) =>
      toast({
        title: 'Publish failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const restoreMut = useMutation({
    mutationFn: (versionId: string) => adminApi.restoreTheme(storeId, versionId),
    onSuccess: (restored) => {
      toast({ title: 'Restored to draft', tone: 'success' });
      setHistoryOpen(false);
      const normalized = normalizeThemeDocument({
        layout: restored.layout,
        themeSettings: restored.themeSettings,
      });
      skipHistory.current = true;
      setDoc(normalized);
      setDirty(false);
      setPast([]);
      setFuture([]);
      setSelectedId(normalized.layout.sections[0]?.id ?? null);
      void qc.invalidateQueries({ queryKey: ['admin', 'theme', storeId] });
      void qc.invalidateQueries({ queryKey: ['admin', 'theme-versions', storeId] });
    },
    onError: (err) =>
      toast({
        title: 'Restore failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const versions = useMemo(() => unwrapList(versionsQ.data) as ThemeVersion[], [versionsQ.data]);

  const publishedSections = useMemo(() => {
    const published = versions.find((v) => v.status === 'PUBLISHED');
    const layout = published?.layout as { sections?: unknown } | undefined;
    return Array.isArray(layout?.sections) ? (layout!.sections as ThemeDocument['layout']['sections']) : null;
  }, [versions]);

  const diffEntries = useMemo(
    () => (doc ? diffSections(doc.layout.sections, publishedSections) : []),
    [doc, publishedSections],
  );

  const handleSelectSection = useCallback((id: string) => {
    setSelectedId(id);
    setRightOpen(true);
  }, []);

  const withSections = useCallback(
    (mutate: (sections: ThemeDocument['layout']['sections']) => ThemeDocument['layout']['sections']) => {
      const current = docRef.current;
      if (!current) return;
      pushHistory({ ...current, layout: { sections: mutate(current.layout.sections) } });
    },
    [pushHistory],
  );

  const handleAdd = useCallback(
    (type: ThemeSectionType) => {
      withSections((sections) => {
        const { sections: next, section } = insertSection(sections, type);
        setSelectedId(section.id);
        return next;
      });
    },
    [withSections],
  );

  const handleDelete = useCallback(
    (id: string) => {
      withSections((sections) => {
        const next = deleteSection(sections, id);
        setSelectedId((current) => (current === id ? next[next.length - 1]?.id ?? null : current));
        return next;
      });
    },
    [withSections],
  );

  const handleDuplicate = useCallback(
    (id: string) => {
      withSections((sections) => {
        const { sections: next, section } = duplicateSection(sections, id);
        if (section) setSelectedId(section.id);
        return next;
      });
    },
    [withSections],
  );

  const handleMove = useCallback(
    (id: string, direction: 'up' | 'down') => {
      withSections((sections) => moveSection(sections, id, direction));
    },
    [withSections],
  );

  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      withSections((sections) => reorderSections(sections, fromIndex, toIndex));
    },
    [withSections],
  );

  const handleToggleVisible = useCallback(
    (id: string) => {
      withSections((sections) => toggleVisibility(sections, id));
    },
    [withSections],
  );

  const handlePatch = useCallback(
    (patch: Record<string, unknown>) => {
      if (!selectedId) return;
      withSections((sections) => patchSectionSettings(sections, selectedId, patch));
    },
    [selectedId, withSections],
  );

  const handlePatchThemeSettings = useCallback(
    (patch: Record<string, unknown>) => {
      const current = docRef.current;
      if (!current) return;
      pushHistory({ ...current, themeSettings: { ...current.themeSettings, ...patch } });
    },
    [pushHistory],
  );

  const handleResponsivePatch = useCallback(
    (deviceKey: ResponsiveDevice, patch: { hidden?: boolean; spacing?: SpacingValue }) => {
      if (!selectedId) return;
      withSections((sections) => setResponsiveOverride(sections, selectedId, deviceKey, patch));
    },
    [selectedId, withSections],
  );

  // Keyboard shortcut: Delete/Backspace removes the selected section, as
  // long as focus isn't inside a text input (so typing "delete" in a title
  // field doesn't nuke the section out from under the user).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isEditable) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        handleDelete(selectedId);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, handleDelete]);

  if (themeQ.isLoading || !doc) return <PageSkeleton />;
  if (themeQ.isError) {
    return (
      <ErrorState
        message={themeQ.error instanceof Error ? themeQ.error.message : undefined}
        onRetry={() => void themeQ.refetch()}
      />
    );
  }

  const storeName = storeQ.data?.name || 'Store';
  const slug = storeQ.data?.slug || 'store';
  const draftVersion = themeQ.data?.draft?.versionNumber;
  const selectedSection = doc.layout.sections.find((s) => s.id === selectedId) ?? null;

  // Makes the "hide on tablet/mobile" responsive override a real, visible
  // effect in the canvas the moment the device switcher changes — not just
  // a persisted value with no feedback. Desktop is never filtered (isHiddenOnDevice
  // returns false for 'desktop' unconditionally), so this is a no-op there.
  const previewDoc: ThemeDocument =
    device === 'desktop'
      ? doc
      : {
          ...doc,
          layout: {
            sections: doc.layout.sections.filter((s) => !isHiddenOnDevice(s, device)),
          },
        };

  const undo = () => {
    setPast((p) => {
      if (p.length === 0 || !doc) return p;
      const prev = p[p.length - 1]!;
      setFuture((f) => [doc, ...f]);
      skipHistory.current = true;
      setDoc(prev);
      setDirty(true);
      return p.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((f) => {
      if (f.length === 0 || !doc) return f;
      const [next, ...rest] = f;
      setPast((p) => [...p, doc]);
      skipHistory.current = true;
      setDoc(next!);
      setDirty(true);
      return rest;
    });
  };

  return (
    <div className="flex h-full min-h-[640px] flex-col bg-surface-raised">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<ArrowLeft className="h-4 w-4" />}
          onClick={() => navigate(`/themes/${storeId}`)}
        >
          Back
        </Button>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-bold text-ink">
            {storeName}
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
              <Sparkles className="h-3 w-3" /> Pro
            </span>
          </p>
          <div className="flex items-center gap-2 text-[11px] text-ink-secondary">
            <span>Theme builder pro (beta)</span>
            {draftVersion != null ? <Badge tone="neutral">Draft v{draftVersion}</Badge> : null}
            {dirty ? <Badge tone="caution">Unsaved changes</Badge> : <Badge tone="success">Saved</Badge>}
          </div>
        </div>

        <div className="mx-auto flex items-center gap-1 rounded-xl border border-line bg-surface-raised p-1">
          <Button size="sm" variant="ghost" disabled={past.length === 0} onClick={undo} aria-label="Undo">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" disabled={future.length === 0} onClick={redo} aria-label="Redo">
            <Redo2 className="h-4 w-4" />
          </Button>
          <span className="mx-1 h-4 w-px bg-line" />
          {(
            [
              ['desktop', Monitor],
              ['tablet', Tablet],
              ['mobile', Smartphone],
            ] as const
          ).map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              className={`rounded-lg p-2 ${device === key ? 'bg-white text-primary shadow-sm' : 'text-ink-secondary'}`}
              onClick={() => setDevice(key)}
              aria-label={key}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="lg:hidden"
            onClick={() => setLeftOpen((v) => !v)}
            aria-label="Toggle layers"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="lg:hidden"
            onClick={() => setRightOpen((v) => !v)}
            aria-label="Toggle inspector"
          >
            <PanelRight className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Palette className="h-4 w-4" />}
            onClick={() => setDesignSystemOpen(true)}
          >
            Design System
          </Button>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Activity className="h-4 w-4" />}
            onClick={() => setThemeHealthOpen(true)}
          >
            Theme Health
          </Button>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<ExternalLink className="h-4 w-4" />}
            onClick={() => window.open(storefrontPreviewUrl(slug), '_blank')}
          >
            Preview
          </Button>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<History className="h-4 w-4" />}
            onClick={() => setHistoryOpen(true)}
          >
            History
          </Button>
          <Button size="sm" variant="secondary" loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
            Save Draft
          </Button>
          <Button size="sm" onClick={() => setPublishOpen(true)}>
            Publish
          </Button>
        </div>
      </header>

      <div className="relative grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[260px_1fr_320px]">
        <aside className={`border-r border-line bg-white ${leftOpen ? 'block' : 'hidden'} lg:block`}>
          <LayersPanel
            sections={doc.layout.sections}
            selectedId={selectedId}
            onSelect={handleSelectSection}
            onReorder={handleReorder}
            onMove={handleMove}
            onToggleVisible={handleToggleVisible}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onAdd={handleAdd}
          />
        </aside>

        <main className="min-h-0 min-w-0">
          <ThemeLivePreview
            doc={previewDoc}
            device={device}
            storeName={storeName}
            selectedSectionId={selectedId}
            onSelectSection={handleSelectSection}
          />
        </main>

        <aside className={`border-l border-line bg-white ${rightOpen ? 'block' : 'hidden'} lg:block`}>
          <ProInspector
            storeId={storeId}
            section={selectedSection}
            onPatch={handlePatch}
            onResponsivePatch={handleResponsivePatch}
          />
        </aside>
      </div>

      <DesignSystemPanel
        open={designSystemOpen}
        onClose={() => setDesignSystemOpen(false)}
        themeSettings={doc.themeSettings}
        onPatch={handlePatchThemeSettings}
      />

      <ThemeHealthPanel open={themeHealthOpen} onClose={() => setThemeHealthOpen(false)} doc={doc} />

      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish theme?"
        description="The live storefront will use this draft. Customers see only published themes."
      >
        <div className="space-y-4">
          {publishedSections === null ? (
            <p className="rounded-lg bg-surface-raised px-3 py-2 text-xs text-ink-secondary">
              This will be the first published version of this theme.
            </p>
          ) : (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
                What&apos;s changing
              </p>
              {(() => {
                const summary = summarizeDiff(diffEntries);
                const hasChanges = summary.added + summary.removed + summary.changed > 0;
                if (!hasChanges) {
                  return (
                    <p className="text-sm text-ink-secondary">
                      No section changes since the last publish (theme settings like colors or
                      design tokens may still differ).
                    </p>
                  );
                }
                return (
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                    {diffEntries
                      .filter((e) => e.kind !== 'unchanged')
                      .map((entry) => (
                        <li key={`${entry.id}-${entry.kind}`} className="flex items-center gap-2">
                          <span
                            className={`inline-flex h-5 min-w-[3.5rem] items-center justify-center rounded px-1.5 text-[10px] font-bold uppercase ${
                              entry.kind === 'added'
                                ? 'bg-emerald-100 text-emerald-700'
                                : entry.kind === 'removed'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {entry.kind}
                          </span>
                          <span className="text-ink-secondary">
                            {SECTION_LABELS[entry.type] || entry.type}
                          </span>
                        </li>
                      ))}
                  </ul>
                );
              })()}
            </div>
          )}

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink">Label this version (optional)</span>
            <input
              type="text"
              value={publishLabel}
              onChange={(e) => setPublishLabel(e.target.value)}
              placeholder="e.g. Summer campaign launch"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
              maxLength={120}
            />
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPublishOpen(false)}>
              Cancel
            </Button>
            <Button loading={publishMut.isPending} onClick={() => publishMut.mutate(publishLabel)}>
              Publish now
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Version history"
        description="Restore creates a new draft from a previous version. Publish again to go live."
      >
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {versions.length === 0 ? (
            <p className="text-sm text-ink-secondary">No versions yet.</p>
          ) : (
            versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    Version {v.versionNumber ?? v.version ?? '—'}
                    {v.label ? <span className="ml-2 font-normal text-ink-secondary">— {v.label}</span> : null}
                  </p>
                  <p className="text-xs text-ink-secondary">
                    {v.status} · {v.createdAt ? formatDate(v.createdAt) : '—'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={restoreMut.isPending}
                  onClick={() => v.id && restoreMut.mutate(v.id)}
                >
                  Restore
                </Button>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
