import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { hasValidAdminSession, useAuthStore } from '../stores/authStore';

export function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const impersonationActive = useAuthStore((s) => s.impersonation.active);
  const clearSession = useAuthStore((s) => s.clearSession);
  const location = useLocation();

  if (!hasValidAdminSession({ accessToken, user, impersonationActive })) {
    // A stale/invalid session must be purged here, not just redirected
    // away from — otherwise it keeps sitting in storage and LoginPage's
    // own "already logged in" check would see the still-present
    // accessToken and bounce straight back, which is exactly the
    // infinite-redirect/blank-page bug this guards.
    if (accessToken || user) clearSession();
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
