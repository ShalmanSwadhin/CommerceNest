import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, FormField, Input, Textarea, useToast } from '@commercenest/ui';
import { ApiClientError, storeApi, type CmsBlock } from '../lib/api';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';
import { useStoreId } from '../stores/authStore';

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
    const raw = Array.isArray(q.data)
      ? q.data
      : q.data.items ?? q.data.data ?? [];
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">CMS content blocks</h2>
          <p className="text-sm text-ink-secondary">Simple title/body blocks for storefront content</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              setBlocks((b) => [
                ...b,
                { id: `local-${Date.now()}`, title: 'New block', body: '', sortOrder: b.length },
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
      {blocks.length === 0 ? (
        <SoftEmpty title="No content blocks" description="Add a block to start editing CMS content." />
      ) : (
        blocks.map((block, index) => (
          <Card key={block.id} elevated className="space-y-3">
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
        ))
      )}
    </div>
  );
}
