import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  DataTable,
  FormField,
  Input,
  Modal,
  useToast,
} from '@commercenest/ui';
import { ApiClientError, storeApi, type OrderRow, unwrapList } from '../lib/api';
import { formatBdt, formatDate } from '../lib/format';
import { ErrorState, PageSkeleton } from '../components/QueryState';
import { useStoreId } from '../stores/authStore';

export function PaymentsPage() {
  const storeId = useStoreId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<OrderRow | null>(null);
  const [reason, setReason] = useState('');

  const q = useQuery({
    queryKey: ['store', storeId, 'payments', 'pending'],
    queryFn: () => storeApi.pendingPayments(storeId!, { limit: 100 }),
    enabled: !!storeId,
  });
  const rows = useMemo(() => unwrapList(q.data), [q.data]);

  const approveMut = useMutation({
    mutationFn: (orderId: string) => storeApi.approvePayment(storeId!, orderId),
    onSuccess: () => {
      toast({ title: 'Payment approved', tone: 'success' });
      void qc.invalidateQueries({ queryKey: ['store', storeId, 'payments'] });
    },
    onError: (err) =>
      toast({
        title: 'Approve failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const rejectMut = useMutation({
    mutationFn: () => storeApi.rejectPayment(storeId!, rejectTarget!.id, reason),
    onSuccess: () => {
      toast({ title: 'Payment rejected', tone: 'caution' });
      setRejectTarget(null);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['store', storeId, 'payments'] });
    },
    onError: (err) =>
      toast({
        title: 'Reject failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">bKash verification queue</h2>
        <p className="text-sm text-ink-secondary">
          Primary V1 payment workflow - approve or reject PENDING_VERIFICATION payments
        </p>
      </div>
      <Card elevated padding="none">
        <DataTable
          data={rows}
          getRowKey={(r) => r.id}
          state={rows.length ? 'ready' : 'empty'}
          emptyTitle="Queue is clear"
          emptyDescription="No manual bKash payments are waiting for verification."
          columns={[
            {
              key: 'order',
              header: 'Order',
              cell: (r) => r.orderNumber || r.id.slice(0, 8),
            },
            { key: 'customer', header: 'Customer', cell: (r) => r.customerPhone || '-' },
            { key: 'txn', header: 'Txn ID', cell: (r) => r.bkashTxnId || '-' },
            { key: 'sender', header: 'Sender', cell: (r) => r.bkashSenderPhone || '-' },
            { key: 'amount', header: 'Amount', cell: (r) => formatBdt(r.total) },
            {
              key: 'status',
              header: 'Status',
              cell: () => <Badge tone="caution">PENDING_VERIFICATION</Badge>,
            },
            { key: 'when', header: 'Submitted', cell: (r) => formatDate(r.createdAt) },
            {
              key: 'actions',
              header: 'Actions',
              cell: (r) => (
                <div className="flex gap-2">
                  <Button size="sm" loading={approveMut.isPending} onClick={() => approveMut.mutate(r.id)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setRejectTarget(r)}>
                    Reject
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject payment"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={rejectMut.isPending}
              disabled={!reason.trim()}
              onClick={() => rejectMut.mutate()}
            >
              Reject
            </Button>
          </>
        }
      >
        <FormField label="Rejection reason" htmlFor="reason" required>
          <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </Modal>
    </div>
  );
}
