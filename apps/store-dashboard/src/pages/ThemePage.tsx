import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { normalizeThemeDocument } from '@commercenest/types/schemas/theme';
import { Badge, Button, Card, Modal, Textarea, useToast } from '@commercenest/ui';
import { ExternalLink, Palette, Sparkles } from 'lucide-react';
import { ApiClientError, storeApi } from '../lib/api';
import { ErrorState, PageSkeleton } from '../components/QueryState';
import { useStoreId } from '../stores/authStore';
import { ThemeLivePreview } from '../features/theme-builder/ThemeLivePreview';

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

export function ThemePage() {
  const storeId = useStoreId();
  const { toast } = useToast();
  const [requestOpen, setRequestOpen] = useState(false);
  const [message, setMessage] = useState('');

  const themeQ = useQuery({
    queryKey: ['store', storeId, 'theme'],
    queryFn: () => storeApi.getTheme(storeId!),
    enabled: !!storeId,
  });

  const storeQ = useQuery({
    queryKey: ['store', storeId],
    queryFn: () => storeApi.getStore(storeId!),
    enabled: !!storeId,
  });

  const requestMut = useMutation({
    mutationFn: () => storeApi.requestThemeCustomization(storeId!, message.trim() || undefined),
    onSuccess: () => {
      toast({
        title: 'Request sent',
        description: 'Our team will reach out about your custom design.',
        tone: 'success',
      });
      setRequestOpen(false);
      setMessage('');
    },
    onError: (err) =>
      toast({
        title: 'Could not send request',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  if (!storeId) return <ErrorState message="Missing store context." />;
  if (themeQ.isLoading || storeQ.isLoading) return <PageSkeleton />;
  if (themeQ.isError) {
    return (
      <ErrorState
        message={themeQ.error instanceof Error ? themeQ.error.message : undefined}
        onRetry={() => void themeQ.refetch()}
      />
    );
  }

  const published = themeQ.data?.published;
  const draft = themeQ.data?.draft;
  const slug = storeQ.data?.slug || 'store';
  const storeName = storeQ.data?.name || 'Your store';

  const activeVersion = published ?? draft ?? null;
  const doc = normalizeThemeDocument({
    layout: activeVersion?.layout,
    themeSettings: activeVersion?.themeSettings,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Theme & Design</h2>
        <p className="text-sm text-ink-secondary">
          Your storefront's visual design, managed by CommerceNest.
        </p>
      </div>

      <Card elevated padding="lg" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">
              Current theme
            </p>
            <div className="mt-1 flex items-center gap-2">
              <h3 className="text-lg font-semibold text-ink">{storeName} storefront</h3>
              {published ? (
                <Badge tone="success">Live</Badge>
              ) : (
                <Badge tone="caution">Not published yet</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-secondary">
              {published
                ? `Version ${published.versionNumber} · last published design`
                : draft
                  ? `Draft version ${draft.versionNumber} — awaiting first publish`
                  : 'No theme has been set up yet.'}
            </p>
          </div>
          <Button
            variant="secondary"
            leftIcon={<ExternalLink className="h-4 w-4" />}
            onClick={() => window.open(storefrontPreviewUrl(slug), '_blank')}
          >
            Preview storefront
          </Button>
        </div>

        {activeVersion ? (
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="pointer-events-none h-[420px] overflow-hidden bg-[#E8EAF0]">
              <div className="scale-[0.85] origin-top">
                <ThemeLivePreview
                  doc={doc}
                  device="desktop"
                  storeName={storeName}
                  previewUrl={storefrontPreviewUrl(slug)}
                />
              </div>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-secondary">
            Your storefront design is being set up by CommerceNest.
          </p>
        )}
      </Card>

      <Card elevated padding="lg" className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-ink">Want a custom design?</p>
            <p className="mt-1 max-w-xl text-sm text-ink-secondary">
              CommerceNest manages your storefront design to keep your store fast,
              professional and consistent. Custom theme changes — new layouts, colors,
              and branding — are available as an additional design service from our team.
            </p>
          </div>
        </div>
        <Button
          leftIcon={<Palette className="h-4 w-4" />}
          onClick={() => setRequestOpen(true)}
          className="shrink-0"
        >
          Request Theme Customization
        </Button>
      </Card>

      <Modal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="Request theme customization"
        description="Tell us what you'd like changed. Our team will follow up with details and pricing."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRequestOpen(false)}>
              Cancel
            </Button>
            <Button loading={requestMut.isPending} onClick={() => requestMut.mutate()}>
              Send request
            </Button>
          </>
        }
      >
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="E.g. We'd like a layout similar to our Facebook page, with our brand colors and a banner for our upcoming sale."
          rows={5}
        />
      </Modal>
    </div>
  );
}
