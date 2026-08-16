import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Search, XCircle } from 'lucide-react';
import { Badge, Button, Card, FormField, Input, useToast } from '@commercenest/ui';
import { ApiClientError, storeApi } from '../lib/api';
import { useStoreId } from '../stores/authStore';

const STATUS_TONE: Record<string, 'neutral' | 'success' | 'danger' | 'caution'> = {
  PENDING: 'caution',
  APPROVED: 'neutral',
  ASSIGNED: 'success',
  REJECTED: 'danger',
};

/**
 * Request an allocated *.commercenest address — distinct from a merchant's
 * own custom domain (self-service elsewhere). This is curated: Master
 * Admin reviews and assigns it. Availability is always checked
 * server-side; this UI never decides "available" on its own.
 */
export function DomainRequestCard() {
  const storeId = useStoreId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [checked, setChecked] = useState<{ hostname: string; available: boolean; reason?: string } | null>(null);
  const [checking, setChecking] = useState(false);

  const requestsQ = useQuery({
    queryKey: ['store', storeId, 'domain-requests'],
    queryFn: () => storeApi.listDomainRequests(storeId!),
    enabled: !!storeId,
  });

  const checkAvailability = async () => {
    if (!label.trim()) return;
    setChecking(true);
    setChecked(null);
    try {
      const res = await storeApi.checkDomainAvailability(storeId!, label.trim());
      setChecked(res);
    } catch (err) {
      toast({
        title: 'Could not check availability',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      });
    } finally {
      setChecking(false);
    }
  };

  const requestMut = useMutation({
    mutationFn: () => storeApi.requestDomain(storeId!, label.trim()),
    onSuccess: () => {
      toast({ title: 'Domain requested', description: 'Master Admin will review it shortly.', tone: 'success' });
      setLabel('');
      setChecked(null);
      void qc.invalidateQueries({ queryKey: ['store', storeId, 'domain-requests'] });
    },
    onError: (err) =>
      toast({
        title: 'Request failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const requests = requestsQ.data ?? [];

  return (
    <Card elevated className="max-w-2xl space-y-4">
      <div>
        <h2 className="font-semibold">CommerceNest address</h2>
        <p className="text-xs text-ink-secondary">
          Request a short, memorable CommerceNest address for your store (e.g. yourstore.commercenest.com).
          This is separate from adding your own custom domain.
        </p>
      </div>

      <div className="flex items-end gap-2">
        <FormField label="Choose your address" htmlFor="domain-label" className="flex-1">
          <div className="flex items-center gap-2">
            <Input
              id="domain-label"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value.toLowerCase());
                setChecked(null);
              }}
              placeholder="yourstore"
            />
            <span className="whitespace-nowrap text-sm text-ink-secondary">.commercenest</span>
          </div>
        </FormField>
        <Button variant="secondary" loading={checking} disabled={!label.trim()} onClick={() => void checkAvailability()}>
          <Search className="size-4" />
        </Button>
      </div>

      {checked && (
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            checked.available ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {checked.available ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
          {checked.available
            ? `${checked.hostname} is available`
            : checked.reason === 'reserved'
              ? `${checked.hostname} is reserved`
              : `${checked.hostname} is already taken or has a pending request`}
        </div>
      )}

      {checked?.available && (
        <Button loading={requestMut.isPending} onClick={() => requestMut.mutate()}>
          Request this address
        </Button>
      )}

      {requests.length > 0 && (
        <div className="space-y-2 border-t border-line pt-3">
          <h3 className="text-sm font-medium">Your requests</h3>
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <div>
                <span className="font-mono">{r.requestedHostname}</span>
                {r.rejectionReason ? (
                  <p className="text-xs text-ink-secondary">{r.rejectionReason}</p>
                ) : null}
              </div>
              <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
