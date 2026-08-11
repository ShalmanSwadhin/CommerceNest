import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!accessToken || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user.role !== 'MASTER_ADMIN' && !useAuthStore.getState().impersonation.active) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
