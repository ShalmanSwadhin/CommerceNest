import { useQuery } from '@tanstack/react-query';
import { BarChart, Card, CardContent, CardHeader, CardTitle, KpiCard } from '@commercenest/ui';
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
  const newCustomersSeries = data.newCustomersSeries ?? [];

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
      <div className="grid gap-4 sm:grid-cols-2">
        <Card elevated>
          <CardHeader>
            <CardTitle>Transactions over time</CardTitle>
          </CardHeader>
          <CardContent>
            {series.length === 0 ? (
              <SoftEmpty title="No series data" description="Confirmed orders will appear here." />
            ) : (
              <BarChart points={series.map((p) => ({ label: p.date, value: p.orders ?? 0 }))} height={200} />
            )}
          </CardContent>
        </Card>
        <Card elevated>
          <CardHeader>
            <CardTitle>New customers</CardTitle>
          </CardHeader>
          <CardContent>
            {newCustomersSeries.length === 0 ? (
              <SoftEmpty title="No series data" description="New signups will appear here." />
            ) : (
              <BarChart
                points={newCustomersSeries.map((p) => ({ label: p.date, value: p.newCustomers }))}
                height={200}
                color="var(--cn-color-success)"
              />
            )}
          </CardContent>
        </Card>
      </div>
      <Card elevated padding="md">
        <CardTitle>Viewers</CardTitle>
        <p className="mt-2 text-sm text-ink-secondary">
          Not available — this store's storefront doesn't track page views today (no analytics-event model, no
          tracking call on storefront page loads). Showing an order-derived number here would misrepresent actual
          traffic, so this is left honestly blank rather than faked. Real view tracking would need a new event
          model plus an ingestion endpoint — a separate feature, not a chart-styling change.
        </p>
      </Card>
    </div>
  );
}
