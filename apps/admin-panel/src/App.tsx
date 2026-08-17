import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@commercenest/ui';
import { configureApiAuth } from './lib/api';
import { useAuthStore } from './stores/authStore';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { StoresPage } from './pages/StoresPage';
import { StoreDetailPage } from './pages/StoreDetailPage';
import { ThemeEditorPage } from './pages/ThemeEditorPage';
import { ThemeEditorProPage } from './pages/ThemeEditorProPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { BillingPage } from './pages/BillingPage';
import { SettingsPage } from './pages/SettingsPage';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import { SupportPage } from './pages/SupportPage';
import { UsersPage } from './pages/UsersPage';
import { TrialLeadsPage } from './pages/TrialLeadsPage';
import { DomainRequestsPage } from './pages/DomainRequestsPage';
import { PricingPage } from './pages/PricingPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

// Wired at module scope, not inside a useEffect — an effect runs after the
// first render/paint, leaving a window where an already-`enabled` query
// (e.g. a /me call right after a page reload) fires through apiRequest()
// before the token getter is set, silently omitting the Authorization
// header and logging the admin out via the resulting 401.
configureApiAuth({
  getAccessToken: () => useAuthStore.getState().accessToken,
  onUnauthorized: () => useAuthStore.getState().clearSession(),
});

function AuthBootstrap({ children }: { children: React.ReactNode }) {
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
                  <Route path="stores" element={<StoresPage />} />
                  <Route path="stores/:id" element={<StoreDetailPage />} />
                  <Route path="users" element={<UsersPage />} />
                  <Route path="themes" element={<ThemeEditorPage />} />
                  <Route path="themes/:storeId" element={<ThemeEditorPage />} />
                  <Route path="themes/:storeId/pro" element={<ThemeEditorProPage />} />
                  <Route path="trial-leads" element={<TrialLeadsPage />} />
                  <Route path="domain-requests" element={<DomainRequestsPage />} />
                  <Route path="pricing" element={<PricingPage />} />
                  <Route path="payments" element={<PaymentsPage />} />
                  <Route path="analytics" element={<AnalyticsPage />} />
                  <Route path="billing" element={<BillingPage />} />
                  <Route path="audit-logs" element={<AuditLogsPage />} />
                  <Route path="announcements" element={<AnnouncementsPage />} />
                  <Route path="support" element={<SupportPage />} />
                  <Route path="settings" element={<SettingsPage />} />
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
