import { useEffect } from 'react';
import { Link, Navigate, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { Alert, Button } from '@commercenest/ui';
import { storefrontApi, type ThemeSettings } from '../lib/api';
import { useStoreSlug } from '../lib/storeSlug';
import { useAuthStore } from '../stores/authStore';
import { useWishlistStore } from '../stores/wishlistStore';
import { ProductCard } from '../components/ProductCard';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';

export function WishlistPage() {
  const { theme } = useOutletContext<{ theme?: ThemeSettings }>() ?? {};
  const { slug } = useStoreSlug();
  const { customer } = useAuthStore();
  const setIds = useWishlistStore((s) => s.setIds);

  // Wishlist UI/API only exists in the modern-commerce template tree
  // (ModernProductCard/ModernProductPage/ModernCommerceShell) — the default
  // template has no add-to-wishlist entry point anywhere, so this route
  // would otherwise be an empty, orphaned page reachable only by guessing
  // the URL. Same normalized templateId source as StoreShell/ProductCard/
  // ProductPage/CategoryPage (outlet context, built from doc.themeSettings).
  if (theme?.templateId !== 'modern-commerce') {
    return <Navigate to="/account" replace />;
  }

  const q = useQuery({
    queryKey: ['storefront', slug, 'wishlist'],
    queryFn: () => storefrontApi.wishlist(slug),
    enabled: !!slug && !!customer,
  });

  useEffect(() => {
    if (q.data) setIds(q.data.items.map((i) => i.product.id));
  }, [q.data, setIds]);

  if (!customer) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <Alert tone="info" title="Wishlist">
          Sign in to view and save items to your wishlist.
        </Alert>
        <Link to="/login" className="mt-4 inline-block">
          <Button>Sign in</Button>
        </Link>
      </div>
    );
  }

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <ErrorState message={q.error instanceof Error ? q.error.message : undefined} onRetry={() => void q.refetch()} />
      </div>
    );
  }

  const items = q.data?.items || [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Your Wishlist</h1>
      {items.length === 0 ? (
        <SoftEmpty icon={<Heart />} title="Your wishlist is empty" description="Save items you love to find them here later." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
          {items.map((i) => (
            <ProductCard key={i.id} product={i.product} />
          ))}
        </div>
      )}
    </div>
  );
}
