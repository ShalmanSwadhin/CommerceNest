import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, DataTable, Pagination } from '@commercenest/ui';
import { adminApi, unwrapList, unwrapTotal } from '../lib/api';
import { formatDate } from '../lib/format';
import { ErrorState, PageSkeleton } from '../components/QueryState';

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['admin', 'audit', page],
    queryFn: () => adminApi.auditLogs({ page, limit: 20 }),
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

  const rows = unwrapList(q.data);
  const total = unwrapTotal(q.data);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Audit Logs</h2>
        <p className="text-sm text-ink-secondary">Sensitive Master Admin and payment actions</p>
      </div>
      <Card elevated padding="none">
        <DataTable
          data={rows}
          getRowKey={(r) => r.id}
          state={rows.length ? 'ready' : 'empty'}
          emptyTitle="No audit events"
          emptyDescription="Actions like suspend, impersonate, and publish will appear here."
          columns={[
            { key: 'action', header: 'Action', cell: (r) => r.action },
            {
              key: 'actor',
              header: 'Actor',
              cell: (r) => r.actor?.email || r.actor?.name || '—',
            },
            {
              key: 'entity',
              header: 'Entity',
              cell: (r) => `${r.entityType || '—'}${r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ''}`,
            },
            { key: 'when', header: 'When', cell: (r) => formatDate(r.createdAt) },
          ]}
        />
        <div className="border-t border-line px-4 py-3">
          <Pagination page={page} pageSize={20} total={total} onPageChange={setPage} />
        </div>
      </Card>
    </div>
  );
}
