import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input } from '@commercenest/ui';
import { ImagePlus, Link2, Trash2, Upload } from 'lucide-react';
import { storeApi, ApiClientError, unwrapList } from '../../lib/api';

type Mode = 'upload' | 'url' | 'library';

type MediaImageFieldProps = {
  storeId: string;
  label: string;
  value: string;
  onChange: (url: string) => void;
  usageType?: string;
  hint?: string;
};

const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif';
const MAX_BYTES = 2_500_000;

export function MediaImageField({
  storeId,
  label,
  value,
  onChange,
  usageType = 'OTHER',
  hint,
}: MediaImageFieldProps) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('upload');
  const [urlDraft, setUrlDraft] = useState(value || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaQ = useQuery({
    queryKey: ['store', storeId, 'media'],
    queryFn: () => storeApi.listMedia(storeId, { limit: 40 }),
    enabled: !!storeId && mode === 'library',
  });

  const items = unwrapList(mediaQ.data);

  const registerFile = useCallback(
    async (file: File) => {
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
          usageType,
        });

        let url = '';
        if (signed.mode === 'cloudinary') {
          const form = new FormData();
          Object.entries(signed.fields).forEach(([k, v]) => form.append(k, v));
          form.append('file', file);
          const res = await fetch(signed.uploadUrl, { method: 'POST', body: form });
          if (!res.ok) throw new Error('Cloudinary upload failed');
          const json = (await res.json()) as { secure_url?: string; url?: string };
          url = json.secure_url || json.url || '';
        } else {
          // Local/dev stub — persist as data URL via media register
          url = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Could not read file'));
            reader.readAsDataURL(file);
          });
        }

        if (!url) throw new Error('Upload produced no URL');

        const asset = await storeApi.registerMedia(storeId, {
          publicId: signed.publicId,
          url,
          filename: file.name,
          mimeType: file.type || 'image/png',
          bytes: file.size,
          usageType,
        });
        onChange(asset.url);
        void qc.invalidateQueries({ queryKey: ['store', storeId, 'media'] });
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Upload failed',
        );
      } finally {
        setBusy(false);
      }
    },
    [onChange, qc, storeId, usageType],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">{label}</p>
        <div className="flex rounded-lg border border-line bg-surface-raised p-0.5 text-xs">
          {(
            [
              ['upload', 'Upload'],
              ['library', 'Library'],
              ['url', 'URL'],
            ] as const
          ).map(([key, text]) => (
            <button
              key={key}
              type="button"
              className={`rounded-md px-2 py-1 font-medium ${
                mode === key ? 'bg-white text-ink shadow-sm' : 'text-ink-secondary'
              }`}
              onClick={() => setMode(key)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
      {hint ? <p className="text-xs text-ink-tertiary">{hint}</p> : null}

      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-2">
          <img
            src={value}
            alt=""
            className="h-14 w-14 rounded-lg object-cover bg-surface-sunken"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-ink-secondary">{value}</p>
            <div className="mt-1 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => inputRef.current?.click()}
              >
                Replace
              </Button>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => onChange('')}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {mode === 'upload' && (
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
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-brand/30 bg-brand/[0.03] px-4 py-8 text-center transition hover:border-brand/50 hover:bg-brand/[0.06] disabled:opacity-60"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-brand/10 text-brand">
            <Upload className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold text-ink">
            {busy ? 'Uploading…' : 'Drag & drop image here'}
          </span>
          <span className="text-xs text-ink-secondary">
            or click to browse · PNG, JPG, WEBP, SVG · max 2.5MB
          </span>
        </button>
      )}

      {mode === 'url' && (
        <div className="space-y-2 rounded-xl border border-line bg-white p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-ink-secondary">
            <Link2 className="h-3.5 w-3.5" />
            Advanced — paste an image URL
          </div>
          <Input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://…"
          />
          <Button
            size="sm"
            type="button"
            onClick={() => {
              onChange(urlDraft.trim());
              setError(null);
            }}
          >
            Apply URL
          </Button>
        </div>
      )}

      {mode === 'library' && (
        <div className="rounded-xl border border-line bg-white p-3">
          {mediaQ.isLoading ? (
            <p className="text-xs text-ink-secondary">Loading media…</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <ImagePlus className="h-6 w-6 text-ink-tertiary" />
              <p className="text-xs text-ink-secondary">No media in this store yet.</p>
              <Button size="sm" type="button" onClick={() => setMode('upload')}>
                Upload from device
              </Button>
            </div>
          ) : (
            <div className="grid max-h-48 grid-cols-4 gap-2 overflow-y-auto">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`overflow-hidden rounded-lg border ${
                    value === item.url ? 'border-brand ring-2 ring-brand/30' : 'border-line'
                  }`}
                  onClick={() => onChange(item.url)}
                  title={item.filename}
                >
                  <img src={item.url} alt="" className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
    </div>
  );
}
