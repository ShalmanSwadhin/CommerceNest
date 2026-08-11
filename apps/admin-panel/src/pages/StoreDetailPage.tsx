import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Badge, Button, Card } from '@commercenest/ui';
import { adminApi } from '../lib/api';
import { formatDate } from '../lib/format';
import { ErrorState, PageSkeleton } from '../components/QueryState';

const statusTone: Record<string, 'success' | 'caution' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  PENDING_SETUP: 'caution',
  SUSPENDED: 'danger',
  ARCHIVED: 'neutral',
};

function Field({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">{label}</div>
      <div className="mt-1 text-sm text-ink">{value ?? '—'}</div>
    </div>
  );
}

export function StoreDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ['admin', 'stores', id],
    queryFn: () => adminApi.getStore(id!),
    enabled: !!id,
  });

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) {
    return (
      <ErrorState
        message={q.error instanceof Error ? q.error.message : undefined}
        onRetry={() => void q.refetch()}
      />
    );
  }

  const store = q.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<ArrowLeft className="size-4" />}
          onClick={() => navigate('/stores')}
        >
          Back to stores
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-ink">{store.name}</h2>
            <Badge tone={statusTone[store.status] || 'neutral'}>{store.status}</Badge>
          </div>
          <p className="text-sm text-ink-secondary">/{store.slug}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => navigate(`/themes/${store.id}`)}>
            Edit Theme
          </Button>
        </div>
      </div>

      <Card elevated padding="lg" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Store ID" value={store.id} />
        <Field label="Plan" value={store.planTier || '—'} />
        <Field label="Category" value={store.category || '—'} />
        <Field label="Tagline" value={store.tagline || '—'} />
        <Field label="Created" value={formatDate(store.createdAt)} />
        <Field label="Last updated" value={formatDate(store.updatedAt)} />
        {store.status === 'SUSPENDED' && (
          <>
            <Field label="Suspended at" value={formatDate(store.suspendedAt)} />
            <Field label="Suspension reason" value={store.suspendedReason || '—'} />
          </>
        )}
      </Card>

      <Card elevated padding="lg" className="space-y-4">
        <h3 className="text-sm font-semibold text-ink">Owner</h3>
        {store.owner ? (
          <div className="grid gap-6 sm:grid-cols-3">
            <Field label="Name" value={store.owner.name} />
            <Field label="Email" value={store.owner.email} />
            <Field label="Phone" value={store.owner.phone || '—'} />
          </div>
        ) : (
          <p className="text-sm text-ink-secondary">No owner on record.</p>
        )}
      </Card>

      <Card elevated padding="lg" className="space-y-4">
        <h3 className="text-sm font-semibold text-ink">Domains</h3>
        {store.domains && store.domains.length > 0 ? (
          <div className="space-y-2">
            {store.domains.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-cn border border-line px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{d.hostname}</span>
                  {d.isPrimary && <Badge tone="success">Primary</Badge>}
                </div>
                <div className="flex items-center gap-2 text-xs text-ink-tertiary">
                  <span>{d.type || '—'}</span>
                  <span>{d.status || '—'}</span>
                  <span>SSL: {d.sslStatus || '—'}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-secondary">No domains configured.</p>
        )}
      </Card>

      <Card elevated padding="lg" className="space-y-4">
        <h3 className="text-sm font-semibold text-ink">Storefront</h3>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="Draft version"
            value={store.storefront?.draftVersion?.status || 'None'}
          />
          <Field
            label="Published version"
            value={store.storefront?.publishedVersion?.status || 'Not published'}
          />
        </div>
      </Card>
    </div>
  );
}
