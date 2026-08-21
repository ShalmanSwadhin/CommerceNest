import { useEffect, useState } from 'react';
import { ChevronRight, Grid, List, SlidersHorizontal, X } from 'lucide-react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import {
  storefrontApi,
  unwrapList,
  unwrapTotal,
  type StorefrontCategory,
  type StorefrontProduct,
  type StorefrontProductSort,
  type StorefrontStore,
} from '../../lib/api';
import { canonicalUrl } from '../../lib/seo';
import { ModernProductCard } from './ModernProductCard';

type OutletCtx = { slug: string; store?: StorefrontStore };
type View = 'grid' | 'list';

const PAGE_SIZE = 12;

const SORT_OPTIONS: { value: StorefrontProductSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'name_asc', label: 'Name: A to Z' },
];

function unwrapCategories(payload: unknown): StorefrontCategory[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return ((payload as { data?: unknown[]; items?: unknown[] }).data ||
    (payload as { items?: unknown[] }).items ||
    []) as StorefrontCategory[];
}

function FilterSidebar({
  categories,
  categorySlug,
  onCategoryChange,
  maxPrice,
  onMaxPriceChange,
  inStockOnly,
  onInStockChange,
  onReset,
  hasFilters,
}: {
  categories: StorefrontCategory[];
  categorySlug: string;
  onCategoryChange: (slug: string) => void;
  maxPrice: number;
  onMaxPriceChange: (v: number) => void;
  inStockOnly: boolean;
  onInStockChange: (v: boolean) => void;
  onReset: () => void;
  hasFilters: boolean;
}) {
  const border = { borderColor: 'var(--store-border,#E5E7EB)' };
  const muted = { color: 'var(--store-muted,#4B5563)' };
  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-semibold mb-3" style={{ color: 'var(--store-text,#111111)' }}>Category</div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm" style={muted}>
            <input type="radio" name="mc-category" checked={categorySlug === 'all'} onChange={() => onCategoryChange('all')} />
            All Products
          </label>
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm" style={muted}>
              <input type="radio" name="mc-category" checked={categorySlug === c.slug} onChange={() => onCategoryChange(c.slug)} />
              {c.name}
            </label>
          ))}
        </div>
      </div>
      <div className="pt-6 border-t" style={border}>
        <div className="text-sm font-semibold mb-3" style={{ color: 'var(--store-text,#111111)' }}>Max Price</div>
        <div className="text-xs mb-2" style={muted}>Up to ৳{maxPrice.toLocaleString()}</div>
        <input
          type="range"
          min={500}
          max={50000}
          step={500}
          value={maxPrice}
          onChange={(e) => onMaxPriceChange(Number(e.target.value))}
          className="w-full"
        />
      </div>
      <div className="pt-6 border-t" style={border}>
        <label className="flex items-center gap-2 text-sm" style={muted}>
          <input type="checkbox" checked={inStockOnly} onChange={(e) => onInStockChange(e.target.checked)} />
          In stock only
        </label>
      </div>
      {hasFilters ? (
        <button type="button" onClick={onReset} className="flex items-center gap-1.5 text-sm hover:text-red-600" style={muted}>
          <X size={11} />
          Reset all filters
        </button>
      ) : null}
    </div>
  );
}

