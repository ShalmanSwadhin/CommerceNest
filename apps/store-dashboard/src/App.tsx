import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert, Button, ToastProvider } from '@commercenest/ui';
import { ApiClientError, configureApiAuth, storeApi } from './lib/api';
import { useAuthStore } from './stores/authStore';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { canAccess, type NavKey } from './lib/rbac';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { OrdersPage } from './pages/OrdersPage';
import { ProductsPage } from './pages/ProductsPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { CouponsPage } from './pages/CouponsPage';
import { ReturnsPage } from './pages/ReturnsPage';
import { CustomersPage } from './pages/CustomersPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { CmsPage } from './pages/CmsPage';
import { MediaPage } from './pages/MediaPage';
import { ThemePage } from './pages/ThemePage';
import { SettingsPage } from './pages/SettingsPage';
import { SupportPage } from './pages/SupportPage';
import { AnnouncementsPage } from './pages/AnnouncementsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

function stripQueryParams(names: string[]) {
  const params = new URLSearchParams(window.location.search);
  let changed = false;
  for (const name of names) {
    if (params.has(name)) {
      params.delete(name);
      changed = true;
    }
  }
  if (!changed) return;
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
  window.history.replaceState({}, '', next);
}

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const [handoff, setHandoff] = useState<'idle' | 'pending' | 'error'>('idle');
  const [handoffError, setHandoffError] = useState<string | null>(null);

  useEffect(() => {
    configureApiAuth({
      getAccessToken: () => useAuthStore.getState().accessToken,
      getRefreshToken: () => useAuthStore.getState().refreshToken,
      onUnauthorized: () => useAuthStore.getState().clearSession(),
      onTokenRefreshed: (accessToken, refreshToken) =>
        useAuthStore.getState().updateTokens(accessToken, refreshToken),
    });

    const params = new URLSearchParams(window.location.search);

    // Impersonation handoff: Master Admin opens this app with a short-lived,
    // single-use code that we exchange for real session tokens.
    const handoffCode = params.get('impersonation_handoff');
    if (handoffCode) {
      stripQueryParams(['impersonation_handoff']);
      setHandoff('pending');
      void (async () => {
        try {
          const { accessToken, refreshToken } =
            await storeApi.exchangeImpersonationHandoff(handoffCode);
          // Set the token first so the follow-up /me call is authenticated.
          useAuthStore.getState().setSession(
            accessToken,
            {
              id: '',
              email: '',
              name: 'Impersonation session',
              role: 'MASTER_ADMIN',
              storeId: null,
            },
            refreshToken,
          );
          const me = await storeApi.me();
          useAuthStore.getState().setSession(accessToken, me, refreshToken);
          setHandoff('idle');
        } catch (err) {
          useAuthStore.getState().clearSession();
          setHandoffError(
            err instanceof ApiClientError
              ? err.message
              : 'This impersonation link has expired. Ask the platform admin to start a new session.',
          );
          setHandoff('error');
        }
      })();
    }
  }, []);

  if (handoff === 'pending') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-raised">
        <p className="text-sm text-ink-secondary">Starting impersonation session…</p>
      </div>
    );
  }

  if (handoff === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-raised px-4">
        <div className="w-full max-w-md">
          <Alert tone="danger" title="Impersonation link expired">
            <p className="text-sm">{handoffError}</p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => window.location.assign('/login')}
            >
              Go to login
            </Button>
          </Alert>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function RequirePermission({ perm, children }: { perm: NavKey; children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  if (!canAccess(role, perm)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthBootstrap>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route
                    path="orders"
                    element={
                      <RequirePermission perm="orders">
                        <OrdersPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="products"
                    element={
                      <RequirePermission perm="products">
                        <ProductsPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="categories"
                    element={
                      <RequirePermission perm="categories">
                        <CategoriesPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="coupons"
                    element={
                      <RequirePermission perm="coupons">
                        <CouponsPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="returns"
                    element={
                      <RequirePermission perm="returns">
                        <ReturnsPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="customers"
                    element={
                      <RequirePermission perm="customers">
                        <CustomersPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="payments"
                    element={
                      <RequirePermission perm="payments">
                        <PaymentsPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="analytics"
                    element={
                      <RequirePermission perm="analytics">
                        <AnalyticsPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="cms"
                    element={
                      <RequirePermission perm="cms">
                        <CmsPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="media"
                    element={
                      <RequirePermission perm="media">
                        <MediaPage />
                      </RequirePermission>
                    }
                  />
                  <Route path="theme" element={<ThemePage />} />
                  <Route path="announcements" element={<AnnouncementsPage />} />
                  <Route
                    path="support"
                    element={
                      <RequirePermission perm="support">
                        <SupportPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="settings"
                    element={
                      <RequirePermission perm="settings">
                        <SettingsPage />
                      </RequirePermission>
                    }
                  />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthBootstrap>
      </ToastProvider>
    </QueryClientProvider>
  );
}
