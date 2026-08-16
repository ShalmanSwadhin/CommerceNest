import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, FormField, Input, Modal, useToast } from '@commercenest/ui';
import { Search } from 'lucide-react';
import { adminApi, ApiClientError, type DomainRequestRow } from '../lib/api';
import { formatDate } from '../lib/format';
import { ErrorState, PageSkeleton } from '../components/QueryState';

const statusTone: Record<DomainRequestRow['status'], 'success' | 'caution' | 'danger' | 'neutral'> = {
  PENDING: 'caution',
  APPROVED: 'neutral',
  ASSIGNED: 'success',
  REJECTED: 'danger',
};

/**
 * Requests for an allocated *.commercenest address — distinct from a
 * merchant's own self-service custom-domain flow (Store detail page),
 * which needs no admin review. See domain.service.ts's doc comment.
 */
export function DomainRequestsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [rejectTarget, setRejectTarget] = useState<DomainRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const q = useQuery({
    queryKey: ['admin', 'domain-requests', status],
    queryFn: () => adminApi.listDomainRequests({ status: status || undefined, limit: 100 }),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin', 'domain-requests'] });

  const approveMut = useMutation({
    mutationFn: (id: string) => adminApi.approveDomainRequest(id),
    onSuccess: () => {
      toast({ title: 'Request approved', tone: 'success' });
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Approve failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const assignMut = useMutation({
    mutationFn: (id: string) => adminApi.assignDomainRequest(id),
    onSuccess: () => {
      toast({ title: 'Domain assigned', description: 'The address is now live for this store.', tone: 'success' });
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Assign failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const rejectMut = useMutation({
    mutationFn: () => adminApi.rejectDomainRequest(rejectTarget!.id, rejectReason || undefined),
    onSuccess: () => {
      toast({ title: 'Request rejected', tone: 'caution' });
      setRejectTarget(null);
      setRejectReason('');
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Reject failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const requests = q.data?.items ?? [];

  if (q.isLoading) return <PageSkeleton rows={6} />;
  if (q.isError) {
    return (
      <ErrorState
        message={q.error instanceof Error ? q.error.message : undefined}
        onRetry={() => void q.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Domain requests</h2>
        <p className="text-sm text-ink-secondary">
          Merchants requesting an allocated *.commercenest address — review and assign.
        </p>
      </div>

      <Card elevated padding="md" className="flex items-center gap-3">
        <Search className="size-4 text-ink-tertiary" />
        <select
          className="h-10 rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </Card>

      {requests.length === 0 ? (
        <Card elevated padding="md">
          <p className="text-sm text-ink-secondary">No domain requests found.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id} elevated padding="md" className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">{r.requestedHostname}</span>
                  <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                </div>
                <p className="text-xs text-ink-secondary">
                  {r.store.name} ({r.store.slug}) — requested {formatDate(r.createdAt)}
                </p>
                {r.note ? <p className="mt-1 text-xs text-ink-tertiary">"{r.note}"</p> : null}
                {r.rejectionReason ? (
                  <p className="mt-1 text-xs text-red-600">Rejected: {r.rejectionReason}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {r.status === 'PENDING' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={approveMut.isPending && approveMut.variables === r.id}
                    onClick={() => approveMut.mutate(r.id)}
                  >
                    Approve
                  </Button>
                ) : null}
                {r.status === 'PENDING' || r.status === 'APPROVED' ? (
                  <Button
                    size="sm"
                    loading={assignMut.isPending && assignMut.variables === r.id}
                    onClick={() => assignMut.mutate(r.id)}
                  >
                    Assign
                  </Button>
                ) : null}
                {r.status !== 'REJECTED' && r.status !== 'ASSIGNED' ? (
                  <Button size="sm" variant="ghost" onClick={() => setRejectTarget(r)}>
                    Reject
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject domain request"
        description={
          rejectTarget ? `Reject ${rejectTarget.requestedHostname} for ${rejectTarget.store.name}?` : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={rejectMut.isPending} onClick={() => rejectMut.mutate()}>
              Reject
            </Button>
          </>
        }
      >
        <FormField label="Reason (optional)" htmlFor="domainRejectReason">
          <Input
            id="domainRejectReason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Inappropriate name, conflicts with a trademark..."
          />
        </FormField>
      </Modal>
    </div>
  );
}
