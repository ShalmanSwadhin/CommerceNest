import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, FormField, Input, useToast } from '@commercenest/ui';
import { Link2, Trash2, Upload } from 'lucide-react';
import { ApiClientError, storeApi, unwrapList } from '../lib/api';
import { formatDate } from '../lib/format';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';
import { useStoreId } from '../stores/authStore';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif';
const MAX_BYTES = 2_500_000;

export function MediaPage() {
  const storeId = useStoreId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['store', storeId, 'media'],
    queryFn: () => storeApi.listMedia(storeId!),
    enabled: !!storeId,
  });
  const rows = useMemo(() => unwrapList(q.data), [q.data]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['store', storeId, 'media'] });

  const registerFile = useCallback(
    async (file: File) => {
      if (!storeId) return;
      setError(null);
      if (!ACCEPT.split(',').includes(file.type) && !file.type.startsWith('image/')) {
        setError('Unsupported file type. Use PNG, JPG, WEBP, SVG, or GIF.');
        return;
      }
      if (file.size > MAX_BYTES) {
        setError('Image must be under 2.5MB.');
        return;
      }
      setBusy(true);
      try {
        const signed = await storeApi.signedUpload(storeId, {
          filename: file.name,
          mimeType: file.type || 'image/png',
          usageType: 'OTHER',
        });

        let uploadedUrl = '';
        if (signed.mode === 'cloudinary') {
          const form = new FormData();
          Object.entries(signed.fields).forEach(([k, v]) => form.append(k, v));
          form.append('file', file);
          const res = await fetch(signed.uploadUrl, { method: 'POST', body: form });
          if (!res.ok) throw new Error('Cloudinary upload failed');
          const json = (await res.json()) as { secure_url?: string; url?: string };
          uploadedUrl = json.secure_url || json.url || '';
        } else {
          uploadedUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Could not read file'));
            reader.readAsDataURL(file);
          });
        }
        if (!uploadedUrl) throw new Error('Upload produced no URL');

        await storeApi.registerMedia(storeId, {
          publicId: signed.publicId,
          url: uploadedUrl,
          filename: file.name,
          mimeType: file.type || 'image/png',
          bytes: file.size,
          usageType: 'OTHER',
        });
        toast({ title: 'Media uploaded', tone: 'success' });
        invalidate();
      } catch (err) {
        const message =
          err instanceof ApiClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Upload failed';
        setError(message);
        toast({ title: 'Upload failed', description: message, tone: 'danger' });
      } finally {
        setBusy(false);
      }
    },
    [storeId, toast],
  );

  const registerUrlMut = useMutation({
    mutationFn: () => {
      const trimmed = url.trim();
      const filename = trimmed.split('/').pop()?.split('?')[0] || 'image';
      const ext = filename.split('.').pop()?.toLowerCase();
      const mimeType =
        ext === 'png'
          ? 'image/png'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'svg'
              ? 'image/svg+xml'
              : ext === 'gif'
                ? 'image/gif'
                : 'image/jpeg';
      return storeApi.registerMedia(storeId!, {
        publicId: `url-${Date.now()}`,
        url: trimmed,
        filename,
        mimeType,
        bytes: 0,
        usageType: 'OTHER',
      });
    },
    onSuccess: () => {
      toast({ title: 'Media registered', tone: 'success' });
      setUrl('');
      setShowUrlForm(false);
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Register failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (mediaId: string) => storeApi.deleteMedia(storeId!, mediaId),
    onMutate: (mediaId) => setDeletingId(mediaId),
    onSuccess: () => {
      toast({ title: 'Media deleted', tone: 'success' });
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Delete failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
    onSettled: () => setDeletingId(null),
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
      <div>
        <h2 className="text-xl font-semibold">Media library</h2>
        <p className="text-sm text-ink-secondary">
          Upload images from your device, then reuse them across your theme and products.
        </p>
      </div>

      <Card elevated className="space-y-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) void registerFile(file);
          }}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] px-4 py-10 text-center transition hover:border-primary/50 hover:bg-primary/[0.06] disabled:opacity-60"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
            <Upload className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold text-ink">
            {busy ? 'Uploading…' : 'Drag & drop image here'}
          </span>
          <span className="text-xs text-ink-secondary">
            or click to browse · PNG, JPG, WEBP, SVG · max 2.5MB
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void registerFile(file);
            e.target.value = '';
          }}
        />
        {error ? <p className="text-xs text-red-600">{error}</p> : null}

        <div className="border-t border-line pt-3">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary hover:text-ink"
            onClick={() => setShowUrlForm((v) => !v)}
          >
            <Link2 className="size-3.5" />
            Advanced: register an existing image URL
          </button>
          {showUrlForm ? (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <FormField label="Asset URL" htmlFor="url" className="flex-1">
                <Input
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                />
              </FormField>
              <Button
                loading={registerUrlMut.isPending}
                disabled={!url.trim()}
                onClick={() => registerUrlMut.mutate()}
              >
                Register URL
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      {rows.length === 0 ? (
        <SoftEmpty
          title="No media yet"
          description="Upload an image to populate your store's media library."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((item) => (
            <Card key={item.id} elevated padding="sm" className="overflow-hidden">
              <div className="aspect-square overflow-hidden rounded-cn bg-surface-sunken">
                <img src={item.url} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="mt-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs text-ink-secondary">
                    {item.filename || item.usageType || 'OTHER'}
                  </div>
                  <div className="text-xs text-ink-tertiary">{formatDate(item.createdAt)}</div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Delete media"
                  loading={deletingId === item.id && deleteMut.isPending}
                  onClick={() => deleteMut.mutate(item.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
