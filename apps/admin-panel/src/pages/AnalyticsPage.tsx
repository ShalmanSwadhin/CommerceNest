import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, KpiCard } from '@commercenest/ui';
import { adminApi } from '../lib/api';
import { formatBdt, formatNumber } from '../lib/format';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';

export function AnalyticsPage() {
  const q = useQuery({
    queryKey: ['admin', 'analytics'],
    queryFn: () => adminApi.summary(),
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Analytics</h2>
        <p className="text-sm text-ink-secondary">Platform aggregates from the live API</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Stores" value={formatNumber(data.totalStores)} />
        <KpiCard label="Active stores" value={formatNumber(data.activeStores)} />
        <KpiCard label="Revenue" value={formatBdt(data.platformRevenue)} />
        <KpiCard label="Users" value={formatNumber(data.totalUsers)} />
      </div>
      <Card elevated>
        <CardHeader>
          <CardTitle>Revenue series</CardTitle>
        </CardHeader>
        <CardContent>
          {series.length === 0 ? (
            <SoftEmpty
              title="No time-series data"
              description="The analytics endpoint did not return revenueSeries."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-ink-secondary">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((row) => (
                    <tr key={row.date} className="border-b border-line">
                      <td className="py-2 pr-4">{row.date}</td>
                      <td className="py-2">{formatBdt(row.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
