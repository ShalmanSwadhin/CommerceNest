import { Link, useOutletContext } from 'react-router-dom';
import { Button, Card } from '@commercenest/ui';
import { ShoppingBag } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import type { StorefrontStore } from '../lib/api';
import { formatBdt } from '../lib/format';
import { canonicalUrl } from '../lib/seo';
import { t } from '../i18n/dictionary';
import { cartTotal, useCartStore } from '../stores/cartStore';
import { useLocaleStore } from '../stores/localeStore';
import { SoftEmpty } from '../components/QueryState';
import { cloudinaryThumb } from '../lib/media';

export function CartPage() {
  const locale = useLocaleStore((s) => s.locale);
  const items = useCartStore((s) => s.items);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const { store } = useOutletContext<{ store?: StorefrontStore }>() ?? {};
  const pageTitle = `${t(locale, 'cart')} — ${store?.name || 'Store'}`;

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Helmet>
          <title>{pageTitle}</title>
          <link rel="canonical" href={canonicalUrl()} />
          <meta name="robots" content="noindex, follow" />
        </Helmet>
        <SoftEmpty
          icon={<ShoppingBag />}
          title={t(locale, 'emptyCart')}
          description="Browse the catalog and add items to continue."
          action={{ label: t(locale, 'continueShopping'), onClick: () => (window.location.href = '/c/all') }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <Helmet>
        <title>{pageTitle}</title>
        <link rel="canonical" href={canonicalUrl()} />
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <h1 className="text-2xl font-semibold">{t(locale, 'cart')}</h1>
      {items.map((item) => (
        <Card key={item.variantId} elevated className="flex gap-4">
          <div className="size-20 shrink-0 overflow-hidden rounded-cn bg-surface-sunken">
            {item.imageUrl ? (
              <img
                src={cloudinaryThumb(item.imageUrl, 160)}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{item.name}</div>
            <div className="text-sm text-ink-secondary">
              {[item.size, item.color].filter(Boolean).join(' · ') || 'Default'}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={99}
                className="h-9 w-20 rounded-cn border border-line px-2 text-sm"
                value={item.quantity}
                onChange={(e) => setQuantity(item.variantId, Number(e.target.value))}
              />
              <button
                type="button"
                className="text-sm text-danger text-[var(--cn-color-danger)]"
                onClick={() => removeItem(item.variantId)}
              >
                Remove
              </button>
            </div>
          </div>
          <div className="font-semibold">{formatBdt(item.unitPrice * item.quantity)}</div>
        </Card>
      ))}
      <Card elevated className="flex items-center justify-between">
        <div className="text-sm text-ink-secondary">Total</div>
        <div className="text-xl font-semibold">{formatBdt(cartTotal(items))}</div>
      </Card>
      <Link to="/checkout">
        <Button className="w-full" size="lg">
          {t(locale, 'checkout')}
        </Button>
      </Link>
    </div>
  );
}
