import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { BANGLADESH_PHONE_REGEX } from '@commercenest/types';
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
import { describeApiError, storefrontApi } from '../lib/api';
import { formatBdt } from '../lib/format';
import { canonicalUrl } from '../lib/seo';
import { useStoreSlug } from '../lib/storeSlug';
import { t } from '../i18n/dictionary';
import { cartTotal, useCartStore } from '../stores/cartStore';
import { useLocaleStore } from '../stores/localeStore';
import { useAuthStore } from '../stores/authStore';

type Step = 'address' | 'payment' | 'review' | 'bkash';

/** Accepts common real-world formats (+880, 880, spaces, dashes) and
 * normalizes to the local 01XXXXXXXXX form the API's BANGLADESH_PHONE_REGEX
 * expects — so a customer isn't rejected at the very last step for typing
 * their number the way they normally would. */
function normalizeBdPhone(raw: string): string {
  let digits = raw.trim().replace(/[\s-]/g, '');
  if (digits.startsWith('+880')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('880')) digits = `0${digits.slice(3)}`;
  return digits;
}

export function CheckoutPage() {
  const { slug } = useStoreSlug();
  const navigate = useNavigate();
  const locale = useLocaleStore((s) => s.locale);
  const customer = useAuthStore((s) => s.customer);
  const items = useCartStore((s) => s.items);
  const clear = useCartStore((s) => s.clear);
  const [step, setStep] = useState<Step>('address');
  const [error, setError] = useState<string | null>(null);
  const [addressErrors, setAddressErrors] = useState<string[]>([]);
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
    // Cash on Delivery is how most Bangladeshi customers actually check
    // out — default to it and let bKash be an opt-in choice, not the other
    // way around.
    paymentMethod: 'CASH_ON_DELIVERY' as 'MANUAL_BKASH' | 'CASH_ON_DELIVERY',
    bkashTxnId: '',
    bkashSenderPhone: '',
    customerNote: '',
    couponCode: '',
  });

  // Prefills from the signed-in account, never overwriting what the
  // shopper has already typed — the actual order->account link no longer
  // depends on this phone matching (checkout resolves a signed-in
  // customer by their session, not by this field), but a mismatched phone
  // here was the original trigger for the bug, so prefilling it too is
  // one less place to get out of sync.
  useEffect(() => {
    if (!customer) return;
    setForm((f) => ({
      ...f,
      customerName: f.customerName || customer.name || '',
      customerPhone: f.customerPhone || customer.phone || '',
      customerEmail: f.customerEmail || customer.email || '',
    }));
  }, [customer]);

  const storeQ = useQuery({
    queryKey: ['storefront', slug, 'home'],
    queryFn: () => storefrontApi.home(slug),
  });

  const store = storeQ.data?.store;
  const total = useMemo(() => cartTotal(items), [items]);

  const finish = (
    orderNumber?: string,
    orderId?: string,
    breakdown?: { subtotal?: number; deliveryCharge?: number; discountAmount?: number; total?: number },
  ) => {
    clear();
    const params = new URLSearchParams({ order: orderNumber || orderId || '' });
    if (breakdown) {
      if (breakdown.subtotal !== undefined) params.set('subtotal', String(breakdown.subtotal));
      if (breakdown.deliveryCharge !== undefined)
        params.set('delivery', String(breakdown.deliveryCharge));
      if (breakdown.discountAmount !== undefined)
        params.set('discount', String(breakdown.discountAmount));
      if (breakdown.total !== undefined) params.set('total', String(breakdown.total));
    }
    navigate(`/order-success?${params.toString()}`);
  };

  const mut = useMutation({
    mutationFn: () => {
      const includeTxn =
        form.paymentMethod === 'MANUAL_BKASH' && !!form.bkashTxnId.trim();
      const phone = normalizeBdPhone(form.customerPhone);
      return storefrontApi.checkout(slug, {
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
        })),
        customerName: form.customerName,
        customerPhone: phone,
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
          recipientPhone: phone,
        },
        paymentMethod: form.paymentMethod,
        customerNote: form.customerNote || undefined,
        couponCode: form.couponCode.trim() || undefined,
        ...(includeTxn
          ? {
              bkashTxnId: form.bkashTxnId,
              bkashSenderPhone: normalizeBdPhone(form.bkashSenderPhone || form.customerPhone),
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
      finish(orderNumber, orderId, {
        subtotal: res.subtotal !== undefined ? Number(res.subtotal) : undefined,
        deliveryCharge:
          res.deliveryCharge !== undefined ? Number(res.deliveryCharge) : undefined,
        discountAmount:
          res.discountAmount !== undefined ? Number(res.discountAmount) : undefined,
        total: res.total !== undefined ? Number(res.total) : undefined,
      });
    },
    onError: (err) => {
      setError(describeApiError(err));
    },
  });

  const bkashMut = useMutation({
    mutationFn: () =>
      storefrontApi.submitBkashPayment(slug, {
        orderId: pendingOrderId,
        bkashTxnId: form.bkashTxnId,
        bkashSenderPhone: normalizeBdPhone(form.bkashSenderPhone || form.customerPhone),
        bkashAmount: total,
      }),
    onSuccess: () => finish(pendingOrderNumber || undefined, pendingOrderId || undefined),
    onError: (err) => {
      setError(describeApiError(err));
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

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (addressErrors.length) setAddressErrors([]);
  };

  const validateAddress = (): string[] => {
    const errs: string[] = [];
    if (!form.customerName.trim()) errs.push('Full name is required.');
    if (!BANGLADESH_PHONE_REGEX.test(normalizeBdPhone(form.customerPhone))) {
      errs.push('Enter a valid Bangladesh mobile number (e.g. 01712345678).');
    }
    if (!form.line1.trim()) errs.push('Address line 1 is required.');
    if (!form.area.trim()) errs.push('Area is required.');
    if (!form.district.trim()) errs.push('District is required.');
    if (!form.division.trim()) errs.push('Division is required.');
    return errs;
  };

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
          {addressErrors.length > 0 && (
            <Alert tone="danger" title="Please fix the following">
              <ul className="list-disc space-y-0.5 pl-4">
                {addressErrors.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </Alert>
          )}
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
              <Input
                id={key}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                placeholder={key === 'customerPhone' ? '01XXXXXXXXX' : undefined}
              />
            </FormField>
          ))}
          <Button
            onClick={() => {
              const errs = validateAddress();
              setAddressErrors(errs);
              if (errs.length === 0) setStep('payment');
            }}
          >
            Continue
          </Button>
        </Card>
      )}

      {step === 'payment' && (
        <Card elevated className="space-y-4">
          <Tabs
            value={form.paymentMethod}
            onValueChange={(v) => set('paymentMethod', v)}
          >
            <TabsList>
              <TabsTrigger value="CASH_ON_DELIVERY">Cash on delivery</TabsTrigger>
              <TabsTrigger
                value="MANUAL_BKASH"
                className={
                  form.paymentMethod === 'MANUAL_BKASH'
                    ? 'bg-[#E2136E] text-white shadow-none hover:brightness-110'
                    : 'text-[#E2136E] hover:bg-[#E2136E]/10'
                }
              >
                bKash
              </TabsTrigger>
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
          <FormField label="Coupon code (optional)" htmlFor="couponCode">
            <Input
              id="couponCode"
              value={form.couponCode}
              onChange={(e) => set('couponCode', e.target.value.toUpperCase())}
              placeholder="e.g. EID20"
            />
          </FormField>
          <div className="flex justify-between border-t border-line pt-3 font-semibold">
            <span>Items subtotal</span>
            <span>{formatBdt(total)}</span>
          </div>
          <p className="text-xs text-ink-secondary">
            Delivery charge and any coupon discount are calculated after you place the order,
            based on your delivery address. You'll see the final total on the confirmation page.
          </p>
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
