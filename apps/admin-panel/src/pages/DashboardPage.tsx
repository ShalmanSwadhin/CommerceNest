import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Avatar,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  KpiCard,
} from '@commercenest/ui';
import {
  Activity,
  CreditCard,
  Store,
  Users,
  Wallet,
} from 'lucide-react';
import { adminApi } from '../lib/api';
import { formatBdt, formatDate, formatNumber } from '../lib/format';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';

function statusTone(status?: string) {
  if (status === 'ACTIVE') return 'success' as const;
  if (status === 'SUSPENDED') return 'danger' as const;
  if (status === 'PENDING_SETUP') return 'caution' as const;
  return 'neutral' as const;
}

export function DashboardPage() {
  const q = useQuery({
    queryKey: ['admin', 'summary'],
    queryFn: () => adminApi.summary(),
  });
  // Confirmed platform billing revenue (subscription + fee actually paid)
  // — a different figure from the order-GMV KPI below, fetched separately
  // since it comes from the billing system, not analytics.
  const billingQ = useQuery({
    queryKey: ['admin', 'billing', 'summary'],
    queryFn: () => adminApi.getBillingSummary(),
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

  const data = q.data ?? {};
  const series = data.revenueSeries ?? [];
  const topStores = data.topStores ?? [];
  const activity = data.recentActivity ?? [];
  const confirmedRevenue = billingQ.data
    ? billingQ.data.confirmedSubscriptionRevenue + billingQ.data.confirmedPlatformFeeRevenue
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Dashboard</h2>
          <p className="text-sm text-ink-secondary">
            Platform overview across all CommerceNest tenants
          </p>
        </div>
        <Badge tone="info">Live API data</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          label="Total Stores"
          value={formatNumber(data.totalStores)}
          change={{ value: 'All registered tenants', trend: 'neutral' }}
          icon={<Store />}
        />
        <KpiCard
          label="Active Stores"
          value={formatNumber(data.activeStores)}
          change={{ value: 'Currently selling', trend: 'up' }}
          icon={<Activity />}
        />
        {/* Was labeled "Platform Revenue" — that's customer→merchant order
            GMV (order.total across CONFIRMED/PROCESSING/SHIPPED/DELIVERED
            orders), not money CommerceNest has actually collected. Relabeled
            to say what it is; the real confirmed billing revenue is the
            next card. */}
        <KpiCard
          label="Order Volume (GMV)"
          value={formatBdt(data.platformRevenue)}
          change={{ value: 'Recognized orders', trend: 'up' }}
          icon={<Wallet />}
        />
        <KpiCard
          label="Confirmed Revenue"
          value={confirmedRevenue !== null ? formatBdt(confirmedRevenue) : '—'}
          change={{ value: 'Subscription + fees actually paid', trend: 'up' }}
          icon={<CreditCard />}
        />
        <KpiCard
          label="Total Users"
          value={formatNumber(data.totalUsers)}
          change={{ value: 'Store staff accounts', trend: 'neutral' }}
          icon={<Users />}
        />
        <KpiCard
          label="Pending Payments"
          value={formatNumber(data.pendingPayments)}
          change={{
            value: formatBdt(data.pendingPaymentAmount ?? 0),
            trend: (data.pendingPayments ?? 0) > 0 ? 'down' : 'neutral',
          }}
          icon={<CreditCard />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card elevated className="xl:col-span-2" padding="md">
          <CardHeader className="mb-2 !flex-row items-center justify-between !space-y-0 !gap-2">
            <CardTitle>Revenue overview</CardTitle>
            <span className="text-xs text-ink-tertiary">Last 14 days</span>
          </CardHeader>
          <CardContent>
            {series.length === 0 ? (
              <SoftEmpty
                title="No revenue series yet"
                description="Place and confirm orders to populate the revenue chart."
              />
            ) : (
              <AreaChart
                points={series.map((p) => ({ label: p.date, value: p.revenue }))}
                height={240}
              />
            )}
          </CardContent>
        </Card>

        <Card elevated padding="md">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {activity.length === 0 ? (
              <p className="text-sm text-ink-secondary">No recent platform activity.</p>
            ) : (
              activity.slice(0, 8).map((item, idx) => (
                <div
                  key={item.id}
                  className={`flex gap-3 py-3 ${idx < Math.min(activity.length, 8) - 1 ? 'border-b border-line' : ''}`}
                >
                  <div className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0">
                    <p className="text-sm text-ink">{item.message}</p>
                    <p className="mt-1 text-xs text-ink-tertiary">
                      {formatDate(item.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card elevated padding="none">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h3 className="text-base font-semibold">Top stores</h3>
          <span className="text-xs text-ink-tertiary">By recognized revenue</span>
        </div>
        <DataTable
          data={topStores}
          getRowKey={(r) => r.id}
          state={topStores.length ? 'ready' : 'empty'}
          emptyTitle="No store rankings yet"
          emptyDescription="Top stores appear once orders generate revenue."
          columns={[
            {
              key: 'name',
              header: 'Store',
              cell: (r) => (
                <div>
                  <div className="font-medium text-ink">{r.name}</div>
                  <div className="text-xs text-ink-tertiary">{r.slug}</div>
                </div>
              ),
            },
            {
              key: 'owner',
              header: 'Owner',
              cell: (r) => (
                <div className="flex items-center gap-2">
                  <Avatar name={r.ownerName || r.name} size="sm" />
                  <span className="text-sm">{r.ownerName || '—'}</span>
                </div>
              ),
            },
            { key: 'orders', header: 'Orders', cell: (r) => formatNumber(r.orders) },
            { key: 'revenue', header: 'Revenue', cell: (r) => formatBdt(r.revenue) },
            {
              key: 'status',
              header: 'Status',
              cell: (r) => (
                <Badge tone={statusTone(r.status)}>{r.status || 'UNKNOWN'}</Badge>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
