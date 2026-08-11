import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  KpiCard,
} from '@commercenest/ui';
import { Package, ShoppingCart, Users, Wallet } from 'lucide-react';
import { storeApi } from '../lib/api';
import { formatBdt, formatNumber } from '../lib/format';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';
import { useStoreId } from '../stores/authStore';

export function DashboardPage() {
  const storeId = useStoreId();
  const q = useQuery({
    queryKey: ['store', storeId, 'summary'],
    queryFn: () => storeApi.summary(storeId!),
    enabled: !!storeId,
  });

  if (!storeId) {
    return <ErrorState message="Missing store context on this account." />;
  }
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
          <p className="text-sm text-ink-secondary">Store performance at a glance</p>
        </div>
        <Badge tone="info">Live</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Orders"
          value={formatNumber(data.orders)}
          change={{ value: 'All time', trend: 'neutral' }}
          icon={<ShoppingCart />}
        />
        <KpiCard
          label="Total Revenue"
          value={formatBdt(data.revenue)}
          change={{ value: 'Recognized', trend: 'up' }}
          icon={<Wallet />}
        />
        <KpiCard
          label="Total Customers"
          value={formatNumber(data.customers)}
          icon={<Users />}
        />
        <KpiCard
          label="Products"
          value={formatNumber(data.products)}
          icon={<Package />}
        />
      </div>
      <Card elevated>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Revenue overview</CardTitle>
          <span className="text-xs text-ink-tertiary">Last 14 days</span>
        </CardHeader>
        <CardContent>
          {series.length === 0 ? (
            <SoftEmpty
              title="No chart data"
              description="Confirmed orders will appear in this revenue series."
            />
          ) : (
            <AreaChart
              points={series.map((p) => ({ label: p.date, value: p.revenue }))}
              height={220}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