export function ModernShopPage() {
  const { categorySlug = 'all' } = useParams();
  const { slug, store } = useOutletContext<OutletCtx>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const sortParam = searchParams.get('sort');
  const initialSort: StorefrontProductSort =
    sortParam === 'price_asc' || sortParam === 'price_desc' || sortParam === 'name_asc' || sortParam === 'newest'
      ? sortParam
      : 'newest';
  const [sort, setSort] = useState<StorefrontProductSort>(initialSort);
  const [view, setView] = useState<View>('grid');
  const [maxPrice, setMaxPrice] = useState(50000);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [accumulated, setAccumulated] = useState<StorefrontProduct[]>([]);

  const search = searchParams.get('search') || undefined;

  // Re-syncs `sort` when the URL's own ?sort= param changes (e.g. clicking
  // "New Arrivals" while already on the shop page with a different sort
  // selected) — a plain useState initializer only runs once per mount.
  useEffect(() => {
    if (sortParam && sortParam !== sort) setSort(initialSort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortParam]);

  useEffect(() => {
    setPage(1);
    setAccumulated([]);
  }, [categorySlug, sort, maxPrice, inStockOnly, search]);

  const catsQ = useQuery({
    queryKey: ['storefront', slug, 'categories'],
    queryFn: () => storefrontApi.categories(slug),
    enabled: !!slug,
  });
  const categories = unwrapCategories(catsQ.data);

  const queryParams = {
    search,
    sort,
    maxPrice,
    inStock: inStockOnly ? ('true' as const) : undefined,
    page,
    limit: PAGE_SIZE,
  };

  const q = useQuery({
    queryKey: ['storefront', slug, 'mc-shop', categorySlug, queryParams],
    queryFn: () =>
      categorySlug === 'all' ? storefrontApi.products(slug, queryParams) : storefrontApi.categoryProducts(slug, categorySlug, queryParams),
    enabled: !!slug,
  });

  useEffect(() => {
    if (!q.data) return;
    const items = unwrapList(q.data);
    setAccumulated((prev) => (page === 1 ? items : [...prev, ...items]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const total = unwrapTotal(q.data);
  const hasMore = accumulated.length < total;
  const hasFilters = maxPrice < 50000 || inStockOnly;
  const displayName = categorySlug === 'all' ? 'All Products' : categories.find((c) => c.slug === categorySlug)?.name || categorySlug;
  const storeName = store?.name || 'Store';

  const reset = () => {
    setMaxPrice(50000);
    setInStockOnly(false);
  };

  return (
    <div>
      <Helmet>
        <title>{`${displayName} — ${storeName}`}</title>
        <meta name="description" content={`Shop ${displayName} at ${storeName}.`} />
        <link rel="canonical" href={canonicalUrl()} />
      </Helmet>

      <div className="border-b" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
        <div className="max-w-[1440px] mx-auto px-6 lg:px-10 py-3 flex items-center gap-2 text-xs" style={{ color: 'var(--store-muted,#9CA3AF)' }}>
          <Link to="/">Home</Link>
          <ChevronRight size={11} />
          <span>{displayName}</span>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-6 lg:px-10 py-8 flex gap-8">
        <aside className="w-56 shrink-0 hidden lg:block sticky top-24 self-start">
          <FilterSidebar
            categories={categories}
            categorySlug={categorySlug}
            onCategoryChange={(s) => navigate(s === 'all' ? '/c/all' : `/c/${s}`)}
            maxPrice={maxPrice}
            onMaxPriceChange={setMaxPrice}
            inStockOnly={inStockOnly}
            onInStockChange={setInStockOnly}
            onReset={reset}
            hasFilters={hasFilters}
          />
        </aside>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-5 border-b" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
            <div>
              <h1 className="text-xl font-semibold" style={{ color: 'var(--store-text,#111111)' }}>{displayName}</h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--store-muted,#9CA3AF)' }}>{total} product{total === 1 ? '' : 's'}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="lg:hidden flex items-center gap-1.5 text-sm border rounded-sm px-3 py-2"
                style={{ borderColor: 'var(--store-border,#E5E7EB)' }}
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal size={14} />
                Filters
              </button>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as StorefrontProductSort)}
                className="text-sm border rounded-sm px-2 py-2"
                style={{ borderColor: 'var(--store-border,#E5E7EB)' }}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div className="hidden sm:flex border rounded-sm overflow-hidden" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
                <button
                  type="button"
                  onClick={() => setView('grid')}
                  className="p-2"
                  style={view === 'grid' ? { background: 'var(--store-primary,#111111)', color: 'white' } : undefined}
                >
                  <Grid size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className="p-2"
                  style={view === 'list' ? { background: 'var(--store-primary,#111111)', color: 'white' } : undefined}
                >
                  <List size={14} />
                </button>
              </div>
            </div>
          </div>

          {q.isLoading && page === 1 ? (
            <div className="py-16 text-center text-sm" style={{ color: 'var(--store-muted,#9CA3AF)' }}>Loading…</div>
          ) : accumulated.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-semibold mb-2" style={{ color: 'var(--store-text,#111111)' }}>No products found</p>
              {hasFilters ? (
                <button type="button" onClick={reset} className="text-sm text-[var(--store-accent,#4338CA)]">Clear filters</button>
              ) : null}
            </div>
          ) : (
            <>
              <div
                className={
                  view === 'grid'
                    ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8'
                    : 'flex flex-col gap-3'
                }
              >
                {accumulated.map((p) => (
                  <ModernProductCard key={p.id} product={p} view={view} />
                ))}
              </div>
              {hasMore ? (
                <div className="mt-10 text-center">
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={q.isFetching}
                    className="px-8 py-3 border text-sm font-medium rounded-sm hover:bg-[var(--store-surface,#F9FAFB)] disabled:opacity-50"
                    style={{ borderColor: 'var(--store-border,#E5E7EB)', color: 'var(--store-text,#111111)' }}
                  >
                    {q.isFetching ? 'Loading…' : `Load more (${total - accumulated.length} remaining)`}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {filtersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="drawer-overlay" aria-label="Close filters" onClick={() => setFiltersOpen(false)} />
          <aside className="drawer-panel-left w-72 bg-white flex flex-col">
            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
              <span className="font-semibold">Filters</span>
              <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <FilterSidebar
                categories={categories}
                categorySlug={categorySlug}
                onCategoryChange={(s) => {
                  navigate(s === 'all' ? '/c/all' : `/c/${s}`);
                  setFiltersOpen(false);
                }}
                maxPrice={maxPrice}
                onMaxPriceChange={setMaxPrice}
                inStockOnly={inStockOnly}
                onInStockChange={setInStockOnly}
                onReset={reset}
                hasFilters={hasFilters}
              />
            </div>
            <div className="p-5 border-t" style={{ borderColor: 'var(--store-border,#E5E7EB)' }}>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="w-full py-3 bg-[var(--store-primary,#111111)] text-white text-sm font-semibold rounded-sm"
              >
                Apply Filters ({total} results)
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
