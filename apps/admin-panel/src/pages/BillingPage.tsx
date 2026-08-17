import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card } from '@commercenest/ui';
import { adminApi } from '../lib/api';
import { formatDate } from '../lib/format';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';

function formatBdt(amount: number) {
  return `৳${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

const statusTone: Record<string, 'success' | 'caution' | 'neutral'> = {
  OPEN: 'caution',
  CLOSED: 'neutral',
};

/**
 * Platform-wide billing — subscription charges + platform fees across every
 * store, one row per store per billing period. Per-store detail (including
 * usage against plan limits) lives on the Store Detail page; this is the
 * cross-store rollup. Replaces the earlier "Licenses" placeholder — seat
 * licensing was never built, real usage-based billing was, so this is what
 * that nav slot actually needed to become.
 */
export function BillingPage() {
  const [storeFilter, setStoreFilter] = useState('');

  const q = useQuery({
    queryKey: ['admin', 'billing', storeFilter],
    queryFn: () => adminApi.listAllBilling({ limit: 50, storeId: storeFilter || undefined }),
  });

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError) {
    return (
      <ErrorState
        message={q.error instanceof Error ? q.error.message : undefined}
        onRetry={() => void q.refetch()}
      />
    );
  }

  const periods = q.data?.items ?? [];
  const totalPlatformFee = periods.reduce((sum, p) => sum + p.platformFeeAmount, 0);
  const totalSubscription = periods.reduce((sum, p) => sum + p.subscriptionPrice, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Billing</h2>
        <p className="text-sm text-ink-secondary">
          Subscription charges and platform fees across every store, by billing period.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card elevated padding="md">
          <p className="text-xs font-semibold uppercase text-ink-tertiary">Subscription revenue (shown periods)</p>
          <p className="mt-1 text-2xl font-bold text-ink">{formatBdt(totalSubscription)}</p>
        </Card>
        <Card elevated padding="md">
          <p className="text-xs font-semibold uppercase text-ink-tertiary">Platform fee revenue (shown periods)</p>
          <p className="mt-1 text-2xl font-bold text-ink">{formatBdt(totalPlatformFee)}</p>
        </Card>
      </div>

      <Card elevated padding="md" className="flex items-center gap-3">
        <input
          className="h-10 flex-1 rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-sm"
          placeholder="Filter by store ID…"
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
        />
      </Card>

      {periods.length === 0 ? (
        <Card elevated>
          <SoftEmpty title="No billing periods yet" description="Periods are opened automatically the first time a store's usage or billing is viewed." />
        </Card>
      ) : (
        <Card elevated padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-tertiary">
                  <th className="px-4 py-3 font-medium">Store</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 text-right font-medium">Subscription</th>
                  <th className="px-4 py-3 text-right font-medium">Eligible GMV</th>
                  <th className="px-4 py-3 text-right font-medium">Platform fee</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.store?.name ?? '—'}</div>
                      <div className="text-xs text-ink-tertiary">{p.store?.slug}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(p.periodStart)}</td>
                    <td className="px-4 py-3">{p.planName}</td>
                    <td className="px-4 py-3 text-right">{formatBdt(p.subscriptionPrice)}</td>
                    <td className="px-4 py-3 text-right">{formatBdt(p.eligibleGmv)}</td>
                    <td className="px-4 py-3 text-right">{formatBdt(p.platformFeeAmount)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatBdt(p.totalDue)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone[p.status] ?? 'neutral'}>{p.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
