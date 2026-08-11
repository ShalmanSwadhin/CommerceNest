import { useEffect, useMemo, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { SlidersHorizontal } from 'lucide-react';
import { Button, Input, Pagination } from '@commercenest/ui';
import {
  storefrontApi,
  unwrapList,
  unwrapTotal,
  type StorefrontProductSort,
  type StorefrontStore,
} from '../lib/api';
import { useStoreSlug } from '../lib/storeSlug';
import { canonicalUrl } from '../lib/seo';
import { t } from '../i18n/dictionary';
import { useLocaleStore } from '../stores/localeStore';
import { ProductCard } from '../components/ProductCard';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';

const PAGE_SIZE = 24;

const SORT_OPTIONS: {
  value: StorefrontProductSort;
  labelKey: 'sortNewest' | 'sortPriceAsc' | 'sortPriceDesc' | 'sortNameAsc';
}[] = [
  { value: 'newest', labelKey: 'sortNewest' },
  { value: 'price_asc', labelKey: 'sortPriceAsc' },
  { value: 'price_desc', labelKey: 'sortPriceDesc' },
  { value: 'name_asc', labelKey: 'sortNameAsc' },
];

export function CategoryPage() {
  const { categorySlug = 'all' } = useParams();
  const { slug } = useStoreSlug();
  const { store } = useOutletContext<{ store?: StorefrontStore }>() ?? {};
  const locale = useLocaleStore((s) => s.locale);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<StorefrontProductSort>('newest');
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [minPrice, setMinPrice] = useState<number | undefined>(undefined);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [inStock, setInStock] = useState(false);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Any filter change (or navigating to a different category) invalidates
  // the current page number — always land back on page 1.
  useEffect(() => {
    setPage(1);
  }, [categorySlug, search, sort, minPrice, maxPrice, inStock]);

  const categoryName =
    categorySlug === 'all' ? t(locale, 'shop') : categorySlug.replace(/-/g, ' ');

  const queryParams = {
    search: search || undefined,
    sort,
    minPrice,
    maxPrice,
    inStock: inStock ? ('true' as const) : undefined,
    page,
    limit: PAGE_SIZE,
  };

  const q = useQuery({
    queryKey: ['storefront', slug, 'category', categorySlug, queryParams],
    queryFn: () =>
      categorySlug === 'all'
        ? storefrontApi.products(slug, queryParams)
        : storefrontApi.categoryProducts(slug, categorySlug, queryParams),
    enabled: !!slug,
  });

  const products = useMemo(() => unwrapList(q.data), [q.data]);
  const total = useMemo(() => unwrapTotal(q.data), [q.data]);

  const filtersActive =
    !!search ||
    sort !== 'newest' ||
    minPrice !== undefined ||
    maxPrice !== undefined ||
    inStock;

  const applyPriceRange = () => {
    const min = minPriceInput.trim() === '' ? undefined : Number(minPriceInput);
    const max = maxPriceInput.trim() === '' ? undefined : Number(maxPriceInput);
    setMinPrice(min !== undefined && Number.isFinite(min) ? min : undefined);
    setMaxPrice(max !== undefined && Number.isFinite(max) ? max : undefined);
  };

  const clearFilters = () => {
    setSearch('');
    setSort('newest');
    setMinPriceInput('');
    setMaxPriceInput('');
    setMinPrice(undefined);
    setMaxPrice(undefined);
    setInStock(false);
  };

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <ErrorState
          message={q.error instanceof Error ? q.error.message : undefined}
          onRetry={() => void q.refetch()}
        />
      </div>
    );
  }

  const storeName = store?.name || 'Store';
  const displayName = categoryName.charAt(0).toUpperCase() + categoryName.slice(1);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Helmet>
        <title>{`${displayName} — ${storeName}`}</title>
        <meta
          name="description"
          content={`Shop ${categoryName} at ${storeName}. Browse products with delivery across Bangladesh.`}
        />
        <link rel="canonical" href={canonicalUrl()} />
      </Helmet>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold capitalize">{categoryName}</h1>
          <p className="text-sm text-ink-secondary">{t(locale, 'categories')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="max-w-sm"
            placeholder={t(locale, 'search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 sm:hidden"
            leftIcon={<SlidersHorizontal className="size-4" />}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            {t(locale, 'filters')}
          </Button>
        </div>
      </div>

      <div
        className={`mb-6 flex-col gap-4 rounded-cn-lg border border-line bg-white p-4 sm:flex sm:flex-row sm:flex-wrap sm:items-end sm:gap-6 ${
          filtersOpen ? 'flex' : 'hidden sm:flex'
        }`}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-secondary">{t(locale, 'sortBy')}</span>
          <select
            className="h-10 rounded-cn border border-line bg-white px-3 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as StorefrontProductSort)}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(locale, opt.labelKey)}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-secondary">{t(locale, 'priceRange')}</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder={t(locale, 'minPrice')}
              className="h-10 w-24 rounded-cn border border-line px-2 text-sm"
              value={minPriceInput}
              onChange={(e) => setMinPriceInput(e.target.value)}
              onBlur={applyPriceRange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyPriceRange();
              }}
            />
            <span className="text-ink-tertiary">–</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder={t(locale, 'maxPrice')}
              className="h-10 w-24 rounded-cn border border-line px-2 text-sm"
              value={maxPriceInput}
              onChange={(e) => setMaxPriceInput(e.target.value)}
              onBlur={applyPriceRange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyPriceRange();
              }}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-ink-secondary">
          <input
            type="checkbox"
            className="size-4 rounded border-line"
            checked={inStock}
            onChange={(e) => setInStock(e.target.checked)}
          />
          {t(locale, 'inStockOnly')}
        </label>

        {filtersActive ? (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            {t(locale, 'clearFilters')}
          </Button>
        ) : null}
      </div>

      {products.length === 0 ? (
        filtersActive ? (
          <SoftEmpty
            title={t(locale, 'noFilterResultsTitle')}
            description={t(locale, 'noFilterResultsDescription')}
            action={{ label: t(locale, 'clearFilters'), onClick: clearFilters }}
          />
        ) : (
          <SoftEmpty title="No products found" description="Try another category or search term." />
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          {total > PAGE_SIZE ? (
            <Pagination
              className="mt-8"
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
