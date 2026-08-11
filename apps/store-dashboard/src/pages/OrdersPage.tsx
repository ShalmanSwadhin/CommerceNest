import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Drawer,
  FormField,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  useToast,
} from '@commercenest/ui';
import { ApiClientError, storeApi, type OrderRow, unwrapList } from '../lib/api';
import { formatBdt, formatDate } from '../lib/format';
import { ErrorState, PageSkeleton } from '../components/QueryState';
import { RiskBadge } from '../components/RiskBadge';
import { useStoreId } from '../stores/authStore';

const tabs = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function orderStatusTone(status: string) {
  if (status === 'DELIVERED') return 'success' as const;
  if (status === 'CANCELLED' || status === 'REFUNDED') return 'danger' as const;
  if (status === 'PENDING') return 'caution' as const;
  if (status === 'SHIPPED' || status === 'PROCESSING') return 'info' as const;
  return 'neutral' as const;
}

function paymentTone(status?: string) {
  if (status === 'APPROVED') return 'success' as const;
  if (status === 'REJECTED' || status === 'CANCELLED') return 'danger' as const;
  if (status === 'PENDING_VERIFICATION') return 'caution' as const;
  return 'neutral' as const;
}

export function OrdersPage() {
  const storeId = useStoreId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [trackingId, setTrackingId] = useState('');
  const [courierName, setCourierName] = useState('');
  const [courierNotes, setCourierNotes] = useState('');

  const q = useQuery({
    queryKey: ['store', storeId, 'orders', status],
    queryFn: () =>
      storeApi.listOrders(storeId!, { status: status || undefined, limit: 50 }),
    enabled: !!storeId,
  });

  const detailQ = useQuery({
    queryKey: ['store', storeId, 'order', selected?.id],
    queryFn: () => storeApi.getOrder(storeId!, selected!.id),
    enabled: !!storeId && !!selected?.id,
  });

  const order = detailQ.data || selected;
  const rows = useMemo(() => unwrapList(q.data), [q.data]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['store', storeId, 'orders'] });
    void qc.invalidateQueries({ queryKey: ['store', storeId, 'order', selected?.id] });
  };

  const statusMut = useMutation({
    mutationFn: (next: string) =>
      storeApi.updateOrderStatus(storeId!, order!.id, {
        status: next,
        courierTrackingId: next === 'SHIPPED' ? trackingId : undefined,
      }),
    onSuccess: () => {
      toast({ title: 'Order updated', tone: 'success' });
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Update failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const codMut = useMutation({
    mutationFn: () =>
      storeApi.confirmCod(storeId!, order!.id, {
        codConfirmedByCall: true,
      }),
    onSuccess: () => {
      toast({ title: 'COD confirmed', tone: 'success' });
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'COD confirm failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const courierMut = useMutation({
    mutationFn: () =>
      storeApi.updateCourier(storeId!, order!.id, {
        courierName: courierName || undefined,
        courierTrackingId: trackingId || undefined,
        courierNotes: courierNotes || undefined,
      }),
    onSuccess: () => {
      toast({ title: 'Courier details saved', tone: 'success' });
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Courier update failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const payMut = useMutation({
    mutationFn: (approved: boolean) =>
      approved
        ? storeApi.approvePayment(storeId!, order!.id)
        : storeApi.rejectPayment(storeId!, order!.id, 'Invalid transaction'),
    onSuccess: () => {
      toast({ title: 'Payment reviewed', tone: 'success' });
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Payment action failed',
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
        <h2 className="text-xl font-semibold">Orders</h2>
        <p className="text-sm text-ink-secondary">Filter, inspect risk, and advance fulfillment</p>
      </div>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value || 'all'} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card elevated padding="none">
        <DataTable
          data={rows}
          getRowKey={(r) => r.id}
          state={rows.length ? 'ready' : 'empty'}
          emptyTitle="No orders"
          emptyDescription="Orders placed on the storefront will appear here."
          columns={[
            {
              key: 'number',
              header: 'Order ID',
              cell: (r) => (
                <button
                  className="font-medium text-primary"
                  onClick={() => {
                    setSelected(r);
                    setTrackingId(r.courierTrackingId || '');
                    setCourierName(r.courierName || '');
                    setCourierNotes(r.courierNotes || '');
                  }}
                >
                  {r.orderNumber || r.id.slice(0, 8)}
                </button>
              ),
            },
            {
              key: 'customer',
              header: 'Customer',
              cell: (r) => r.customerName || r.customerPhone || '-',
            },
            {
              key: 'created',
              header: 'Date',
              cell: (r) => formatDate(r.createdAt),
            },
            { key: 'total', header: 'Amount', cell: (r) => formatBdt(r.total) },
            {
              key: 'status',
              header: 'Status',
              cell: (r) => <Badge tone={orderStatusTone(r.status)}>{r.status}</Badge>,
            },
            {
              key: 'pay',
              header: 'Payment',
              cell: (r) => (
                <div className="space-y-1">
                  <Badge tone="neutral">
                    {r.paymentMethod === 'CASH_ON_DELIVERY'
                      ? 'Cash on Delivery'
                      : r.paymentMethod === 'MANUAL_BKASH'
                        ? 'bKash'
                        : r.paymentMethod || '-'}
                  </Badge>
                  <div>
                    <Badge tone={paymentTone(r.paymentStatus)}>
                      {r.paymentStatus === 'APPROVED'
                        ? 'Paid'
                        : r.paymentStatus || '-'}
                    </Badge>
                  </div>
                </div>
              ),
            },
            {
              key: 'risk',
              header: 'Risk',
              cell: (r) => <RiskBadge level={r.riskLevelAtPlacement} />,
            },
          ]}
        />
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={order?.orderNumber || 'Order detail'}
        width="lg"
      >
        {!order ? null : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone="primary">{order.status}</Badge>
              <RiskBadge level={order.riskLevelAtPlacement} />
              <Badge tone="neutral">{order.paymentMethod}</Badge>
              <Badge tone="caution">{order.paymentStatus}</Badge>
            </div>
            <div className="text-sm text-ink-secondary">
              <div>{order.customerName}</div>
              <div>{order.customerPhone}</div>
              <div className="mt-2 font-medium text-ink">{formatBdt(order.total)}</div>
            </div>
            {order.paymentMethod === 'CASH_ON_DELIVERY' && !order.codConfirmedByCall && (
              <Button loading={codMut.isPending} onClick={() => codMut.mutate()}>
                Confirm COD by call
              </Button>
            )}
            {order.paymentStatus === 'PENDING_VERIFICATION' && (
              <div className="flex gap-2">
                <Button loading={payMut.isPending} onClick={() => payMut.mutate(true)}>
                  Approve bKash
                </Button>
                <Button
                  variant="destructive"
                  loading={payMut.isPending}
                  onClick={() => payMut.mutate(false)}
                >
                  Reject
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <FormField label="Courier tracking (for Shipped)" htmlFor="tracking">
                <Input id="tracking" value={trackingId} onChange={(e) => setTrackingId(e.target.value)} />
              </FormField>
              <div className="flex flex-wrap gap-2">
                {['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant="secondary"
                    loading={statusMut.isPending}
                    onClick={() => statusMut.mutate(s)}
                  >
                    Mark {s}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-cn border border-line p-3">
              <h4 className="text-sm font-semibold">Courier details</h4>
              <FormField label="Courier name" htmlFor="courierName">
                <Input
                  id="courierName"
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  placeholder="e.g. Pathao, Steadfast, RedX"
                />
              </FormField>
              <FormField label="Courier notes" htmlFor="courierNotes">
                <Textarea
                  id="courierNotes"
                  value={courierNotes}
                  onChange={(e) => setCourierNotes(e.target.value)}
                  rows={2}
                />
              </FormField>
              <Button
                size="sm"
                loading={courierMut.isPending}
                onClick={() => courierMut.mutate()}
              >
                Save courier details
              </Button>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Items</h4>
              {(order.items || []).map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span>
                    {item.productName || 'Item'} x {item.quantity}
                  </span>
                  <span>{formatBdt(item.unitPrice)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
