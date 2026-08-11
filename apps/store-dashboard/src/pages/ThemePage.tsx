import { Alert } from '@commercenest/ui';
import { ThemeBuilder } from '../features/theme-builder/ThemeBuilder';
import { ErrorState } from '../components/QueryState';
import { useAuthStore, useStoreId } from '../stores/authStore';
import { canAccess } from '../lib/rbac';

export function ThemePage() {
  const storeId = useStoreId();
  const role = useAuthStore((s) => s.user?.role);

  if (!storeId) return <ErrorState message="Missing store context." />;

  if (!canAccess(role, 'theme')) {
    return (
      <Alert tone="caution" title="You don't have access to the Theme Builder">
        Only the store owner or store manager can edit storefront design. Ask them to
        make changes, or reach out for access.
      </Alert>
    );
  }

  return (
    <div className="-m-4 md:-m-6">
      <ThemeBuilder storeId={storeId} />
    </div>
  );
}
