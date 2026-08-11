import { useParams, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { Card } from '@commercenest/ui';
import { ApiClientError, storefrontApi, type StorefrontStore } from '../lib/api';
import { canonicalUrl } from '../lib/seo';
import { useStoreSlug } from '../lib/storeSlug';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';

export function CmsContentPage() {
  const { slug } = useStoreSlug();
  const { key = 'about' } = useParams();
  const { store } = useOutletContext<{ store?: StorefrontStore }>() ?? {};

  const q = useQuery({
    queryKey: ['storefront', slug, 'cms', key],
    queryFn: () => storefrontApi.cms(slug, key),
    enabled: !!slug && !!key,
    retry: false,
  });

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError) {
    const msg =
      q.error instanceof ApiClientError
        ? q.error.message
        : q.error instanceof Error
          ? q.error.message
          : 'Could not load content';
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <ErrorState message={msg} onRetry={() => void q.refetch()} />
      </div>
    );
  }

  const storeName = store?.name || 'Store';
  const fallbackTitle = key.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

  if (!q.data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Helmet>
          <title>{`${fallbackTitle} — ${storeName}`}</title>
          <link rel="canonical" href={canonicalUrl()} />
        </Helmet>
        <SoftEmpty
          title="Content not published"
          description="The store has not published this page yet."
        />
      </div>
    );
  }

  const pageTitle = q.data.title || fallbackTitle;
  const description = q.data.body
    ? q.data.body.trim().slice(0, 160)
    : `Learn more about ${storeName}.`;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
      <Helmet>
        <title>{`${pageTitle} — ${storeName}`}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl()} />
      </Helmet>
      <h1 className="text-3xl font-semibold tracking-tight">
        {q.data.title || q.data.key}
      </h1>
      <Card elevated>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary">
          {q.data.body || 'No content yet.'}
        </div>
      </Card>
    </div>
  );
}
