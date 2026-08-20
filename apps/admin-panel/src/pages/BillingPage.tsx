import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, FormField, Input, Modal, useToast } from '@commercenest/ui';
import { ApiClientError, adminApi, type InvoiceStatus, type MerchantPayment } from '../lib/api';
import { formatDate } from '../lib/format';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';

function formatBdt(amount: number) {
  return `৳${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

const statusTone: Record<string, 'success' | 'caution' | 'neutral'> = {
  OPEN: 'caution',
  CLOSED: 'neutral',
};

const invoiceStatusTone: Record<InvoiceStatus, 'success' | 'caution' | 'danger' | 'neutral'> = {
  DRAFT: 'neutral',
  ISSUED: 'caution',
  PARTIALLY_PAID: 'caution',
  PAID: 'success',
  OVERDUE: 'danger',
  VOID: 'neutral',
};

const invoiceStatusLabel: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Awaiting payment',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  VOID: 'Void',
};

function SummaryStats() {
  const q = useQuery({ queryKey: ['admin', 'billing', 'summary'], queryFn: () => adminApi.getBillingSummary() });
  if (q.isLoading || !q.data) return null;
  const s = q.data;
  const cards: Array<{ label: string; value: string }> = [
    { label: 'Total invoiced', value: formatBdt(s.totalInvoiced) },
    { label: 'Total collected', value: formatBdt(s.totalCollected) },
    { label: 'Total outstanding', value: formatBdt(s.totalOutstanding) },
    { label: 'Merchant credit outstanding', value: formatBdt(s.totalMerchantCredit) },
    { label: 'Pending payment claims', value: String(s.pendingPaymentClaims) },
    { label: 'Overdue invoices', value: String(s.overdueInvoices) },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label} elevated padding="md">
          <p className="text-xs font-semibold uppercase text-ink-tertiary">{c.label}</p>
          <p className="mt-1 text-2xl font-bold text-ink">{c.value}</p>
        </Card>
      ))}
    </div>
  );
}

function PendingPaymentsQueue() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<MerchantPayment | null>(null);
  const [reason, setReason] = useState('');

  const q = useQuery({
    queryKey: ['admin', 'payments', 'pending'],
    queryFn: () => adminApi.listPendingPayments({ limit: 50 }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'payments'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'billing', 'summary'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'billing'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'invoices'] });
  };

  const approveMut = useMutation({
    mutationFn: (paymentId: string) => adminApi.approveMerchantPayment(paymentId),
    onSuccess: () => {
      toast({ title: 'Payment approved', tone: 'success' });
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
    mutationFn: () => adminApi.rejectMerchantPayment(rejectTarget!.id, reason.trim()),
    onSuccess: () => {
      toast({ title: 'Payment rejected', tone: 'caution' });
      setRejectTarget(null);
      setReason('');
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Reject failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  if (q.isLoading) return <PageSkeleton rows={2} />;
  if (q.isError) {
    return (
      <ErrorState
        message={q.error instanceof Error ? q.error.message : undefined}
        onRetry={() => void q.refetch()}
      />
    );
  }

  const items = q.data?.items ?? [];

  return (
    <Card elevated padding="none">
      <div className="border-b border-line px-5 py-4">
        <h3 className="font-semibold">Pending payment claims</h3>
        <p className="text-xs text-ink-secondary">
          Manual bKash / bank transfer claims awaiting verification. Approving books the payment and updates the
          invoice; rejecting never touches the invoice balance and always requires a reason.
        </p>
      </div>
      {items.length === 0 ? (
        <div className="p-5">
          <SoftEmpty title="Queue is clear" description="No merchant payments are waiting for verification." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-tertiary">
                <th className="px-4 py-3 font-medium">Store</th>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Note</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.store?.name ?? '—'}</div>
                    <div className="text-xs text-ink-tertiary">{p.store?.slug}</div>
                  </td>
                  <td className="px-4 py-3">{p.invoice?.invoiceNumber ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatBdt(p.amount)}</td>
                  <td className="px-4 py-3">{p.method === 'MANUAL_BKASH' ? 'bKash' : 'Bank transfer'}</td>
                  <td className="px-4 py-3">{p.referenceId}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(p.submittedAt)}</td>
                  <td className="px-4 py-3 text-xs text-ink-tertiary">{p.note || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" loading={approveMut.isPending} onClick={() => approveMut.mutate(p.id)}>
                        Verify
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setRejectTarget(p)}>
                        Reject
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject payment claim"
        description="The claim is kept as an audit record — it is never deleted."
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
        <FormField label="Rejection reason" htmlFor="payment-reject-reason" required>
          <Input id="payment-reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </Modal>
    </Card>
  );
}

function InvoicesTable() {
  const [statusFilter, setStatusFilter] = useState('');
  const q = useQuery({
    queryKey: ['admin', 'invoices', statusFilter],
    queryFn: () => adminApi.listAllInvoices({ limit: 50, status: statusFilter || undefined }),
  });

  const items = q.data?.items ?? [];

  return (
    <Card elevated padding="none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h3 className="font-semibold">Invoices</h3>
        <select
          className="h-9 rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-xs"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="ISSUED">Issued</option>
          <option value="PARTIALLY_PAID">Partially paid</option>
          <option value="PAID">Paid</option>
          <option value="OVERDUE">Overdue</option>
          <option value="VOID">Void</option>
        </select>
      </div>
      {q.isLoading ? (
        <div className="p-5">
          <PageSkeleton rows={2} />
        </div>
      ) : items.length === 0 ? (
        <div className="p-5">
          <SoftEmpty title="No invoices yet" description="Invoices are generated automatically when a billing period closes." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-tertiary">
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Store</th>
                <th className="px-4 py-3 font-medium">Issued</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">Due amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((inv) => (
                <tr key={inv.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3">
                    <div>{inv.store?.name ?? '—'}</div>
                    <div className="text-xs text-ink-tertiary">{inv.store?.slug}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(inv.issueDate)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(inv.dueDate)}</td>
                  <td className="px-4 py-3 text-right">{formatBdt(inv.totalAmount)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatBdt(inv.amountDue)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={invoiceStatusTone[inv.status]}>{invoiceStatusLabel[inv.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/**
 * Platform-wide billing — subscription charges + platform fees across every
 * store, one row per store per billing period; plus invoices generated from
 * those periods and the manual payment-verification queue. Per-store detail
 * lives on the Store Detail page; this is the cross-store rollup.
 */
export function BillingPage() {
  const [storeFilter, setStoreFilter] = useState('');

  const q = useQuery({
    queryKey: ['admin', 'billing', storeFilter],
    queryFn: () => adminApi.listAllBilling({ limit: 50, storeId: storeFilter || undefined }),
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

  const periods = q.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Billing</h2>
        <p className="text-sm text-ink-secondary">
          Subscription charges, platform fees, invoices, and manual payment verification across every store.
        </p>
      </div>

      <SummaryStats />

      <PendingPaymentsQueue />

      <InvoicesTable />

      <Card elevated padding="md" className="flex items-center gap-3">
        <input
          className="h-10 flex-1 rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-sm"
          placeholder="Filter periods by store ID…"
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
        />
      </Card>

      {periods.length === 0 ? (
        <Card elevated>
          <SoftEmpty title="No billing periods yet" description="Periods are opened automatically the first time a store's usage or billing is viewed." />
        </Card>
      ) : (
        <Card elevated padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-tertiary">
                  <th className="px-4 py-3 font-medium">Store</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 text-right font-medium">Subscription</th>
                  <th className="px-4 py-3 text-right font-medium">Eligible GMV</th>
                  <th className="px-4 py-3 text-right font-medium">Platform fee</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.store?.name ?? '—'}</div>
                      <div className="text-xs text-ink-tertiary">{p.store?.slug}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(p.periodStart)}</td>
                    <td className="px-4 py-3">{p.planName}</td>
                    <td className="px-4 py-3 text-right">{formatBdt(p.subscriptionPrice)}</td>
                    <td className="px-4 py-3 text-right">{formatBdt(p.eligibleGmv)}</td>
                    <td className="px-4 py-3 text-right">{formatBdt(p.platformFeeAmount)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatBdt(p.totalDue)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone[p.status] ?? 'neutral'}>{p.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
