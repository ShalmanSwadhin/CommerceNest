import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, DataTable, FormField, Input, Modal, useToast } from '@commercenest/ui';
import {
  ApiClientError,
  storeApi,
  type Invoice,
  type InvoiceStatus,
  type MerchantPaymentMethod,
} from '../lib/api';
import { formatBdt, formatDate } from '../lib/format';
import { ErrorState, PageSkeleton } from '../components/QueryState';
import { useStoreId } from '../stores/authStore';

const INVOICE_STATUS_TONE: Record<InvoiceStatus, 'caution' | 'success' | 'danger' | 'neutral'> = {
  DRAFT: 'neutral',
  ISSUED: 'caution',
  PARTIALLY_PAID: 'caution',
  PAID: 'success',
  OVERDUE: 'danger',
  VOID: 'neutral',
};

// Internal status names are technical; merchants shouldn't have to decode
// enum casing. Kept as plain lookups (not computed from the raw string) so
// the wording can be tuned independently of the backend's status names.
const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Awaiting payment',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  VOID: 'Void',
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING_VERIFICATION: 'Submitted — waiting for verification',
  APPROVED: 'Verified',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  MANUAL_BKASH: 'bKash',
  MANUAL_BANK_TRANSFER: 'Bank transfer',
};

function InvoiceBreakdown({ invoice }: { invoice: Invoice }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-ink-tertiary">Subscription</p>
          <p className="font-medium text-ink">{formatBdt(invoice.subscriptionAmount)}</p>
        </div>
        <div>
          <p className="text-ink-tertiary">
            Platform fee{invoice.platformFeeRate !== null ? ` (${(invoice.platformFeeRate * 100).toFixed(2)}%)` : ''}
          </p>
          <p className="font-medium text-ink">{formatBdt(invoice.platformFeeAmount)}</p>
        </div>
        <div>
          <p className="text-ink-tertiary">Adjustments</p>
          <p className="font-medium text-ink">{formatBdt(invoice.adjustmentAmount)}</p>
        </div>
        <div>
          <p className="text-ink-tertiary">Total</p>
          <p className="font-medium text-ink">{formatBdt(invoice.totalAmount)}</p>
        </div>
        <div>
          <p className="text-ink-tertiary">Credit applied</p>
          <p className="font-medium text-ink">{formatBdt(invoice.creditApplied)}</p>
        </div>
        <div>
          <p className="text-ink-tertiary">Paid</p>
          <p className="font-medium text-ink">{formatBdt(invoice.amountPaid)}</p>
        </div>
        <div>
          <p className="text-ink-tertiary">Amount due</p>
          <p className="font-semibold text-ink">{formatBdt(invoice.amountDue)}</p>
        </div>
        <div>
          <p className="text-ink-tertiary">Due date</p>
          <p className="font-medium text-ink">{formatDate(invoice.dueDate)}</p>
        </div>
      </div>
      {invoice.platformFeeRate !== null && invoice.platformFeeRate > 0 ? (
        <p className="text-xs text-ink-tertiary">
          Platform fee is {(invoice.platformFeeRate * 100).toFixed(2)}% of eligible sales
          {invoice.eligibleGmv !== null ? ` (${formatBdt(invoice.eligibleGmv)} this period)` : ''} — delivered
          orders' subtotal minus any discount, excluding delivery charges.
        </p>
      ) : null}
    </div>
  );
}

