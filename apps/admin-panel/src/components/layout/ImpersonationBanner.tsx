import { Alert, Button } from '@commercenest/ui';
import { useAuthStore } from '../../stores/authStore';
import { adminApi } from '../../lib/api';

export function ImpersonationBanner() {
  const impersonation = useAuthStore((s) => s.impersonation);
  const setSession = useAuthStore((s) => s.setSession);
  const user = useAuthStore((s) => s.user);
  const clearImpersonation = useAuthStore((s) => s.clearImpersonation);
  const setImpersonation = useAuthStore((s) => s.setImpersonation);

  if (!impersonation.active) return null;

  const end = async () => {
    try {
      await adminApi.endImpersonation(impersonation.sessionId);
    } catch {
      /* ignore */
    }
    if (impersonation.originalAccessToken && user) {
      setSession(impersonation.originalAccessToken, {
        ...user,
        role: 'MASTER_ADMIN',
        storeId: null,
      });
    }
    clearImpersonation();
    setImpersonation({ active: false });
  };

  return (
    <div className="px-6 pt-4">
      <Alert tone="impersonation" title="Impersonation active">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            You are viewing as store staff for{' '}
            <strong>{impersonation.storeName || impersonation.storeId}</strong>.
          </p>
          <Button size="sm" variant="secondary" onClick={end}>
            End impersonation
          </Button>
        </div>
      </Alert>
    </div>
  );
}
