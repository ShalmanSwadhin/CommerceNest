import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  FormField,
  Input,
  Modal,
  DataTable,
  useToast,
} from '@commercenest/ui';
import { ApiClientError, storeApi, unwrapList, type ReturnRow } from '../lib/api';
import { formatBdt, formatDate } from '../lib/format';
import { ErrorState, PageSkeleton } from '../components/QueryState';
import { useAuthStore, useStoreId } from '../stores/authStore';

const CAN_REFUND_ROLES = new Set(['STORE_OWNER', 'STORE_MANAGER', 'MASTER_ADMIN']);

const STATUS_TONE: Record<ReturnRow['status'], 'caution' | 'success' | 'danger' | 'neutral'> = {
  REQUESTED: 'caution',
  APPROVED: 'neutral',
  ITEM_RECEIVED: 'neutral',
  REFUNDED: 'success',
  REJECTED: 'danger',
};

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: 'All' },
  { key: 'REQUESTED', label: 'Requested' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'ITEM_RECEIVED', label: 'Item received' },
  { key: 'REFUNDED', label: 'Refunded' },
  { key: 'REJECTED', label: 'Rejected' },
];

export function ReturnsPage() {
  const storeId = useStoreId();
  const role = useAuthStore((s) => s.user?.role);
  const canRefund = role ? CAN_REFUND_ROLES.has(role) : false;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [rejectTarget, setRejectTarget] = useState<ReturnRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [refundTarget, setRefundTarget] = useState<ReturnRow | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState('BKASH');

  const q = useQuery({
    queryKey: ['store', storeId, 'returns', status],
    queryFn: () => storeApi.listReturns(storeId!, { limit: 100, ...(status ? { status } : {}) }),
    enabled: !!storeId,
  });
  const rows = useMemo(() => unwrapList(q.data), [q.data]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['store', storeId, 'returns'] });

  const approveMut = useMutation({
    mutationFn: (id: string) => storeApi.approveReturn(storeId!, id),
    onSuccess: () => {
      toast({ title: 'Return approved', tone: 'success' });
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Approve failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const rejectMut = useMutation({
    mutationFn: () => storeApi.rejectReturn(storeId!, rejectTarget!.id, rejectReason.trim()),
    onSuccess: () => {
      toast({ title: 'Return rejected', tone: 'caution' });
      setRejectTarget(null);
      setRejectReason('');
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Reject failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const receiveMut = useMutation({
    mutationFn: (id: string) => storeApi.markReturnReceived(storeId!, id),
    onSuccess: () => {
      toast({ title: 'Item marked received', tone: 'success' });
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Update failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const refundMut = useMutation({
    mutationFn: () =>
      storeApi.completeReturnRefund(storeId!, refundTarget!.id, {
        refundAmount: Number(refundAmount),
        refundMethod,
      }),
    onSuccess: () => {
      toast({ title: 'Refund recorded', tone: 'success' });
      setRefundTarget(null);
      setRefundAmount('');
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Refund failed',
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
        <h2 className="text-xl font-semibold">Returns &amp; refunds</h2>
        <p className="text-sm text-ink-secondary">
          Review return requests, confirm items received back, and record manual refunds.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatus(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              status === f.key
                ? 'border-primary bg-primary text-white'
                : 'border-line bg-white text-ink-secondary hover:bg-surface-raised'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card elevated padding="none">
        <DataTable
          data={rows}
          getRowKey={(r) => r.id}
          state={rows.length ? 'ready' : 'empty'}
          emptyTitle="No return requests"
          emptyDescription="Customer return requests will appear here."
          columns={[
            {
              key: 'order',
              header: 'Order',
              cell: (r) => r.order?.orderNumber || r.orderId,
            },
            {
              key: 'customer',
              header: 'Customer',
              cell: (r) => r.customer?.name || '—',
            },
            {
              key: 'reason',
              header: 'Reason',
              cell: (r) => <span className="line-clamp-2 max-w-xs text-xs">{r.reason}</span>,
            },
            {
              key: 'requested',
              header: 'Requested',
              cell: (r) => formatDate(r.requestedAt),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status.replace('_', ' ')}</Badge>,
            },
            {
              key: 'actions',
              header: '',
              cell: (r) => (
                <div className="flex flex-wrap justify-end gap-1">
                  {r.status === 'REQUESTED' ? (
                    <>
                      <Button
                        size="sm"
                        loading={approveMut.isPending}
                        onClick={() => approveMut.mutate(r.id)}
                      >
                        Approve
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setRejectTarget(r)}>
                        Reject
                      </Button>
                    </>
                  ) : null}
                  {r.status === 'APPROVED' ? (
                    <Button size="sm" loading={receiveMut.isPending} onClick={() => receiveMut.mutate(r.id)}>
                      Mark item received
                    </Button>
                  ) : null}
                  {r.status === 'ITEM_RECEIVED' && canRefund ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setRefundTarget(r);
                        setRefundAmount(r.order ? String(r.order.total) : '');
                      }}
                    >
                      Complete refund
                    </Button>
                  ) : null}
                  {r.status === 'ITEM_RECEIVED' && !canRefund ? (
                    <span className="text-xs text-ink-secondary">Awaiting refund (owner/manager)</span>
                  ) : null}
                  {r.status === 'REFUNDED' ? (
                    <span className="text-xs text-ink-secondary">
                      {r.refundAmount ? formatBdt(Number(r.refundAmount)) : ''} via {r.refundMethod}
                    </span>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject return request"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={rejectMut.isPending}
              disabled={!rejectReason.trim()}
              onClick={() => rejectMut.mutate()}
            >
              Reject
            </Button>
          </>
        }
      >
        <FormField label="Reason" htmlFor="return-reject-reason" required>
          <Input
            id="return-reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </FormField>
      </Modal>

      <Modal
        open={!!refundTarget}
        onClose={() => setRefundTarget(null)}
        title="Complete refund"
        description="V1 refunds are processed manually outside CommerceNest (e.g. bKash send-money). This just records that it happened."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefundTarget(null)}>
              Cancel
            </Button>
            <Button
              loading={refundMut.isPending}
              disabled={!(Number(refundAmount) > 0)}
              onClick={() => refundMut.mutate()}
            >
              Confirm refund
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Refund amount (BDT)" htmlFor="refund-amount" required>
            <Input
              id="refund-amount"
              type="number"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
            />
          </FormField>
          <FormField label="Refund method" htmlFor="refund-method" required>
            <select
              id="refund-method"
              className="h-10 w-full rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-sm"
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value)}
            >
              <option value="BKASH">bKash</option>
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="STORE_CREDIT">Store credit</option>
            </select>
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
