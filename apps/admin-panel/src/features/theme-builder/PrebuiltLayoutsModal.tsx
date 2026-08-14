import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { normalizeThemeDocument } from '@commercenest/types/schemas/theme';
import { Badge, Button, Modal, useToast } from '@commercenest/ui';
import { Eye, LayoutTemplate } from 'lucide-react';
import { adminApi, ApiClientError, type ThemePreset, type ThemeVersion } from '../../lib/api';
import { ThemeLivePreview } from './ThemeLivePreview';

type Props = {
  open: boolean;
  onClose: () => void;
  storeId: string;
  storeName: string;
  onApplied: (draft: ThemeVersion) => void;
};

export function PrebuiltLayoutsModal({ open, onClose, storeId, storeName, onApplied }: Props) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<ThemePreset | null>(null);
  const [confirming, setConfirming] = useState<ThemePreset | null>(null);

  const presetsQ = useQuery({
    queryKey: ['admin', 'theme-presets'],
    queryFn: () => adminApi.listThemePresets(),
    enabled: open,
  });

  const applyMut = useMutation({
    mutationFn: (presetId: string) => adminApi.applyThemePreset(storeId, presetId),
    onSuccess: (draft) => {
      toast({
        title: 'Layout applied to draft',
        description: 'Review the draft, then publish explicitly when ready.',
        tone: 'success',
      });
      setConfirming(null);
      setPreview(null);
      onApplied(draft as ThemeVersion);
      onClose();
    },
    onError: (err) =>
      toast({
        title: 'Could not apply layout',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const presets = presetsQ.data?.items ?? [];

  if (preview) {
    const doc = normalizeThemeDocument({
      layout: preview.layout,
      themeSettings: preview.themeSettings,
    });
    return (
      <Modal
        open={open}
        onClose={() => setPreview(null)}
        title={preview.name}
        description={preview.description || undefined}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Back to gallery
            </Button>
            <Button
              onClick={() => {
                // `preview` must clear here — while it's set, the early
                // `if (preview) return …` above always wins the render,
                // which would make the confirm modal below unreachable.
                setConfirming(preview);
                setPreview(null);
              }}
            >
              Apply to Store
            </Button>
          </>
        }
      >
        <div className="h-[420px] overflow-hidden rounded-xl border border-line bg-[#E8EAF0]">
          <ThemeLivePreview doc={doc} device="desktop" storeName={storeName} />
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal
        open={open && !confirming}
        onClose={onClose}
        title="Prebuilt Layouts"
        description="Apply a ready-made layout as a draft — nothing goes live until you publish."
        size="lg"
      >
        {presetsQ.isLoading ? (
          <p className="py-8 text-center text-sm text-ink-secondary">Loading layouts…</p>
        ) : presets.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-secondary">No prebuilt layouts yet.</p>
        ) : (
          <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {presets.map((p) => (
              <div key={p.id} className="rounded-xl border border-line p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <LayoutTemplate className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                    {p.category ? <Badge tone="neutral">{p.category}</Badge> : null}
                  </div>
                </div>
                {p.description ? (
                  <p className="text-xs text-ink-secondary">{p.description}</p>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    leftIcon={<Eye className="size-3.5" />}
                    onClick={() => setPreview(p)}
                  >
                    Preview
                  </Button>
                  <Button size="sm" className="flex-1" onClick={() => setConfirming(p)}>
                    Apply to Store
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title="Apply this layout?"
        description={
          confirming
            ? `"${confirming.name}" will replace ${storeName}'s current DRAFT. The live storefront is unaffected until you publish. You can review and customize before publishing.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              loading={applyMut.isPending}
              onClick={() => confirming && applyMut.mutate(confirming.id)}
            >
              Apply as draft
            </Button>
          </>
        }
      >
        <div />
      </Modal>
    </>
  );
}
