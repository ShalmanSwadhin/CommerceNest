import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { ToastProvider } from '@commercenest/ui';
import { configureApiAuth } from './lib/api';
import { useAuthStore } from './stores/authStore';
import { StoreShell } from './components/StoreShell';
import { HomePage } from './pages/HomePage';
import { CategoryPage } from './pages/CategoryPage';
import { ProductPage } from './pages/ProductPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderSuccessPage } from './pages/OrderSuccessPage';
import { TrackOrderPage } from './pages/TrackOrderPage';
import { AuthPage } from './pages/AuthPage';
import { AccountPage } from './pages/AccountPage';
import { CmsContentPage } from './pages/CmsContentPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    configureApiAuth({
      getAccessToken: () => useAuthStore.getState().accessToken,
      onUnauthorized: () => useAuthStore.getState().clearSession(),
    });
  }, []);
  return <>{children}</>;
}

export default function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthBootstrap>
            <BrowserRouter>
              <Routes>
                <Route element={<StoreShell />}>
                  <Route index element={<HomePage />} />
                  <Route path="c/:categorySlug" element={<CategoryPage />} />
                  <Route path="p/:productSlug" element={<ProductPage />} />
                  <Route path="cart" element={<CartPage />} />
                  <Route path="checkout" element={<CheckoutPage />} />
                  <Route path="order-success" element={<OrderSuccessPage />} />
                  <Route path="track" element={<TrackOrderPage />} />
                  <Route path="login" element={<AuthPage mode="login" />} />
                  <Route path="register" element={<AuthPage mode="register" />} />
                  <Route path="forgot" element={<AuthPage mode="forgot" />} />
                  <Route path="account" element={<AccountPage />} />
                  <Route path="pages/:key" element={<CmsContentPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </AuthBootstrap>
        </ToastProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}
