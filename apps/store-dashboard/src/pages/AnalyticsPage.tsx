import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, KpiCard } from '@commercenest/ui';
import { storeApi } from '../lib/api';
import { formatBdt, formatNumber } from '../lib/format';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';
import { useStoreId } from '../stores/authStore';

export function AnalyticsPage() {
  const storeId = useStoreId();
  const q = useQuery({
    queryKey: ['store', storeId, 'analytics'],
    queryFn: () => storeApi.summary(storeId!),
    enabled: !!storeId,
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

  const data = q.data ?? {};
  const series = data.revenueSeries ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Analytics</h2>
        <p className="text-sm text-ink-secondary">Store aggregates from the live API</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Orders" value={formatNumber(data.orders)} />
        <KpiCard label="Revenue" value={formatBdt(data.revenue)} />
        <KpiCard label="Customers" value={formatNumber(data.customers)} />
        <KpiCard label="Pending payments" value={formatNumber(data.pendingPayments)} />
      </div>
      <Card elevated>
        <CardHeader>
          <CardTitle>Daily revenue</CardTitle>
        </CardHeader>
        <CardContent>
          {series.length === 0 ? (
            <SoftEmpty title="No series data" description="API did not return revenueSeries." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-ink-secondary">
                  <th className="py-2">Date</th>
                  <th className="py-2">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {series.map((row) => (
                  <tr key={row.date} className="border-b border-line">
                    <td className="py-2">{row.date}</td>
                    <td className="py-2">{formatBdt(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
