import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WishlistPage } from './WishlistPage';

vi.mock('../lib/storeSlug', () => ({
  useStoreSlug: () => ({ slug: 'test-store', resolving: false, notFound: false }),
}));

/** Mirrors StoreShell's real `<Outlet context={{ slug, store, theme: outletTheme }} />` — the
 * same normalized templateId source the route gate reads. */
function ShellStub({ templateId }: { templateId?: string }) {
  return <Outlet context={{ theme: { templateId } }} />;
}

function renderWishlistRoute(templateId: string | undefined) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/account/wishlist']}>
        <Routes>
          <Route element={<ShellStub templateId={templateId} />}>
            <Route path="/account/wishlist" element={<WishlistPage />} />
            <Route path="/account" element={<div>Account page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('WishlistPage — template routing gate', () => {
  it('redirects to /account on a default-template store instead of rendering the orphaned page', () => {
    renderWishlistRoute('default');
    expect(screen.getByText('Account page')).toBeInTheDocument();
    expect(screen.queryByText(/wishlist/i)).not.toBeInTheDocument();
  });

  it('redirects to /account when templateId is missing entirely (every pre-existing theme)', () => {
    renderWishlistRoute(undefined);
    expect(screen.getByText('Account page')).toBeInTheDocument();
  });

  it('renders the real wishlist page (not a redirect) on a modern-commerce store', () => {
    renderWishlistRoute('modern-commerce');
    expect(screen.queryByText('Account page')).not.toBeInTheDocument();
    expect(screen.getByText(/sign in to view and save items/i)).toBeInTheDocument();
  });
});
