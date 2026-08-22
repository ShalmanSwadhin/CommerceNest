import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Badge, Button, Card } from '@commercenest/ui';
import { adminApi } from '../lib/api';
import { formatDate } from '../lib/format';
import { ErrorState, PageSkeleton } from '../components/QueryState';
import { downloadCsv } from '../lib/csv';

function formatBdt(amount: number) {
  return `৳${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function UsageBar({ used, limit }: { used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
      <div
        className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-primary'}`}
        style={{ width: `${limit ? pct : 100}%` }}
      />
    </div>
  );
}

function StoreUsageCard({ storeId }: { storeId: string }) {
  const q = useQuery({
    queryKey: ['admin', 'stores', storeId, 'usage'],
    queryFn: () => adminApi.getStoreUsage(storeId),
  });
  if (q.isLoading || !q.data) return null;
  const usage = q.data;
  return (
    <Card elevated padding="lg" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Usage — {usage.planName} plan</h3>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-secondary">Products</span>
            <span className="font-medium text-ink">
              {usage.products.used} / {usage.products.limit ?? '∞'}
            </span>
          </div>
          <UsageBar used={usage.products.used} limit={usage.products.limit} />
        </div>
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-secondary">Staff</span>
            <span className="font-medium text-ink">
              {usage.staff.used} / {usage.staff.limit ?? '∞'}
            </span>
          </div>
          <UsageBar used={usage.staff.used} limit={usage.staff.limit} />
        </div>
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-secondary">Storage</span>
            <span className="font-medium text-ink">
              {formatBytes(usage.storage.usedBytes)} / {usage.storage.limitBytes ? formatBytes(usage.storage.limitBytes) : '∞'}
            </span>
          </div>
          <UsageBar used={usage.storage.usedBytes} limit={usage.storage.limitBytes} />
        </div>
      </div>
    </Card>
  );
}

