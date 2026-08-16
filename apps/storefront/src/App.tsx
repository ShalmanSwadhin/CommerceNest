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
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

// Wired at module scope, not inside a useEffect — these closures have no
// dependency on React's lifecycle (they read useAuthStore.getState()
// directly), and deferring this to an effect left a real window where the
// FIRST render's already-`enabled` queries (e.g. the account page's /me
// call right after a page reload) fired through apiRequest() before the
// token getter was ever wired up, silently sending no Authorization header
// at all and logging the customer out via the resulting 401.
configureApiAuth({
  getAccessToken: () => useAuthStore.getState().accessToken,
  onUnauthorized: () => useAuthStore.getState().clearSession(),
});

function AuthBootstrap({ children }: { children: React.ReactNode }) {
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
                  <Route path="reset-password" element={<ResetPasswordPage />} />
                  <Route path="verify-email" element={<VerifyEmailPage />} />
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
