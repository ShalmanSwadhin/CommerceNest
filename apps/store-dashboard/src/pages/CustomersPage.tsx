import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, DataTable } from '@commercenest/ui';
import { storeApi, unwrapList } from '../lib/api';
import { formatDate } from '../lib/format';
import { ErrorState, PageSkeleton } from '../components/QueryState';
import { RiskBadge } from '../components/RiskBadge';
import { useStoreId } from '../stores/authStore';

export function CustomersPage() {
  const storeId = useStoreId();
  const q = useQuery({
    queryKey: ['store', storeId, 'customers'],
    queryFn: () => storeApi.listCustomers(storeId!, { limit: 100 }),
    enabled: !!storeId,
  });
  const rows = useMemo(() => unwrapList(q.data), [q.data]);

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Customers</h2>
        <p className="text-sm text-ink-secondary">Risk badges help prioritize COD confirmations</p>
      </div>
      <Card elevated padding="none">
        <DataTable
          data={rows}
          getRowKey={(r) => r.id}
          state={rows.length ? 'ready' : 'empty'}
          emptyTitle="No customers yet"
          emptyDescription="Customers appear after their first order."
          columns={[
            { key: 'name', header: 'Name', cell: (r) => r.name || '—' },
            { key: 'phone', header: 'Phone', cell: (r) => r.phone },
            { key: 'risk', header: 'Risk', cell: (r) => <RiskBadge level={r.riskLevel} /> },
            { key: 'orders', header: 'Orders', cell: (r) => r.orderCount ?? '—' },
            { key: 'joined', header: 'Joined', cell: (r) => formatDate(r.createdAt) },
          ]}
        />
      </Card>
    </div>
  );
}
