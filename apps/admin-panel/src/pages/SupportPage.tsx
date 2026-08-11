import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  DataTable,
  FormField,
  Textarea,
  useToast,
} from '@commercenest/ui';
import { LifeBuoy } from 'lucide-react';
import { adminApi, ApiClientError, unwrapList } from '../lib/api';
import { formatDate } from '../lib/format';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';

export function SupportPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  const q = useQuery({
    queryKey: ['admin', 'support-tickets'],
    queryFn: () => adminApi.listSupportTickets({ limit: 50 }),
  });

  const detailQ = useQuery({
    queryKey: ['admin', 'support-tickets', selectedId],
    queryFn: () => adminApi.getSupportTicket(selectedId!),
    enabled: !!selectedId,
  });

  const replyMut = useMutation({
    mutationFn: () => adminApi.replySupportTicket(selectedId!, { body: reply }),
    onSuccess: () => {
      toast({ title: 'Reply sent', tone: 'success' });
      setReply('');
      void qc.invalidateQueries({ queryKey: ['admin', 'support-tickets', selectedId] });
      void qc.invalidateQueries({ queryKey: ['admin', 'support-tickets'] });
    },
    onError: (err) =>
      toast({
        title: 'Reply failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const statusMut = useMutation({
    mutationFn: (status: string) =>
      adminApi.patchSupportTicket(selectedId!, { status }),
    onSuccess: () => {
      toast({ title: 'Ticket updated', tone: 'success' });
      void qc.invalidateQueries({ queryKey: ['admin', 'support-tickets'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'support-tickets', selectedId] });
    },
    onError: (err) =>
      toast({
        title: 'Update failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const rows = useMemo(() => unwrapList(q.data), [q.data]);

  if (q.isLoading) return <PageSkeleton />;
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
        <h2 className="text-xl font-semibold">Support</h2>
        <p className="text-sm text-ink-secondary">
          Store owner support tickets across all tenants
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card elevated padding="none">
          {rows.length === 0 ? (
            <div className="p-8">
              <SoftEmpty
                icon={<LifeBuoy />}
                title="No open tickets"
                description="When store owners submit support requests, they appear here."
              />
            </div>
          ) : (
            <DataTable
              data={rows}
              getRowKey={(r) => r.id}
              columns={[
                {
                  key: 'subject',
                  header: 'Subject',
                  cell: (r) => (
                    <button
                      type="button"
                      className="text-left font-medium text-primary hover:underline"
                      onClick={() => setSelectedId(r.id)}
                    >
                      {r.subject}
                    </button>
                  ),
                },
                {
                  key: 'store',
                  header: 'Store',
                  cell: (r) => r.store?.name || r.storeId || '—',
                },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (r) => <Badge tone="info">{r.status || 'OPEN'}</Badge>,
                },
                {
                  key: 'created',
                  header: 'Created',
                  cell: (r) => formatDate(r.createdAt),
                },
              ]}
            />
          )}
        </Card>

        <Card elevated className="space-y-4">
          {!selectedId ? (
            <p className="text-sm text-ink-secondary">Select a ticket to view and reply.</p>
          ) : detailQ.isLoading ? (
            <p className="text-sm text-ink-secondary">Loading ticket…</p>
          ) : detailQ.isError ? (
            <ErrorState
              message={
                detailQ.error instanceof Error ? detailQ.error.message : undefined
              }
              onRetry={() => void detailQ.refetch()}
            />
          ) : (
            <>
              <div>
                <h3 className="text-lg font-semibold">{detailQ.data?.subject}</h3>
                <p className="text-sm text-ink-secondary">
                  {detailQ.data?.store?.name || detailQ.data?.storeId} ·{' '}
                  {detailQ.data?.status}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {['IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant="secondary"
                    loading={statusMut.isPending}
                    onClick={() => statusMut.mutate(status)}
                  >
                    Mark {status}
                  </Button>
                ))}
              </div>
              <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border border-line p-3">
                {(detailQ.data?.replies || []).map((r) => (
                  <div key={r.id} className="rounded-md bg-surface-muted px-3 py-2 text-sm">
                    <div className="mb-1 text-xs text-ink-secondary">
                      {(r as { author?: { name?: string } }).author?.name || 'Staff'} ·{' '}
                      {formatDate((r as { createdAt?: string }).createdAt)}
                    </div>
                    <div className="whitespace-pre-wrap">{r.body}</div>
                  </div>
                ))}
                {(detailQ.data?.replies || []).length === 0 ? (
                  <p className="text-sm text-ink-secondary">No replies yet.</p>
                ) : null}
              </div>
              <FormField label="Reply" htmlFor="support-reply">
                <Textarea
                  id="support-reply"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={4}
                />
              </FormField>
              <Button
                loading={replyMut.isPending}
                disabled={!reply.trim()}
                onClick={() => replyMut.mutate()}
              >
                Send reply
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
