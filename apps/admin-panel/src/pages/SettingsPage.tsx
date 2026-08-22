import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, FormField, Input, useToast } from '@commercenest/ui';
import { adminApi, ApiClientError } from '../lib/api';
import { ErrorState, PageSkeleton } from '../components/QueryState';

function settingsMap(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  const obj = data as { items?: Array<{ key: string; value: unknown }> };
  if (Array.isArray(obj.items)) {
    return Object.fromEntries(obj.items.map((i) => [i.key, i.value]));
  }
  return data as Record<string, unknown>;
}

interface PaymentInstructions {
  bkashNumber: string;
  bkashType: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankRoutingNumber: string;
  notes: string;
}

const EMPTY_PAYMENT_INSTRUCTIONS: PaymentInstructions = {
  bkashNumber: '',
  bkashType: 'Merchant/Send Money',
  bankName: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankRoutingNumber: '',
  notes: '',
};

export function SettingsPage() {
  const { toast } = useToast();
  const [supportEmail, setSupportEmail] = useState('');
  const [platformName, setPlatformName] = useState('CommerceNest');
  const [paymentTermDays, setPaymentTermDays] = useState('7');
  const [overdueGraceDays, setOverdueGraceDays] = useState('14');
  const [instructions, setInstructions] = useState<PaymentInstructions>(EMPTY_PAYMENT_INSTRUCTIONS);

  const q = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => adminApi.settings(),
    retry: false,
  });

  useEffect(() => {
    if (!q.data) return;
    const map = settingsMap(q.data);
    if (typeof map.supportEmail === 'string') setSupportEmail(map.supportEmail);
    if (typeof map.platformName === 'string') setPlatformName(map.platformName);
    if (typeof map['billing.invoicePaymentTermDays'] === 'number') {
      setPaymentTermDays(String(map['billing.invoicePaymentTermDays']));
    }
    if (typeof map['billing.overdueGraceDays'] === 'number') {
      setOverdueGraceDays(String(map['billing.overdueGraceDays']));
    }
    if (map['billing.paymentInstructions'] && typeof map['billing.paymentInstructions'] === 'object') {
      setInstructions({ ...EMPTY_PAYMENT_INSTRUCTIONS, ...(map['billing.paymentInstructions'] as Partial<PaymentInstructions>) });
    }
  }, [q.data]);

  const mut = useMutation({
    mutationFn: () =>
      adminApi.updateSettings([
        { key: 'supportEmail', value: supportEmail },
        { key: 'platformName', value: platformName },
      ]),
    onSuccess: () => toast({ title: 'Settings saved', tone: 'success' }),
    onError: (err) =>
      toast({
        title: 'Save failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const billingMut = useMutation({
    mutationFn: () =>
      adminApi.updateSettings([
        { key: 'billing.invoicePaymentTermDays', value: Number(paymentTermDays) },
        { key: 'billing.overdueGraceDays', value: Number(overdueGraceDays) },
        { key: 'billing.paymentInstructions', value: instructions },
      ]),
    onSuccess: () => toast({ title: 'Billing settings saved', tone: 'success' }),
    onError: (err) =>
      toast({
        title: 'Save failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  if (q.isLoading) return <PageSkeleton rows={2} />;
  if (q.isError && !(q.error instanceof ApiClientError && q.error.status === 404)) {
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
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-sm text-ink-secondary">Platform-level configuration</p>
      </div>
      {q.isError && (
        <Alert tone="caution" title="Settings endpoint unavailable">
          Showing local editable fields. Saving requires <code>/api/admin/settings</code>.
        </Alert>
      )}
      <Card elevated className="max-w-xl space-y-4">
        <FormField label="Platform name" htmlFor="platformName">
          <Input
            id="platformName"
            value={platformName}
            onChange={(e) => setPlatformName(e.target.value)}
          />
        </FormField>
        <FormField label="Support email" htmlFor="supportEmail">
          <Input
            id="supportEmail"
            type="email"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
          />
        </FormField>
        <Button loading={mut.isPending} onClick={() => mut.mutate()}>
          Save changes
        </Button>
      </Card>

      <Card elevated className="max-w-xl space-y-4">
        <div>
          <h3 className="font-semibold">Merchant billing</h3>
          <p className="text-sm text-ink-secondary">
            What merchants see when they open "Billing" and choose how to pay their invoice. Without this
            configured, merchants have no way to know where to send a manual payment.
          </p>
        </div>
        <FormField
          label="Invoice payment term (days)"
          htmlFor="paymentTermDays"
          description="How many days after issuance an invoice's due date is set. Already-issued invoices keep their original due date."
        >
          <Input
            id="paymentTermDays"
            type="number"
            min={1}
            max={90}
            value={paymentTermDays}
            onChange={(e) => setPaymentTermDays(e.target.value)}
          />
        </FormField>
        <FormField
          label="Overdue grace period (days)"
          htmlFor="overdueGraceDays"
          description="How many days an invoice may sit OVERDUE before it becomes eligible for suspension review on the Billing page. Informational only today — nothing suspends a store automatically."
        >
          <Input
            id="overdueGraceDays"
            type="number"
            min={1}
            max={180}
            value={overdueGraceDays}
            onChange={(e) => setOverdueGraceDays(e.target.value)}
          />
        </FormField>
        <div className="border-t border-line pt-4">
          <p className="mb-3 text-xs font-semibold uppercase text-ink-tertiary">bKash</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="bKash number" htmlFor="bkashNumber">
              <Input
                id="bkashNumber"
                value={instructions.bkashNumber}
                onChange={(e) => setInstructions((s) => ({ ...s, bkashNumber: e.target.value }))}
              />
            </FormField>
            <FormField label="Account type" htmlFor="bkashType">
              <Input
                id="bkashType"
                value={instructions.bkashType}
                onChange={(e) => setInstructions((s) => ({ ...s, bkashType: e.target.value }))}
              />
            </FormField>
          </div>
        </div>
        <div className="border-t border-line pt-4">
          <p className="mb-3 text-xs font-semibold uppercase text-ink-tertiary">Bank transfer</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Bank name" htmlFor="bankName">
              <Input
                id="bankName"
                value={instructions.bankName}
                onChange={(e) => setInstructions((s) => ({ ...s, bankName: e.target.value }))}
              />
            </FormField>
            <FormField label="Account name" htmlFor="bankAccountName">
              <Input
                id="bankAccountName"
                value={instructions.bankAccountName}
                onChange={(e) => setInstructions((s) => ({ ...s, bankAccountName: e.target.value }))}
              />
            </FormField>
            <FormField label="Account number" htmlFor="bankAccountNumber">
              <Input
                id="bankAccountNumber"
                value={instructions.bankAccountNumber}
                onChange={(e) => setInstructions((s) => ({ ...s, bankAccountNumber: e.target.value }))}
              />
            </FormField>
            <FormField label="Routing number" htmlFor="bankRoutingNumber">
              <Input
                id="bankRoutingNumber"
                value={instructions.bankRoutingNumber}
                onChange={(e) => setInstructions((s) => ({ ...s, bankRoutingNumber: e.target.value }))}
              />
            </FormField>
          </div>
        </div>
        <FormField label="Notes for merchants (optional)" htmlFor="paymentNotes">
          <Input
            id="paymentNotes"
            value={instructions.notes}
            onChange={(e) => setInstructions((s) => ({ ...s, notes: e.target.value }))}
          />
        </FormField>
        <Button loading={billingMut.isPending} onClick={() => billingMut.mutate()}>
          Save billing settings
        </Button>
      </Card>
    </div>
  );
}
