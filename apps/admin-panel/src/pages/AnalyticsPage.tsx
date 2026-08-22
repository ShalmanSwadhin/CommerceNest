import { Link } from 'react-router-dom';
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
  // Confirmed billing revenue (subscription + platform fee actually PAID)
  // is a completely different figure from order GMV below — fetched
  // separately since it comes from the billing system, not analytics.
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
  const confirmedRevenue = billingQ.data
    ? billingQ.data.confirmedSubscriptionRevenue + billingQ.data.confirmedPlatformFeeRevenue
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Analytics</h2>
        <p className="text-sm text-ink-secondary">Platform aggregates from the live API</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Stores" value={formatNumber(data.totalStores)} />
        <KpiCard label="Active stores" value={formatNumber(data.activeStores)} />
        {/* Was labeled bare "Revenue" and sourced from order.total across
            CONFIRMED/PROCESSING/SHIPPED/DELIVERED orders — that's customer→
            merchant order GMV, not money CommerceNest has actually been
            paid. Relabeled to say what it is; the real platform-billing
            revenue figure is the card below, linking to Billing for detail. */}
        <KpiCard label="Order volume (GMV)" value={formatBdt(data.platformRevenue)} />
        <KpiCard label="Users" value={formatNumber(data.totalUsers)} />
      </div>
      <Card elevated>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-ink-tertiary">
              Confirmed platform revenue (received from merchants)
            </p>
            <p className="mt-1 text-2xl font-bold text-ink">
              {confirmedRevenue !== null ? formatBdt(confirmedRevenue) : '—'}
            </p>
            <p className="mt-1 text-xs text-ink-secondary">
              Subscription + platform fee amounts actually approved/paid — never unpaid invoice totals.
            </p>
          </div>
          <Link to="/billing" className="text-sm font-medium text-primary hover:underline">
            View full billing detail →
          </Link>
        </CardContent>
      </Card>
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
