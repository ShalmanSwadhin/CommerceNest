import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, FormField, Input, Textarea, useToast } from '@commercenest/ui';
import { ApiClientError, storeApi, type CmsBlock } from '../lib/api';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';
import { useStoreId } from '../stores/authStore';

// Exactly the keys the two storefront themes already link to by URL —
// verified against the actual footer code, not guessed: StoreShell.tsx's
// default footer hard-codes /pages/about, and modern-commerce's Footer
// (ModernCommerceShell.tsx) links /pages/about, /pages/privacy,
// /pages/terms, /pages/contact, /pages/shipping, /pages/returns,
// /pages/faq. Before this picker, merchants could only create blocks with
// an opaque local-<timestamp> key, so every one of these links 404'd
// ("Content not published") for every store. "Custom key" keeps the
// original freeform behavior for anything else.
const COMMON_PAGE_KEYS = [
  { key: 'about', label: 'About us' },
  { key: 'contact', label: 'Contact' },
  { key: 'shipping', label: 'Shipping policy' },
  { key: 'returns', label: 'Returns policy' },
  { key: 'faq', label: 'FAQ' },
  { key: 'terms', label: 'Terms of service' },
  { key: 'privacy', label: 'Privacy policy' },
];

function SocialLinksCard({ storeId, blocks }: { storeId: string; blocks: CmsBlock[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const existing = blocks.find((b) => b.key === 'social-links')?.fields as
    | { facebook?: string; instagram?: string; whatsapp?: string }
    | undefined;
  const [facebook, setFacebook] = useState(existing?.facebook ?? '');
  const [instagram, setInstagram] = useState(existing?.instagram ?? '');
  const [whatsapp, setWhatsapp] = useState(existing?.whatsapp ?? '');
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current || !existing) return;
    hydrated.current = true;
    setFacebook(existing.facebook ?? '');
    setInstagram(existing.instagram ?? '');
    setWhatsapp(existing.whatsapp ?? '');
  }, [existing]);

  const mut = useMutation({
    mutationFn: () =>
      storeApi.saveCmsKey(storeId, 'social-links', {
        facebook: facebook.trim(),
        instagram: instagram.trim(),
        whatsapp: whatsapp.trim(),
      }),
    onSuccess: () => {
      toast({ title: 'Social links saved', tone: 'success' });
      void qc.invalidateQueries({ queryKey: ['store', storeId, 'cms'] });
    },
    onError: (err) =>
      toast({
        title: 'Save failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  return (
    <Card elevated className="space-y-3">
      <div>
        <h3 className="font-semibold">Social links</h3>
        <p className="text-sm text-ink-secondary">
          Shown as footer icons on themes that support them (e.g. Modern Commerce) — those icons render but link
          nowhere until set here.
        </p>
      </div>
      <FormField label="Facebook URL" htmlFor="social-facebook">
        <Input id="social-facebook" value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="https://facebook.com/yourpage" />
      </FormField>
      <FormField label="Instagram URL" htmlFor="social-instagram">
        <Input id="social-instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="https://instagram.com/yourpage" />
      </FormField>
      <FormField label="WhatsApp link" htmlFor="social-whatsapp">
        <Input id="social-whatsapp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="https://wa.me/8801XXXXXXXXX" />
      </FormField>
      <Button size="sm" loading={mut.isPending} onClick={() => mut.mutate()}>
        Save social links
      </Button>
    </Card>
  );
}

export function CmsPage() {
  const storeId = useStoreId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [blocks, setBlocks] = useState<CmsBlock[]>([]);
  const initializedForStore = useRef<string | null>(null);

  const q = useQuery({
    queryKey: ['store', storeId, 'cms'],
    queryFn: () => storeApi.listCms(storeId!),
    enabled: !!storeId,
  });

  // Hydrate the form once per store, not on every refetch — otherwise the
  // refetch triggered by our own Save (via invalidateQueries below) would
  // race the in-flight edit and silently overwrite it with the server echo.
  useEffect(() => {
    if (!q.data || !storeId || initializedForStore.current === storeId) return;
    initializedForStore.current = storeId;
    const raw = (Array.isArray(q.data) ? q.data : q.data.items ?? q.data.data ?? []).filter(
      // social-links is a fixed-key block, edited via its own dedicated
      // card below (SocialLinksCard) — never in this freeform blocks list.
      (b) => b.key !== 'social-links',
    );
    setBlocks(
      raw.map((b, index) => {
        const fields = (b.fields || {}) as Record<string, unknown>;
        return {
          ...b,
          key: b.key || b.id || `block-${index}`,
          title:
            b.title ??
            (typeof fields.title === 'string' ? fields.title : ''),
          body:
            b.body ?? (typeof fields.body === 'string' ? fields.body : ''),
          sortOrder:
            b.sortOrder ??
            (typeof fields.sortOrder === 'number' ? fields.sortOrder : index),
        };
      }),
    );
  }, [q.data, storeId]);

  const mut = useMutation({
    mutationFn: () => storeApi.saveCms(storeId!, blocks),
    onSuccess: () => {
      toast({ title: 'CMS saved', tone: 'success' });
      void qc.invalidateQueries({ queryKey: ['store', storeId, 'cms'] });
    },
    onError: (err) =>
      toast({
        title: 'Save failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  if (!storeId) return <ErrorState message="Missing store context." />;
  if (q.isLoading) return <PageSkeleton />;
  if (q.isError) {
    return (
      <ErrorState
        message={q.error instanceof Error ? q.error.message : undefined}
        onRetry={() => void q.refetch()}
      />
    );
  }

  const allBlocks = Array.isArray(q.data) ? q.data : q.data?.items ?? q.data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">CMS content blocks</h2>
          <p className="text-sm text-ink-secondary">
            Storefront pages — each block's key controls its URL: /pages/&lt;key&gt;
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              setBlocks((b) => [
                ...b,
                { id: `local-${Date.now()}`, key: '', title: 'New page', body: '', sortOrder: b.length },
              ])
            }
          >
            Add block
          </Button>
          <Button loading={mut.isPending} onClick={() => mut.mutate()}>
            Save
          </Button>
        </div>
      </div>

      <SocialLinksCard storeId={storeId} blocks={allBlocks} />

      {blocks.length === 0 ? (
        <SoftEmpty title="No content blocks" description="Add a block to start editing CMS content." />
      ) : (
        blocks.map((block, index) => {
          const isCustomKey = !!block.key && !COMMON_PAGE_KEYS.some((p) => p.key === block.key);
          return (
          <Card key={block.id} elevated className="space-y-3">
            <FormField
              label="Page"
              htmlFor={`key-${block.id}`}
              description={block.key ? `Live at /pages/${block.key}` : 'Choose which storefront page this is — the URL depends on it.'}
            >
              <select
                id={`key-${block.id}`}
                className="h-10 w-full rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-sm"
                value={isCustomKey ? '__custom__' : block.key || ''}
                onChange={(e) => {
                  const next = e.target.value === '__custom__' ? '' : e.target.value;
                  setBlocks((list) => list.map((b, i) => (i === index ? { ...b, key: next } : b)));
                }}
              >
                <option value="" disabled>
                  Choose a page…
                </option>
                {COMMON_PAGE_KEYS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
                <option value="__custom__">Custom key…</option>
              </select>
              {isCustomKey || block.key === '' ? (
                <Input
                  className="mt-2"
                  value={block.key || ''}
                  onChange={(e) =>
                    setBlocks((list) =>
                      list.map((b, i) =>
                        i === index ? { ...b, key: e.target.value.trim().toLowerCase().replace(/\s+/g, '-') } : b,
                      ),
                    )
                  }
                  placeholder="e.g. faq"
                />
              ) : null}
            </FormField>
            <FormField label="Title" htmlFor={`title-${block.id}`}>
              <Input
                id={`title-${block.id}`}
                value={block.title || ''}
                onChange={(e) =>
                  setBlocks((list) =>
                    list.map((b, i) => (i === index ? { ...b, title: e.target.value } : b)),
                  )
                }
              />
            </FormField>
            <FormField label="Body" htmlFor={`body-${block.id}`}>
              <Textarea
                id={`body-${block.id}`}
                value={block.body || ''}
                onChange={(e) =>
                  setBlocks((list) =>
                    list.map((b, i) => (i === index ? { ...b, body: e.target.value } : b)),
                  )
                }
              />
            </FormField>
          </Card>
          );
        })
      )}
    </div>
  );
}
