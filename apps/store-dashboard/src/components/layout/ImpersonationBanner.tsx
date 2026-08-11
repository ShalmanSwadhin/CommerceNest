import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Alert, Button } from '@commercenest/ui';
import { storeApi } from '../../lib/api';
import { useAuthStore, useStoreId } from '../../stores/authStore';

/**
 * Visible indicator that a Master Admin is viewing this store's dashboard
 * via impersonation (started from Master Admin -> handoff-code exchange in
 * App.tsx). Ends the session server-side when possible, otherwise falls
 * back to clearing the local session.
 */
export function ImpersonationBanner() {
  const impersonation = useAuthStore((s) => s.impersonation);
  const clearSession = useAuthStore((s) => s.clearSession);
  const navigate = useNavigate();
  const storeId = useStoreId();

  const storeQ = useQuery({
    queryKey: ['store', storeId],
    queryFn: () => storeApi.getStore(storeId!),
    enabled: !!storeId && impersonation.active,
  });

  if (!impersonation.active) return null;

  const end = async () => {
    try {
      if (impersonation.sessionId) {
        await storeApi.endImpersonation(impersonation.sessionId);
      }
    } catch {
      // Best-effort — clear the local session regardless so the operator
      // is never stuck in an impersonated view.
    }
    clearSession();
    navigate('/login', { replace: true });
  };

  return (
    <div className="px-4 pt-4 md:px-6">
      <Alert tone="impersonation" title="Impersonation active">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            You are viewing as staff for{' '}
            <strong>{storeQ.data?.name || storeId}</strong>.
          </p>
          <Button size="sm" variant="secondary" onClick={() => void end()}>
            End impersonation
          </Button>
        </div>
      </Alert>
    </div>
  );
}
