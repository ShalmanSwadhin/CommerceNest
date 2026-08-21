import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { Alert, Badge, Button, Card, FormField, Input } from '@commercenest/ui';
import { ApiClientError, storefrontApi, type LookupOrder, type StorefrontStore } from '../lib/api';
import { formatBdt, formatDate, ORDER_STATUS_LABEL, SHIPMENT_STATUS_LABEL } from '../lib/format';
import { canonicalUrl } from '../lib/seo';
import { useStoreSlug } from '../lib/storeSlug';
import { t } from '../i18n/dictionary';
import { useLocaleStore } from '../stores/localeStore';

export function TrackOrderPage() {
  const { slug } = useStoreSlug();
  const locale = useLocaleStore((s) => s.locale);
  const { store } = useOutletContext<{ store?: StorefrontStore }>() ?? {};
  const [phone, setPhone] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [order, setOrder] = useState<LookupOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => storefrontApi.lookupOrder(slug, phone, orderNumber),
    onSuccess: (data) => {
      setOrder(data);
      setError(null);
    },
    onError: (err) => {
      setOrder(null);
      setError(err instanceof ApiClientError ? err.message : 'Lookup failed');
    },
  });

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-10">
      <Helmet>
        <title>{`${t(locale, 'trackOrder')} — ${store?.name || 'Store'}`}</title>
        <meta
          name="description"
          content="Track the status of your order by phone number and order number."
        />
        <link rel="canonical" href={canonicalUrl()} />
      </Helmet>
      <h1 className="text-2xl font-semibold">{t(locale, 'trackOrder')}</h1>
      <Card elevated className="space-y-3">
        <FormField label="Phone" htmlFor="phone" required>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
        </FormField>
        <FormField label="Order number" htmlFor="orderNumber" required>
          <Input
            id="orderNumber"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
          />
        </FormField>
        <Button className="w-full" loading={mut.isPending} onClick={() => mut.mutate()}>
          Track
        </Button>
      </Card>
      {error && (
        <Alert tone="danger" title="Not found">
          {error}
        </Alert>
      )}
      {order && (
        <Card elevated className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone="primary">{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
            {order.paymentMethod && <Badge tone="neutral">{order.paymentMethod}</Badge>}
            {order.paymentStatus && <Badge tone="caution">{order.paymentStatus}</Badge>}
          </div>
          <div className="text-sm">
            <div className="font-medium">{order.orderNumber || order.id}</div>
            <div className="text-ink-secondary">{formatDate(order.createdAt)}</div>
            <div className="mt-2 font-semibold">{formatBdt(order.total)}</div>
          </div>
          {order.shipment && (
            <div className="rounded-cn border border-line bg-surface-raised p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">
                  {SHIPMENT_STATUS_LABEL[order.shipment.status] ?? order.shipment.status}
                </Badge>
                <span className="text-ink-tertiary">via {order.shipment.provider}</span>
              </div>
              {order.shipment.trackingCode && (
                <div className="mt-1 text-ink-secondary">
                  Tracking number: <span className="font-medium text-ink">{order.shipment.trackingCode}</span>
                </div>
              )}
            </div>
          )}
          <div className="space-y-1 text-sm">
            {(order.items || []).map((item, idx) => (
              <div key={idx}>
                {item.productName || 'Item'} × {item.quantity}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
