import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  DEFAULT_SECTION_DEFS,
  normalizeThemeDocument,
  type ThemeDocument,
  type ThemeSection,
  type ThemeSectionType,
} from '@commercenest/types/schemas/theme';
import {
  Badge,
  Button,
  Modal,
  useToast,
} from '@commercenest/ui';
import {
  ArrowLeft,
  ExternalLink,
  History,
  Monitor,
  PanelLeft,
  PanelRight,
  Redo2,
  Smartphone,
  Tablet,
  Undo2,
} from 'lucide-react';
import {
  adminApi,
  ApiClientError,
  unwrapList,
  type ThemeVersion,
} from '../../lib/api';
import { formatDate } from '../../lib/format';
import { ErrorState, PageSkeleton } from '../../components/QueryState';
import { SectionList } from './SectionList';
import { SectionInspector, type InspectorTab } from './SectionInspector';
import { ThemeLivePreview } from './ThemeLivePreview';

type Device = 'desktop' | 'tablet' | 'mobile';

function newSectionId(type: string) {
  return `${type}_${Math.random().toString(36).slice(2, 10)}`;
}

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

type ThemeBuilderProps = {
  storeId: string;
};

export function ThemeBuilder({ storeId }: ThemeBuilderProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [device, setDevice] = useState<Device>('desktop');
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('section');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [doc, setDoc] = useState<ThemeDocument | null>(null);
  const [dirty, setDirty] = useState(false);
  const [past, setPast] = useState<ThemeDocument[]>([]);
  const [future, setFuture] = useState<ThemeDocument[]>([]);
  const skipHistory = useRef(false);

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
    enabled: !!storeId && historyOpen,
  });

  useEffect(() => {
    if (!themeQ.data?.draft) return;
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
  }, [themeQ.data]);

  const pushHistory = (next: ThemeDocument) => {
    setDoc((prev) => {
      if (prev && !skipHistory.current) {
        setPast((p) => [...p.slice(-39), prev]);
        setFuture([]);
      }
      skipHistory.current = false;
      return next;
    });
    setDirty(true);
  };

  const updateDoc = (next: ThemeDocument) => pushHistory(next);

  const selectedSection =
    doc?.layout.sections.find((s) => s.id === selectedId) ?? null;

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
    mutationFn: async () => {
      if (dirty && doc) {
        await adminApi.saveThemeDraft(storeId, {
          themeSettings: doc.themeSettings,
          layout: doc.layout,
        });
      }
      return adminApi.publishTheme(storeId);
    },
    onSuccess: () => {
      toast({ title: 'Theme published', tone: 'success' });
      setPublishOpen(false);
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
    onSuccess: () => {
      toast({ title: 'Restored to draft', tone: 'success' });
      setHistoryOpen(false);
      void qc.invalidateQueries({ queryKey: ['admin', 'theme', storeId] });
    },
    onError: (err) =>
      toast({
        title: 'Restore failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const versions = useMemo(
    () => unwrapList(versionsQ.data) as ThemeVersion[],
    [versionsQ.data],
  );

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

  const addSection = (type: ThemeSectionType) => {
    const def = DEFAULT_SECTION_DEFS.find((d) => d.type === type);
    const section: ThemeSection = {
      id: newSectionId(type),
      type,
      visible: true,
      settings: { ...(def?.defaultSettings || {}) },
    };
    updateDoc({
      ...doc,
      layout: { sections: [...doc.layout.sections, section] },
    });
    setSelectedId(section.id);
    setInspectorTab('section');
  };

  return (
    <div className="flex h-[calc(100vh-0px)] min-h-[640px] flex-col bg-surface-raised">
      {/* Toolbar */}
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<ArrowLeft className="h-4 w-4" />}
          onClick={() => navigate('/themes')}
        >
          Back
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">{storeName}</p>
          <div className="flex items-center gap-2 text-[11px] text-ink-secondary">
            <span>Theme builder</span>
            {draftVersion != null ? (
              <Badge tone="neutral">Draft v{draftVersion}</Badge>
            ) : null}
            {dirty ? (
              <Badge tone="caution">Unsaved changes</Badge>
            ) : (
              <Badge tone="success">Saved</Badge>
            )}
          </div>
        </div>

        <div className="mx-auto flex items-center gap-1 rounded-xl border border-line bg-surface-raised p-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={past.length === 0}
            onClick={undo}
            aria-label="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={future.length === 0}
            onClick={redo}
            aria-label="Redo"
          >
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
              className={`rounded-lg p-2 ${
                device === key ? 'bg-white text-brand shadow-sm' : 'text-ink-secondary'
              }`}
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
            aria-label="Toggle sections"
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
          <Button
            size="sm"
            variant="secondary"
            loading={saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            Save Draft
          </Button>
          <Button size="sm" onClick={() => setPublishOpen(true)}>
            Publish
          </Button>
        </div>
      </header>

      {/* Workspace */}
      <div className="relative grid min-h-0 flex-1 lg:grid-cols-[260px_1fr_300px]">
        <aside
          className={`border-r border-line bg-white ${
            leftOpen ? 'block' : 'hidden'
          } lg:block`}
        >
          <SectionList
            sections={doc.layout.sections}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setInspectorTab('section');
              setRightOpen(true);
            }}
            onChange={(sections) =>
              updateDoc({ ...doc, layout: { sections } })
            }
            onAdd={addSection}
          />
        </aside>

        <main className="min-h-0 min-w-0">
          <ThemeLivePreview
            doc={doc}
            device={device}
            storeName={storeName}
            selectedSectionId={selectedId}
            onSelectSection={(id) => {
              setSelectedId(id);
              setInspectorTab('section');
              setRightOpen(true);
            }}
          />
        </main>

        <aside
          className={`border-l border-line bg-white ${
            rightOpen ? 'block' : 'hidden'
          } lg:block`}
        >
          <SectionInspector
            storeId={storeId}
            tab={inspectorTab}
            doc={doc}
            section={selectedSection}
            onTabChange={setInspectorTab}
            onDocChange={updateDoc}
            onSectionChange={(section) => {
              updateDoc({
                ...doc,
                layout: {
                  sections: doc.layout.sections.map((s) =>
                    s.id === section.id ? section : s,
                  ),
                },
              });
            }}
          />
        </aside>
      </div>

      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish theme?"
        description="The live storefront will use this draft. Customers see only published themes."
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPublishOpen(false)}>
            Cancel
          </Button>
          <Button loading={publishMut.isPending} onClick={() => publishMut.mutate()}>
            Publish now
          </Button>
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
              <div
                key={v.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">
                    Version {v.versionNumber ?? v.version ?? '—'}
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