export function BillingPage() {
  const storeId = useStoreId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);
  const [method, setMethod] = useState<MerchantPaymentMethod>('MANUAL_BKASH');
  const [amount, setAmount] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);

  const currentQ = useQuery({
    queryKey: ['store', storeId, 'invoices', 'current'],
    queryFn: () => storeApi.getCurrentInvoice(storeId!),
    enabled: !!storeId,
  });
  const creditQ = useQuery({
    queryKey: ['store', storeId, 'credit'],
    queryFn: () => storeApi.getCreditBalance(storeId!),
    enabled: !!storeId,
  });
  const historyQ = useQuery({
    queryKey: ['store', storeId, 'invoices', 'history'],
    queryFn: () => storeApi.getInvoices(storeId!, { limit: 50 }),
    enabled: !!storeId,
  });
  const paymentsQ = useQuery({
    queryKey: ['store', storeId, 'payments', 'mine'],
    queryFn: () => storeApi.listMyPayments(storeId!),
    enabled: !!storeId,
  });
  const instructionsQ = useQuery({
    queryKey: ['store', storeId, 'payment-instructions'],
    queryFn: () => storeApi.getPaymentInstructions(storeId!),
    enabled: !!storeId && !!payTarget,
  });
  const detailQ = useQuery({
    queryKey: ['store', storeId, 'invoices', 'detail', detailInvoice?.id],
    queryFn: () => storeApi.getInvoiceDetail(storeId!, detailInvoice!.id),
    enabled: !!storeId && !!detailInvoice,
  });

  const current = currentQ.data ?? null;
  const history = useMemo(() => historyQ.data?.items ?? [], [historyQ.data]);
  const myPayments = useMemo(() => paymentsQ.data ?? [], [paymentsQ.data]);
  const pendingForCurrent = useMemo(
    () => myPayments.find((p) => p.invoiceId === current?.id && p.status === 'PENDING_VERIFICATION'),
    [myPayments, current],
  );
  // The merchant's most recent claim against the current invoice, whatever
  // its status — used to surface a rejection reason proactively on this
  // card instead of leaving it only discoverable inside "View" history.
  const latestForCurrent = useMemo(() => {
    const forInvoice = myPayments.filter((p) => p.invoiceId === current?.id);
    if (forInvoice.length === 0) return undefined;
    return forInvoice.reduce((latest, p) =>
      new Date(p.submittedAt).getTime() > new Date(latest.submittedAt).getTime() ? p : latest,
    );
  }, [myPayments, current]);
  const rejectedForCurrent =
    latestForCurrent?.status === 'REJECTED' && latestForCurrent.id !== pendingForCurrent?.id
      ? latestForCurrent
      : undefined;

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ['store', storeId, 'invoices'] });
    void qc.invalidateQueries({ queryKey: ['store', storeId, 'payments'] });
    void qc.invalidateQueries({ queryKey: ['store', storeId, 'credit'] });
  };

  const submitMut = useMutation({
    mutationFn: () =>
      storeApi.submitPaymentClaim(storeId!, {
        invoiceId: payTarget!.id,
        method,
        amount: Number(amount),
        referenceId: referenceId.trim(),
        transferDate: new Date(transferDate).toISOString(),
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ title: 'Payment claim submitted', description: 'Awaiting Master Admin verification.', tone: 'success' });
      setPayTarget(null);
      setAmount('');
      setReferenceId('');
      setNote('');
      invalidateAll();
    },
    onError: (err) =>
      toast({
        title: 'Could not submit claim',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const cancelMut = useMutation({
    mutationFn: (paymentId: string) => storeApi.cancelPaymentClaim(storeId!, paymentId),
    onSuccess: () => {
      toast({ title: 'Claim cancelled', tone: 'caution' });
      invalidateAll();
    },
    onError: (err) =>
      toast({
        title: 'Could not cancel',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  if (!storeId) return <ErrorState message="Missing store context." />;
  if (currentQ.isLoading) return <PageSkeleton />;
  if (currentQ.isError) {
    return (
      <ErrorState
        message={currentQ.error instanceof Error ? currentQ.error.message : undefined}
        onRetry={() => void currentQ.refetch()}
      />
    );
  }

  const instructions = instructionsQ.data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Billing</h2>
        <p className="text-sm text-ink-secondary">
          Your subscription &amp; platform-fee invoices, and manual bKash / bank transfer payments to CommerceNest.
        </p>
      </div>

      <Card elevated className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Current invoice</h3>
          {current ? (
            <Badge tone={INVOICE_STATUS_TONE[current.status]}>{INVOICE_STATUS_LABEL[current.status]}</Badge>
          ) : null}
        </div>

        {!current ? (
          <p className="text-sm text-ink-secondary">No invoice has been issued yet.</p>
        ) : (
          <>
            <p className="text-xs text-ink-tertiary">
              {current.invoiceNumber} · issued {formatDate(current.issueDate)}
            </p>
            <InvoiceBreakdown invoice={current} />

            {current.status === 'OVERDUE' ? (
              <div className="rounded-cn border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-800">
                  This invoice is overdue — {formatBdt(current.amountDue)} was due {formatDate(current.dueDate)}.
                </p>
                <p className="mt-1 text-xs text-red-700">
                  Please submit payment as soon as possible to keep your account in good standing.
                </p>
              </div>
            ) : null}

            {rejectedForCurrent ? (
              <div className="rounded-cn border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-800">Your last payment claim was rejected</p>
                <p className="mt-1 text-xs text-red-700">
                  Reason: {rejectedForCurrent.rejectionReason || 'No reason was provided.'}
                </p>
                <p className="mt-1 text-xs text-red-700">
                  You can submit a corrected claim below with the right details.
                </p>
              </div>
            ) : null}

            {pendingForCurrent ? (
              <div className="flex items-center justify-between rounded-cn border border-amber-200 bg-amber-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    {PAYMENT_STATUS_LABEL.PENDING_VERIFICATION}
                  </p>
                  <p className="text-xs text-amber-700">
                    {formatBdt(pendingForCurrent.amount)} via {PAYMENT_METHOD_LABEL[pendingForCurrent.method]} ·
                    ref {pendingForCurrent.referenceId}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={cancelMut.isPending}
                  onClick={() => cancelMut.mutate(pendingForCurrent.id)}
                >
                  Cancel claim
                </Button>
              </div>
            ) : current.status !== 'PAID' && current.status !== 'VOID' && current.amountDue > 0 ? (
              <Button
                onClick={() => {
                  setPayTarget(current);
                  setAmount(String(current.amountDue));
                  setMethod('MANUAL_BKASH');
                  setReferenceId('');
                  setNote('');
                }}
              >
                {rejectedForCurrent ? 'Submit corrected payment' : 'Pay now'}
              </Button>
            ) : null}
          </>
        )}
      </Card>

      <Card elevated className="space-y-2">
        <h3 className="font-semibold">Merchant credit</h3>
        <p className="text-2xl font-semibold text-ink">{formatBdt(creditQ.data?.balance ?? 0)}</p>
        <p className="text-xs text-ink-tertiary">
          Applied automatically to your next invoice — overpayments and post-payment refund adjustments are never
          refunded in cash, only credited forward.
        </p>
      </Card>

      <Card elevated padding="none">
        <div className="border-b border-line px-5 py-4">
          <h3 className="font-semibold">Billing history</h3>
        </div>
        <DataTable
          data={history}
          getRowKey={(r) => r.id}
          state={history.length ? 'ready' : 'empty'}
          emptyTitle="No invoices yet"
          emptyDescription="Invoices are generated automatically at the end of each billing period."
          columns={[
            { key: 'number', header: 'Invoice', cell: (r) => r.invoiceNumber },
            { key: 'issued', header: 'Issued', cell: (r) => formatDate(r.issueDate) },
            { key: 'due', header: 'Due', cell: (r) => formatDate(r.dueDate) },
            { key: 'total', header: 'Total', cell: (r) => formatBdt(r.totalAmount) },
            { key: 'paid', header: 'Paid', cell: (r) => formatBdt(r.amountPaid + r.creditApplied) },
            { key: 'dueAmt', header: 'Due', cell: (r) => formatBdt(r.amountDue) },
            {
              key: 'status',
              header: 'Status',
              cell: (r) => <Badge tone={INVOICE_STATUS_TONE[r.status]}>{INVOICE_STATUS_LABEL[r.status]}</Badge>,
            },
            {
              key: 'actions',
              header: '',
              cell: (r) => (
                <Button size="sm" variant="secondary" onClick={() => setDetailInvoice(r)}>
                  View details
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        title="Pay by bKash / bank transfer"
        description="Submitting this does not mark the invoice paid — CommerceNest verifies every manual payment before it's applied."
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayTarget(null)}>
              Cancel
            </Button>
            <Button
              loading={submitMut.isPending}
              disabled={!(Number(amount) > 0) || !referenceId.trim() || !transferDate}
              onClick={() => submitMut.mutate()}
            >
              Submit Payment for Verification
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Payment method" htmlFor="pay-method" required>
            <select
              id="pay-method"
              className="h-10 w-full rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value as MerchantPaymentMethod)}
            >
              <option value="MANUAL_BKASH">bKash</option>
              <option value="MANUAL_BANK_TRANSFER">Bank transfer</option>
            </select>
          </FormField>

          {instructions ? (
            <div className="rounded-cn border border-line bg-surface-raised p-3 text-xs text-ink-secondary">
              {method === 'MANUAL_BKASH' ? (
                instructions.bkashNumber ? (
                  <>
                    <p className="font-medium text-ink">Send to bKash {instructions.bkashType}</p>
                    <p className="mt-1">{instructions.bkashNumber}</p>
                  </>
                ) : (
                  <p className="font-medium text-amber-700">
                    bKash payment instructions haven't been configured yet — contact CommerceNest support before
                    sending a payment.
                  </p>
                )
              ) : instructions.bankAccountNumber ? (
                <>
                  <p className="font-medium text-ink">{instructions.bankName || 'Bank transfer details'}</p>
                  <p className="mt-1">Account name: {instructions.bankAccountName || '—'}</p>
                  <p>Account number: {instructions.bankAccountNumber}</p>
                  <p>Routing number: {instructions.bankRoutingNumber || '—'}</p>
                </>
              ) : (
                <p className="font-medium text-amber-700">
                  Bank transfer instructions haven't been configured yet — contact CommerceNest support before
                  sending a payment.
                </p>
              )}
              {instructions.notes ? <p className="mt-2">{instructions.notes}</p> : null}
            </div>
          ) : null}

          <FormField label="Amount (BDT)" htmlFor="pay-amount" required>
            <Input id="pay-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {payTarget && Number(amount) > payTarget.amountDue ? (
              <p className="mt-1 text-xs text-ink-tertiary">
                This is more than the {formatBdt(payTarget.amountDue)} due — the extra amount will be added to your
                account credit once verified.
              </p>
            ) : null}
          </FormField>
          <FormField label="Transaction / reference ID" htmlFor="pay-ref" required>
            <Input id="pay-ref" value={referenceId} onChange={(e) => setReferenceId(e.target.value)} />
          </FormField>
          <FormField label="Payment date" htmlFor="pay-date" required>
            <Input id="pay-date" type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
          </FormField>
          <FormField label="Note (optional)" htmlFor="pay-note">
            <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={!!detailInvoice}
        onClose={() => setDetailInvoice(null)}
        title={detailInvoice ? `Invoice ${detailInvoice.invoiceNumber}` : ''}
      >
        {detailQ.data ? (
          <div className="space-y-4">
            <InvoiceBreakdown invoice={detailQ.data.invoice} />
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-ink-tertiary">Payment claims</p>
              {detailQ.data.payments.length === 0 ? (
                <p className="text-sm text-ink-secondary">No payment claims submitted for this invoice.</p>
              ) : (
                <div className="space-y-2">
                  {detailQ.data.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-cn border border-line px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-ink">
                          {formatBdt(p.amount)} · {PAYMENT_METHOD_LABEL[p.method]}
                        </p>
                        <p className="text-xs text-ink-tertiary">ref {p.referenceId} · {formatDate(p.submittedAt)}</p>
                        {p.status === 'REJECTED' ? (
                          <p className="text-xs text-red-600">
                            Reason: {p.rejectionReason || 'No reason was provided.'}
                          </p>
                        ) : null}
                      </div>
                      <Badge tone={p.status === 'APPROVED' ? 'success' : p.status === 'REJECTED' ? 'danger' : 'caution'}>
                        {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-secondary">Loading…</p>
        )}
      </Modal>
    </div>
  );
}
