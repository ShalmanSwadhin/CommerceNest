import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

const storeRoles = new Set([
  'STORE_OWNER',
  'STORE_MANAGER',
  'INVENTORY_MANAGER',
  'ORDER_MANAGER',
  'CUSTOMER_SUPPORT',
  'MASTER_ADMIN',
]);

export function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!accessToken || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (!storeRoles.has(user.role) || (!user.storeId && user.role !== 'MASTER_ADMIN')) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
