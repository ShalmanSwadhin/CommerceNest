import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, DataTable, useToast } from '@commercenest/ui';
import { adminApi, unwrapList } from '../lib/api';
import { formatBdt, formatDate } from '../lib/format';
import { ErrorState, PageSkeleton } from '../components/QueryState';

export function PaymentsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'payments', 'pending'],
    queryFn: () => adminApi.pendingPayments({ limit: 50 }),
  });

  const approve = useMutation({
    mutationFn: (orderId: string) => adminApi.approvePayment(orderId),
    onSuccess: async () => {
      toast({ title: 'Payment approved', tone: 'success' });
      await qc.invalidateQueries({ queryKey: ['admin', 'payments'] });
    },
    onError: (err: Error) => toast({ title: err.message, tone: 'danger' }),
  });

  const reject = useMutation({
    mutationFn: (orderId: string) => adminApi.rejectPayment(orderId, 'Rejected by Master Admin'),
    onSuccess: async () => {
      toast({ title: 'Payment rejected', tone: 'caution' });
      await qc.invalidateQueries({ queryKey: ['admin', 'payments'] });
    },
    onError: (err: Error) => toast({ title: err.message, tone: 'danger' }),
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Pending verification</h2>
        <p className="text-sm text-ink-secondary">
          Platform-wide manual bKash submissions awaiting review
        </p>
      </div>
      <Card elevated padding="none">
        <DataTable
          data={rows}
          getRowKey={(r) => r.id}
          state={rows.length ? 'ready' : 'empty'}
          emptyTitle="No pending payments"
          emptyDescription="When customers submit bKash txn IDs, they appear here."
          columns={[
            {
              key: 'order',
              header: 'Order',
              cell: (r) => r.orderNumber || r.id.slice(0, 8),
            },
            {
              key: 'store',
              header: 'Store',
              cell: (r) => r.store?.name || r.storeId || '-',
            },
            { key: 'txn', header: 'Txn ID', cell: (r) => r.bkashTxnId || '-' },
            { key: 'phone', header: 'Sender', cell: (r) => r.bkashSenderPhone || '-' },
            { key: 'total', header: 'Amount', cell: (r) => formatBdt(r.total) },
            {
              key: 'status',
              header: 'Status',
              cell: (r) => (
                <Badge tone="caution">{r.paymentStatus || 'PENDING_VERIFICATION'}</Badge>
              ),
            },
            { key: 'created', header: 'Submitted', cell: (r) => formatDate(r.createdAt) },
            {
              key: 'actions',
              header: 'Actions',
              cell: (r) => (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    loading={approve.isPending}
                    onClick={() => approve.mutate(r.id)}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    loading={reject.isPending}
                    onClick={() => reject.mutate(r.id)}
                  >
                    Reject
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
