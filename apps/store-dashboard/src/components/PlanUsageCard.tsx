import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge, Card } from '@commercenest/ui';
import { storeApi } from '../lib/api';
import { useStoreId } from '../stores/authStore';

function formatBdt(amount: number) {
  return `৳${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function UsageRow({ label, used, limit, display }: { label: string; used: number; limit: number | null; display: string }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const nearLimit = limit !== null && pct >= 80;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-secondary">{label}</span>
        <span className={`font-medium ${pct >= 100 ? 'text-red-600' : 'text-ink'}`}>{display}</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-primary'}`}
          style={{ width: `${limit ? pct : 100}%` }}
        />
      </div>
      {nearLimit ? (
        <p className="mt-1 text-xs text-amber-600">
          {pct >= 100 ? "You've reached this limit." : "You're approaching your plan's limit."} Contact
          CommerceNest to discuss upgrading.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Merchant-facing "Plan & Usage" — deliberately shows only what a merchant
 * needs to manage their own account (usage vs. limits, current period's
 * estimated bill). Master Admin's per-store view additionally shows
 * cross-store rollups and full billing history — this stays scoped to one
 * store, on purpose.
 */
export function PlanUsageCard() {
  const storeId = useStoreId();

  const usageQ = useQuery({
    queryKey: ['store', storeId, 'usage'],
    queryFn: () => storeApi.getUsage(storeId!),
    enabled: !!storeId,
  });
  const billingQ = useQuery({
    queryKey: ['store', storeId, 'billing'],
    queryFn: () => storeApi.getBilling(storeId!),
    enabled: !!storeId,
  });

  if (usageQ.isLoading || !usageQ.data) return null;
  const usage = usageQ.data;
  const period = billingQ.data?.period;

  return (
    <Card elevated className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Plan & usage</h3>
        <Badge tone="neutral">{usage.planName}</Badge>
      </div>

      <div className="space-y-4">
        <UsageRow
          label="Active products"
          used={usage.products.used}
          limit={usage.products.limit}
          display={`${usage.products.used} / ${usage.products.limit ?? 'Unlimited'}`}
        />
        <UsageRow
          label="Staff accounts"
          used={usage.staff.used}
          limit={usage.staff.limit}
          display={`${usage.staff.used} / ${usage.staff.limit ?? 'Unlimited'}`}
        />
        <UsageRow
          label="Storage"
          used={usage.storage.usedBytes}
          limit={usage.storage.limitBytes}
          display={`${formatBytes(usage.storage.usedBytes)} / ${usage.storage.limitBytes ? formatBytes(usage.storage.limitBytes) : 'Unlimited'}`}
        />
      </div>

      {period ? (
        <div className="border-t border-line pt-4">
          <p className="text-xs font-semibold uppercase text-ink-tertiary">
            Current billing period ({new Date(period.periodStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} –{' '}
            {new Date(period.periodEnd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-ink-tertiary">Subscription</p>
              <p className="font-medium text-ink">{formatBdt(period.subscriptionPrice)}</p>
            </div>
            <div>
              <p className="text-ink-tertiary">Eligible sales</p>
              <p className="font-medium text-ink">{formatBdt(period.eligibleGmv)}</p>
            </div>
            <div>
              <p className="text-ink-tertiary">Platform fee ({(period.platformFeeRate * 100).toFixed(2)}%)</p>
              <p className="font-medium text-ink">{formatBdt(period.platformFeeAmount)}</p>
            </div>
            <div>
              <p className="text-ink-tertiary">Estimated total</p>
              <p className="font-medium text-ink">{formatBdt(period.totalDue)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-tertiary">
            The platform fee is separate from any payment gateway charges, and this estimate can
            still change from refunds or cancellations before the period closes.
          </p>
          <Link to="/billing" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
            View invoices &amp; payments →
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
