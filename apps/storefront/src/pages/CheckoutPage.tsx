import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import {
  Alert,
  Button,
  Card,
  FormField,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@commercenest/ui';
import { ApiClientError, storefrontApi } from '../lib/api';
import { formatBdt } from '../lib/format';
import { canonicalUrl } from '../lib/seo';
import { useStoreSlug } from '../lib/storeSlug';
import { t } from '../i18n/dictionary';
import { cartTotal, useCartStore } from '../stores/cartStore';
import { useLocaleStore } from '../stores/localeStore';

type Step = 'address' | 'payment' | 'review' | 'bkash';

export function CheckoutPage() {
  const { slug } = useStoreSlug();
  const navigate = useNavigate();
  const locale = useLocaleStore((s) => s.locale);
  const items = useCartStore((s) => s.items);
  const clear = useCartStore((s) => s.clear);
  const [step, setStep] = useState<Step>('address');
  const [error, setError] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [pendingOrderNumber, setPendingOrderNumber] = useState<string | null>(null);
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    label: 'Home',
    line1: '',
    line2: '',
    area: '',
    district: '',
    division: '',
    postalCode: '',
    paymentMethod: 'MANUAL_BKASH' as 'MANUAL_BKASH' | 'CASH_ON_DELIVERY',
    bkashTxnId: '',
    bkashSenderPhone: '',
    customerNote: '',
  });

  const storeQ = useQuery({
    queryKey: ['storefront', slug, 'home'],
    queryFn: () => storefrontApi.home(slug),
  });

  const store = storeQ.data?.store;
  const total = useMemo(() => cartTotal(items), [items]);

  const finish = (orderNumber?: string, orderId?: string) => {
    clear();
    navigate(
      `/order-success?order=${encodeURIComponent(orderNumber || orderId || '')}`,
    );
  };

  const mut = useMutation({
    mutationFn: () => {
      const includeTxn =
        form.paymentMethod === 'MANUAL_BKASH' && !!form.bkashTxnId.trim();
      return storefrontApi.checkout(slug, {
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
        })),
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerEmail: form.customerEmail || undefined,
        preferredLocale: locale,
        deliveryAddress: {
          label: form.label,
          line1: form.line1,
          line2: form.line2 || undefined,
          area: form.area,
          district: form.district,
          division: form.division,
          postalCode: form.postalCode || undefined,
          recipientName: form.customerName,
          recipientPhone: form.customerPhone,
        },
        paymentMethod: form.paymentMethod,
        customerNote: form.customerNote || undefined,
        ...(includeTxn
          ? {
              bkashTxnId: form.bkashTxnId,
              bkashSenderPhone: form.bkashSenderPhone || form.customerPhone,
              bkashAmount: total,
            }
          : {}),
      });
    },
    onSuccess: (res) => {
      const orderId = res.orderId || res.order?.id;
      const orderNumber = res.orderNumber || res.order?.orderNumber || orderId;
      if (!orderId) {
        setError('Checkout succeeded but order id was missing');
        return;
      }
      const includeTxn =
        form.paymentMethod === 'MANUAL_BKASH' && !!form.bkashTxnId.trim();
      if (form.paymentMethod === 'MANUAL_BKASH' && !includeTxn) {
        setPendingOrderId(orderId);
        setPendingOrderNumber(orderNumber || orderId);
        setStep('bkash');
        return;
      }
      finish(orderNumber, orderId);
    },
    onError: (err) => {
      setError(err instanceof ApiClientError ? err.message : 'Checkout failed');
    },
  });

  const bkashMut = useMutation({
    mutationFn: () =>
      storefrontApi.submitBkashPayment(slug, {
        orderId: pendingOrderId,
        bkashTxnId: form.bkashTxnId,
        bkashSenderPhone: form.bkashSenderPhone || form.customerPhone,
        bkashAmount: total,
      }),
    onSuccess: () => finish(pendingOrderNumber || undefined, pendingOrderId || undefined),
    onError: (err) => {
      setError(err instanceof ApiClientError ? err.message : 'bKash submit failed');
    },
  });

  const pageTitle = `${t(locale, 'checkout')} — ${store?.name || 'Store'}`;
  const helmet = (
    <Helmet>
      <title>{pageTitle}</title>
      <link rel="canonical" href={canonicalUrl()} />
      <meta name="robots" content="noindex, follow" />
    </Helmet>
  );

  if (items.length === 0 && step !== 'bkash') {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        {helmet}
        <Alert tone="caution" title="Cart is empty">
          Add products before checkout.
        </Alert>
      </div>
    );
  }

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      {helmet}
      <h1 className="text-2xl font-semibold">{t(locale, 'checkout')}</h1>
      {step !== 'bkash' && (
        <div className="flex gap-2 text-sm">
          {(['address', 'payment', 'review'] as Step[]).map((s, idx) => (
            <button
              key={s}
              type="button"
              className={`rounded-full px-3 py-1 ${step === s ? 'bg-[var(--store-primary)] text-white' : 'bg-white text-ink-secondary'}`}
              onClick={() => setStep(s)}
            >
              {idx + 1}. {s}
            </button>
          ))}
        </div>
      )}
      {error && (
        <Alert tone="danger" title="Checkout error">
          {error}
        </Alert>
      )}

      {step === 'address' && (
        <Card elevated className="space-y-3">
          {(
            [
              ['customerName', 'Full name'],
              ['customerPhone', 'Phone'],
              ['customerEmail', 'Email (optional)'],
              ['line1', 'Address line 1'],
              ['line2', 'Address line 2'],
              ['area', 'Area'],
              ['district', 'District'],
              ['division', 'Division'],
              ['postalCode', 'Postal code'],
            ] as const
          ).map(([key, label]) => (
            <FormField key={key} label={label} htmlFor={key}>
              <Input id={key} value={form[key]} onChange={(e) => set(key, e.target.value)} />
            </FormField>
          ))}
          <Button onClick={() => setStep('payment')}>Continue</Button>
        </Card>
      )}

      {step === 'payment' && (
        <Card elevated className="space-y-4">
          <Tabs
            value={form.paymentMethod}
            onValueChange={(v) => set('paymentMethod', v)}
          >
            <TabsList>
              <TabsTrigger value="MANUAL_BKASH">bKash</TabsTrigger>
              <TabsTrigger value="CASH_ON_DELIVERY">COD</TabsTrigger>
            </TabsList>
            <TabsContent value="MANUAL_BKASH" className="space-y-3 pt-4">
              <Alert tone="info" title="Manual bKash instructions">
                Send {formatBdt(total)} to{' '}
                <strong>{store?.bkashNumber || 'the store bKash number'}</strong>
                {store?.bkashInstructions ? (
                  <p className="mt-2 whitespace-pre-wrap">{store.bkashInstructions}</p>
                ) : null}
              </Alert>
              <FormField label="Transaction ID (optional now)" htmlFor="bkashTxnId">
                <Input
                  id="bkashTxnId"
                  value={form.bkashTxnId}
                  onChange={(e) => set('bkashTxnId', e.target.value)}
                />
              </FormField>
              <FormField label="Sender phone" htmlFor="bkashSenderPhone">
                <Input
                  id="bkashSenderPhone"
                  value={form.bkashSenderPhone}
                  onChange={(e) => set('bkashSenderPhone', e.target.value)}
                />
              </FormField>
              <p className="text-xs text-ink-secondary">
                You can place the order now and submit the bKash txn afterward if needed.
              </p>
            </TabsContent>
            <TabsContent value="CASH_ON_DELIVERY" className="pt-4">
              <Alert tone="caution" title="Cash on delivery">
                Pay in cash when your order arrives. High-risk customers may require a confirmation call.
              </Alert>
            </TabsContent>
          </Tabs>
          <Button onClick={() => setStep('review')}>Continue</Button>
        </Card>
      )}

      {step === 'review' && (
        <Card elevated className="space-y-4">
          <div className="space-y-2 text-sm">
            {items.map((i) => (
              <div key={i.variantId} className="flex justify-between">
                <span>
                  {i.name} x {i.quantity}
                </span>
                <span>{formatBdt(i.unitPrice * i.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between border-t border-line pt-3 font-semibold">
            <span>Total</span>
            <span>{formatBdt(total)}</span>
          </div>
          <div className="text-sm text-ink-secondary">
            {form.paymentMethod === 'MANUAL_BKASH'
              ? form.bkashTxnId
                ? `bKash txn ${form.bkashTxnId}`
                : 'bKash payment details can be submitted after placing the order'
              : 'Cash on delivery'}
          </div>
          <Button
            className="w-full"
            size="lg"
            loading={mut.isPending}
            onClick={() => {
              setError(null);
              mut.mutate();
            }}
          >
            {t(locale, 'placeOrder')}
          </Button>
        </Card>
      )}

      {step === 'bkash' && (
        <Card elevated className="space-y-4">
          <Alert tone="info" title="Submit bKash payment">
            Order {pendingOrderNumber} was placed. Send {formatBdt(total)} to{' '}
            <strong>{store?.bkashNumber || 'the store bKash number'}</strong> and enter the
            transaction details below.
          </Alert>
          <FormField label="Transaction ID" htmlFor="bkashTxnId-late" required>
            <Input
              id="bkashTxnId-late"
              value={form.bkashTxnId}
              onChange={(e) => set('bkashTxnId', e.target.value)}
            />
          </FormField>
          <FormField label="Sender phone" htmlFor="bkashSenderPhone-late" required>
            <Input
              id="bkashSenderPhone-late"
              value={form.bkashSenderPhone || form.customerPhone}
              onChange={(e) => set('bkashSenderPhone', e.target.value)}
            />
          </FormField>
          <Button
            className="w-full"
            loading={bkashMut.isPending}
            onClick={() => {
              setError(null);
              bkashMut.mutate();
            }}
          >
            Submit bKash payment
          </Button>
        </Card>
      )}
    </div>
  );
}