function StoreBillingCard({ storeId }: { storeId: string }) {
  const q = useQuery({
    queryKey: ['admin', 'stores', storeId, 'billing'],
    queryFn: () => adminApi.getStoreBillingHistory(storeId, { limit: 6 }),
  });
  if (q.isLoading || !q.data) return null;
  const periods = q.data.items;
  const current = periods[0];
  return (
    <Card elevated padding="lg" className="space-y-4">
      <h3 className="text-sm font-semibold text-ink">Billing</h3>
      {current ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Current period" value={`${formatDate(current.periodStart)} – ${formatDate(current.periodEnd)}`} />
          <Field label="Subscription" value={formatBdt(current.subscriptionPrice)} />
          <Field
            label="Eligible GMV"
            value={`${formatBdt(current.eligibleGmv)} (fee ${(current.platformFeeRate * 100).toFixed(2)}%)`}
          />
          <Field label="Platform fee" value={formatBdt(current.platformFeeAmount)} />
          <Field label="Total this period" value={<strong>{formatBdt(current.totalDue)}</strong>} />
          <Field label="Status" value={<Badge tone={current.status === 'OPEN' ? 'caution' : 'neutral'}>{current.status}</Badge>} />
        </div>
      ) : (
        <p className="text-sm text-ink-secondary">No billing history yet.</p>
      )}
      {periods.length > 1 ? (
        <div className="border-t border-line pt-3">
          <p className="mb-2 text-xs font-semibold uppercase text-ink-tertiary">Previous periods</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-ink-tertiary">
                  <th className="pb-2 pr-4 font-medium">Period</th>
                  <th className="pb-2 pr-4 font-medium">Plan</th>
                  <th className="pb-2 pr-4 font-medium text-right">Subscription</th>
                  <th className="pb-2 pr-4 font-medium text-right">GMV</th>
                  <th className="pb-2 pr-4 font-medium text-right">Platform fee</th>
                  <th className="pb-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {periods.slice(1).map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="py-2 pr-4 whitespace-nowrap">{formatDate(p.periodStart)}</td>
                    <td className="py-2 pr-4">{p.planName}</td>
                    <td className="py-2 pr-4 text-right">{formatBdt(p.subscriptionPrice)}</td>
                    <td className="py-2 pr-4 text-right">{formatBdt(p.eligibleGmv)}</td>
                    <td className="py-2 pr-4 text-right">{formatBdt(p.platformFeeAmount)}</td>
                    <td className="py-2 text-right font-medium">{formatBdt(p.totalDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

const invoiceStatusTone: Record<string, 'success' | 'caution' | 'danger' | 'neutral'> = {
  DRAFT: 'neutral',
  ISSUED: 'caution',
  PARTIALLY_PAID: 'caution',
  PAID: 'success',
  OVERDUE: 'danger',
  VOID: 'neutral',
};

const invoiceStatusLabel: Record<string, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Awaiting payment',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  VOID: 'Void',
};

const paymentStatusTone: Record<string, 'success' | 'caution' | 'danger' | 'neutral'> = {
  PENDING_VERIFICATION: 'caution',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

const paymentStatusLabel: Record<string, string> = {
  PENDING_VERIFICATION: 'Pending verification',
  APPROVED: 'Verified',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

function StoreInvoicesCard({ storeId }: { storeId: string }) {
  const invoicesQ = useQuery({
    queryKey: ['admin', 'stores', storeId, 'invoices'],
    queryFn: () => adminApi.getStoreInvoices(storeId, { limit: 8 }),
  });
  const creditQ = useQuery({
    queryKey: ['admin', 'stores', storeId, 'credit'],
    queryFn: () => adminApi.getStoreCredit(storeId),
  });
  const paymentsQ = useQuery({
    queryKey: ['admin', 'stores', storeId, 'merchant-payments'],
    queryFn: () => adminApi.getStoreMerchantPayments(storeId),
  });
  if (invoicesQ.isLoading || !invoicesQ.data) return null;
  const invoices = invoicesQ.data.items;
  const payments = paymentsQ.data ?? [];

  const exportInvoicesCsv = () => {
    downloadCsv(`commercenest-invoices-${storeId}.csv`, invoices, [
      { header: 'Invoice', value: (i) => i.invoiceNumber },
      { header: 'Issued', value: (i) => i.issueDate },
      { header: 'Due', value: (i) => i.dueDate },
      { header: 'Total', value: (i) => i.totalAmount },
      { header: 'Due amount', value: (i) => i.amountDue },
      { header: 'Status', value: (i) => invoiceStatusLabel[i.status] ?? i.status },
    ]);
  };

  return (
    <Card elevated padding="lg" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Invoices &amp; merchant credit</h3>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-ink-tertiary">Credit balance</p>
            <p className="font-semibold text-ink">{formatBdt(creditQ.data?.balance ?? 0)}</p>
          </div>
          <Button size="sm" variant="secondary" disabled={invoices.length === 0} onClick={exportInvoicesCsv}>
            Export CSV
          </Button>
        </div>
      </div>
      {invoices.length === 0 ? (
        <p className="text-sm text-ink-secondary">No invoices yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-ink-tertiary">
                <th className="pb-2 pr-4 font-medium">Invoice</th>
                <th className="pb-2 pr-4 font-medium">Issued</th>
                <th className="pb-2 pr-4 font-medium">Due</th>
                <th className="pb-2 pr-4 font-medium text-right">Total</th>
                <th className="pb-2 pr-4 font-medium text-right">Due amount</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-line">
                  <td className="py-2 pr-4 font-medium">{inv.invoiceNumber}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDate(inv.issueDate)}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDate(inv.dueDate)}</td>
                  <td className="py-2 pr-4 text-right">{formatBdt(inv.totalAmount)}</td>
                  <td className="py-2 pr-4 text-right font-medium">{formatBdt(inv.amountDue)}</td>
                  <td className="py-2">
                    <Badge tone={invoiceStatusTone[inv.status] ?? 'neutral'}>
                      {invoiceStatusLabel[inv.status] ?? inv.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payments.length > 0 ? (
        <div className="border-t border-line pt-3">
          <p className="mb-2 text-xs font-semibold uppercase text-ink-tertiary">Payment history</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-ink-tertiary">
                  <th className="pb-2 pr-4 font-medium">Submitted</th>
                  <th className="pb-2 pr-4 font-medium">Method</th>
                  <th className="pb-2 pr-4 font-medium text-right">Amount</th>
                  <th className="pb-2 pr-4 font-medium">Reference</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="py-2 pr-4 whitespace-nowrap">{formatDate(p.submittedAt)}</td>
                    <td className="py-2 pr-4">{p.method === 'MANUAL_BKASH' ? 'bKash' : 'Bank transfer'}</td>
                    <td className="py-2 pr-4 text-right">{formatBdt(p.amount)}</td>
                    <td className="py-2 pr-4">{p.referenceId}</td>
                    <td className="py-2">
                      <Badge tone={paymentStatusTone[p.status] ?? 'neutral'}>
                        {paymentStatusLabel[p.status] ?? p.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

const statusTone: Record<string, 'success' | 'caution' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  PENDING_SETUP: 'caution',
  SUSPENDED: 'danger',
  ARCHIVED: 'neutral',
};

function orderStatusTone(status: string): 'success' | 'caution' | 'danger' | 'info' | 'neutral' {
  if (status === 'DELIVERED') return 'success';
  if (status === 'CANCELLED' || status === 'REFUNDED') return 'danger';
  if (status === 'PENDING') return 'caution';
  if (status === 'SHIPPED' || status === 'PROCESSING') return 'info';
  return 'neutral';
}

const riskTone: Record<string, 'success' | 'caution' | 'danger' | 'neutral'> = {
  NONE: 'success',
  CAUTION: 'caution',
  HIGH_RISK: 'danger',
};

/**
 * Drill-down below the store-level aggregates above (usage/billing/
 * invoices) into actual order records — the gap this section closes is
 * that Master Admin previously had no way to see individual orders at all,
 * only revenue/order-count totals. Read-only by design: order status
 * changes stay a Store Admin action (store-dashboard's OrdersPage), this
 * is visibility, not a second place to operate a store's fulfillment.
 */
function StoreOrdersCard({ storeId }: { storeId: string }) {
  const q = useQuery({
    queryKey: ['admin', 'stores', storeId, 'orders'],
    queryFn: () => adminApi.listStoreOrders(storeId, { limit: 10 }),
  });
  if (q.isLoading || !q.data) return null;
  const orders = q.data.items;

  return (
    <Card elevated padding="lg" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Orders</h3>
        <span className="text-xs text-ink-tertiary">{q.data.total} total</span>
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-ink-secondary">No orders yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-ink-tertiary">
                <th className="pb-2 pr-4 font-medium">Order</th>
                <th className="pb-2 pr-4 font-medium">Customer</th>
                <th className="pb-2 pr-4 font-medium">Placed</th>
                <th className="pb-2 pr-4 font-medium text-right">Total</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-line">
                  <td className="py-2 pr-4 font-medium">{o.orderNumber}</td>
                  <td className="py-2 pr-4">{o.customer?.name || o.customer?.phone || '—'}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDate(o.createdAt)}</td>
                  <td className="py-2 pr-4 text-right">{formatBdt(o.total)}</td>
                  <td className="py-2">
                    <Badge tone={orderStatusTone(o.status)}>{o.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.data.total > orders.length ? (
        <p className="text-xs text-ink-tertiary">Showing the {orders.length} most recent orders.</p>
      ) : null}
    </Card>
  );
}

function StoreCustomersCard({ storeId }: { storeId: string }) {
  const q = useQuery({
    queryKey: ['admin', 'stores', storeId, 'customers'],
    queryFn: () => adminApi.listStoreCustomers(storeId, { limit: 10 }),
  });
  if (q.isLoading || !q.data) return null;
  const customers = q.data.items;

  return (
    <Card elevated padding="lg" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Customers</h3>
        <span className="text-xs text-ink-tertiary">{q.data.total} total</span>
      </div>
      {customers.length === 0 ? (
        <p className="text-sm text-ink-secondary">No customers yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-ink-tertiary">
                <th className="pb-2 pr-4 font-medium">Customer</th>
                <th className="pb-2 pr-4 font-medium">Phone</th>
                <th className="pb-2 pr-4 font-medium text-right">Orders</th>
                <th className="pb-2 pr-4 font-medium text-right">Delivered</th>
                <th className="pb-2 font-medium">Risk</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="py-2 pr-4 font-medium">{c.name || '—'}</td>
                  <td className="py-2 pr-4">{c.phone}</td>
                  <td className="py-2 pr-4 text-right">{c.totalOrders}</td>
                  <td className="py-2 pr-4 text-right">{c.deliveredOrders}</td>
                  <td className="py-2">
                    <Badge tone={riskTone[c.riskLevel] ?? 'neutral'}>{c.riskLevel}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.data.total > customers.length ? (
        <p className="text-xs text-ink-tertiary">Showing the {customers.length} most recent customers.</p>
      ) : null}
    </Card>
  );
}

function Field({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">{label}</div>
      <div className="mt-1 text-sm text-ink">{value ?? '—'}</div>
    </div>
  );
}

export function StoreDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ['admin', 'stores', id],
    queryFn: () => adminApi.getStore(id!),
    enabled: !!id,
  });

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) {
    return (
      <ErrorState
        message={q.error instanceof Error ? q.error.message : undefined}
        onRetry={() => void q.refetch()}
      />
    );
  }

  const store = q.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<ArrowLeft className="size-4" />}
          onClick={() => navigate('/stores')}
        >
          Back to stores
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-ink">{store.name}</h2>
            <Badge tone={statusTone[store.status] || 'neutral'}>{store.status}</Badge>
          </div>
          <p className="text-sm text-ink-secondary">/{store.slug}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => navigate(`/themes/${store.id}`)}>
            Edit Theme
          </Button>
        </div>
      </div>

      <Card elevated padding="lg" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Store ID" value={store.id} />
        <Field label="Plan" value={store.planTier || '—'} />
        <Field label="Category" value={store.category || '—'} />
        <Field label="Tagline" value={store.tagline || '—'} />
        <Field label="Created" value={formatDate(store.createdAt)} />
        <Field label="Last updated" value={formatDate(store.updatedAt)} />
        {store.status === 'SUSPENDED' && (
          <>
            <Field label="Suspended at" value={formatDate(store.suspendedAt)} />
            <Field label="Suspension reason" value={store.suspendedReason || '—'} />
          </>
        )}
      </Card>

      <StoreUsageCard storeId={store.id} />
      <StoreBillingCard storeId={store.id} />
      <StoreInvoicesCard storeId={store.id} />
      <StoreOrdersCard storeId={store.id} />
      <StoreCustomersCard storeId={store.id} />

      <Card elevated padding="lg" className="space-y-4">
        <h3 className="text-sm font-semibold text-ink">Owner</h3>
        {store.owner ? (
          <div className="grid gap-6 sm:grid-cols-3">
            <Field label="Name" value={store.owner.name} />
            <Field label="Email" value={store.owner.email} />
            <Field label="Phone" value={store.owner.phone || '—'} />
          </div>
        ) : (
          <p className="text-sm text-ink-secondary">No owner on record.</p>
        )}
      </Card>

      <Card elevated padding="lg" className="space-y-4">
        <h3 className="text-sm font-semibold text-ink">Domains</h3>
        {store.domains && store.domains.length > 0 ? (
          <div className="space-y-2">
            {store.domains.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-cn border border-line px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{d.hostname}</span>
                  {d.isPrimary && <Badge tone="success">Primary</Badge>}
                </div>
                <div className="flex items-center gap-2 text-xs text-ink-tertiary">
                  <span>{d.type || '—'}</span>
                  <span>{d.status || '—'}</span>
                  <span>SSL: {d.sslStatus || '—'}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-secondary">No domains configured.</p>
        )}
      </Card>

      <Card elevated padding="lg" className="space-y-4">
        <h3 className="text-sm font-semibold text-ink">Storefront</h3>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="Draft version"
            value={store.storefront?.draftVersion?.status || 'None'}
          />
          <Field
            label="Published version"
            value={store.storefront?.publishedVersion?.status || 'Not published'}
          />
        </div>
      </Card>
    </div>
  );
}
