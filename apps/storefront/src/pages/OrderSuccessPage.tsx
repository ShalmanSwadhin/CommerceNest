import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card } from '@commercenest/ui';
import { CheckCircle2 } from 'lucide-react';
import { t } from '../i18n/dictionary';
import { useLocaleStore } from '../stores/localeStore';

export function OrderSuccessPage() {
  const [params] = useSearchParams();
  const order = params.get('order');
  const locale = useLocaleStore((s) => s.locale);

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Card elevated className="text-center">
        <CheckCircle2 className="mx-auto size-12 text-[var(--cn-color-success)]" />
        <h1 className="mt-4 text-2xl font-semibold">{t(locale, 'orderSuccess')}</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          {order ? `Order reference: ${order}` : 'Your order was submitted successfully.'}
        </p>
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
