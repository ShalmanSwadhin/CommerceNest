import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { hasValidStoreSession, useAuthStore } from '../stores/authStore';

export function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const location = useLocation();

  if (!hasValidStoreSession({ accessToken, user })) {
    // A stale/invalid session (e.g. missing role or storeId) must be
    // purged here, not just redirected away from — otherwise it keeps
    // sitting in storage and LoginPage's own "already logged in" check
    // would see the still-present accessToken and bounce straight back,
    // which is exactly the infinite-redirect/blank-page bug this guards.
    if (accessToken || user) clearSession();
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
