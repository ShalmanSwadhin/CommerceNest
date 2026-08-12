import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card } from '@commercenest/ui';
import { CheckCircle2 } from 'lucide-react';
import { t } from '../i18n/dictionary';
import { useLocaleStore } from '../stores/localeStore';
import { formatBdt } from '../lib/format';

export function OrderSuccessPage() {
  const [params] = useSearchParams();
  const order = params.get('order');
  const locale = useLocaleStore((s) => s.locale);

  const subtotal = params.get('subtotal');
  const delivery = params.get('delivery');
  const discount = params.get('discount');
  const total = params.get('total');
  const hasBreakdown = total !== null;

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Card elevated className="text-center">
        <CheckCircle2 className="mx-auto size-12 text-[var(--cn-color-success)]" />
        <h1 className="mt-4 text-2xl font-semibold">{t(locale, 'orderSuccess')}</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          {order ? `Order reference: ${order}` : 'Your order was submitted successfully.'}
        </p>
        {hasBreakdown ? (
          <div className="mt-4 space-y-1 rounded-xl border border-line bg-surface-raised p-4 text-left text-sm">
            {subtotal ? (
              <div className="flex justify-between">
                <span className="text-ink-secondary">Subtotal</span>
                <span>{formatBdt(Number(subtotal))}</span>
              </div>
            ) : null}
            {delivery ? (
              <div className="flex justify-between">
                <span className="text-ink-secondary">Delivery</span>
                <span>{formatBdt(Number(delivery))}</span>
              </div>
            ) : null}
            {discount && Number(discount) > 0 ? (
              <div className="flex justify-between text-[var(--cn-color-success)]">
                <span>Coupon discount</span>
                <span>-{formatBdt(Number(discount))}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-line pt-2 font-semibold">
              <span>Total</span>
              <span>{formatBdt(Number(total))}</span>
            </div>
          </div>
        ) : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link to="/track">
            <Button variant="secondary">{t(locale, 'trackOrder')}</Button>
          </Link>
          <Link to="/">
            <Button>{t(locale, 'continueShopping')}</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
