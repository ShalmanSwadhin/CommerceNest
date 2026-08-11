import { Link, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { Alert, Badge, Button, Card } from '@commercenest/ui';
import { storefrontApi, unwrapList, type StorefrontStore } from '../lib/api';
import { formatBdt, formatDate } from '../lib/format';
import { canonicalUrl } from '../lib/seo';
import { useStoreSlug } from '../lib/storeSlug';
import { t } from '../i18n/dictionary';
import { useAuthStore } from '../stores/authStore';
import { useLocaleStore } from '../stores/localeStore';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';

export function AccountPage() {
  const { slug } = useStoreSlug();
  const locale = useLocaleStore((s) => s.locale);
  const accessToken = useAuthStore((s) => s.accessToken);
  const customer = useAuthStore((s) => s.customer);
  const clearSession = useAuthStore((s) => s.clearSession);
  const { store } = useOutletContext<{ store?: StorefrontStore }>() ?? {};
  const pageTitle = `${t(locale, 'account')} — ${store?.name || 'Store'}`;
  const helmet = (
    <Helmet>
      <title>{pageTitle}</title>
      <link rel="canonical" href={canonicalUrl()} />
      <meta name="robots" content="noindex, follow" />
    </Helmet>
  );

  const q = useQuery({
    queryKey: ['storefront', slug, 'me'],
    queryFn: () => storefrontApi.profile(slug),
    enabled: !!accessToken,
    retry: false,
  });

  const ordersQ = useQuery({
    queryKey: ['storefront', slug, 'account', 'orders'],
    queryFn: () => storefrontApi.accountOrders(slug),
    enabled: !!accessToken,
    retry: false,
  });

  if (!accessToken || !customer) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        {helmet}
        <Alert tone="info" title={t(locale, 'account')}>
          Sign in with phone OTP to view your profile.
        </Alert>
        <div className="mt-4 flex gap-2">
          <Link to="/login">
            <Button>{t(locale, 'login')}</Button>
          </Link>
          <Link to="/register">
            <Button variant="secondary">{t(locale, 'register')}</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <ErrorState
          message={q.error instanceof Error ? q.error.message : undefined}
          onRetry={() => void q.refetch()}
        />
        <Card elevated className="mt-4 space-y-2">
          <div className="font-semibold">{customer.name || 'Customer'}</div>
          <div className="text-sm text-ink-secondary">{customer.phone}</div>
          <Button variant="secondary" onClick={clearSession}>
            Logout
          </Button>
        </Card>
      </div>
    );
  }

  const profile = q.data?.customer ?? q.data ?? customer;
  const orders = unwrapList(ordersQ.data);

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-10">
      {helmet}
      <h1 className="text-2xl font-semibold">{t(locale, 'account')}</h1>
      <Card elevated className="space-y-2">
        <div className="text-lg font-semibold">{profile.name || customer.name || 'Customer'}</div>
        <div className="text-sm text-ink-secondary">{profile.phone}</div>
        {'email' in profile && profile.email ? (
          <div className="text-sm text-ink-secondary">{profile.email}</div>
        ) : null}
        <div className="pt-2">
          <Button variant="secondary" onClick={clearSession}>
            Logout
          </Button>
        </div>
      </Card>

      <Card elevated className="space-y-3">
        <h2 className="font-semibold">Your orders</h2>
        {ordersQ.isLoading ? (
          <p className="text-sm text-ink-secondary">Loading orders...</p>
        ) : orders.length === 0 ? (
          <SoftEmpty
            title="No orders yet"
            description="Orders placed while signed in will appear here."
          />
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm last:border-0"
              >
                <div>
                  <div className="font-medium">{order.orderNumber || order.id.slice(0, 8)}</div>
                  <div className="text-ink-secondary">{formatDate(order.createdAt)}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{formatBdt(order.total)}</div>
                  <Badge tone="neutral">{order.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Link to="/track" className="text-sm font-medium text-[var(--store-primary)]">
        {t(locale, 'trackOrder')}
      </Link>
    </div>
  );
}
