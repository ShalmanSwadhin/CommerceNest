import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Badge, Button, Card } from '@commercenest/ui';
import { adminApi } from '../lib/api';
import { formatDate } from '../lib/format';
import { ErrorState, PageSkeleton } from '../components/QueryState';

function formatBdt(amount: number) {
  return `৳${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function UsageBar({ used, limit }: { used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
      <div
        className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-primary'}`}
        style={{ width: `${limit ? pct : 100}%` }}
      />
    </div>
  );
}

function StoreUsageCard({ storeId }: { storeId: string }) {
  const q = useQuery({
    queryKey: ['admin', 'stores', storeId, 'usage'],
    queryFn: () => adminApi.getStoreUsage(storeId),
  });
  if (q.isLoading || !q.data) return null;
  const usage = q.data;
  return (
    <Card elevated padding="lg" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Usage — {usage.planName} plan</h3>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-secondary">Products</span>
            <span className="font-medium text-ink">
              {usage.products.used} / {usage.products.limit ?? '∞'}
            </span>
          </div>
          <UsageBar used={usage.products.used} limit={usage.products.limit} />
        </div>
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-secondary">Staff</span>
            <span className="font-medium text-ink">
              {usage.staff.used} / {usage.staff.limit ?? '∞'}
            </span>
          </div>
          <UsageBar used={usage.staff.used} limit={usage.staff.limit} />
        </div>
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-secondary">Storage</span>
            <span className="font-medium text-ink">
              {formatBytes(usage.storage.usedBytes)} / {usage.storage.limitBytes ? formatBytes(usage.storage.limitBytes) : '∞'}
            </span>
          </div>
          <UsageBar used={usage.storage.usedBytes} limit={usage.storage.limitBytes} />
        </div>
      </div>
    </Card>
  );
}

function StoreBillingCard({ storeId }: { storeId: string }) {
  const q = useQuery({
    queryKey: ['admin', 'stores', storeId, 'billing'],
    queryFn: () => adminApi.getStoreBillingHistory(storeId, { limit: 6 }),
  });
  if (q.isLoading || !q.data) return null;
  const periods = q.data.items;
  const current = periods[0];
  return (
    <Card elevated padding="lg" className="space-y-4">
      <h3 className="text-sm font-semibold text-ink">Billing</h3>
      {current ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Current period" value={`${formatDate(current.periodStart)} – ${formatDate(current.periodEnd)}`} />
          <Field label="Subscription" value={formatBdt(current.subscriptionPrice)} />
          <Field
            label="Eligible GMV"
            value={`${formatBdt(current.eligibleGmv)} (fee ${(current.platformFeeRate * 100).toFixed(2)}%)`}
          />
          <Field label="Platform fee" value={formatBdt(current.platformFeeAmount)} />
          <Field label="Total this period" value={<strong>{formatBdt(current.totalDue)}</strong>} />
          <Field label="Status" value={<Badge tone={current.status === 'OPEN' ? 'caution' : 'neutral'}>{current.status}</Badge>} />
        </div>
      ) : (
        <p className="text-sm text-ink-secondary">No billing history yet.</p>
      )}
      {periods.length > 1 ? (
        <div className="border-t border-line pt-3">
          <p className="mb-2 text-xs font-semibold uppercase text-ink-tertiary">Previous periods</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-ink-tertiary">
                  <th className="pb-2 pr-4 font-medium">Period</th>
                  <th className="pb-2 pr-4 font-medium">Plan</th>
                  <th className="pb-2 pr-4 font-medium text-right">Subscription</th>
                  <th className="pb-2 pr-4 font-medium text-right">GMV</th>
                  <th className="pb-2 pr-4 font-medium text-right">Platform fee</th>
                  <th className="pb-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {periods.slice(1).map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="py-2 pr-4 whitespace-nowrap">{formatDate(p.periodStart)}</td>
                    <td className="py-2 pr-4">{p.planName}</td>
                    <td className="py-2 pr-4 text-right">{formatBdt(p.subscriptionPrice)}</td>
                    <td className="py-2 pr-4 text-right">{formatBdt(p.eligibleGmv)}</td>
                    <td className="py-2 pr-4 text-right">{formatBdt(p.platformFeeAmount)}</td>
                    <td className="py-2 text-right font-medium">{formatBdt(p.totalDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

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

      <StoreUsageCard storeId={store.id} />
      <StoreBillingCard storeId={store.id} />

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
