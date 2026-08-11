import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  DataTable,
  FormField,
  Input,
  Textarea,
  useToast,
} from '@commercenest/ui';
import { ApiClientError, storeApi } from '../lib/api';
import { ErrorState, PageSkeleton } from '../components/QueryState';
import { useStoreId } from '../stores/authStore';
import { formatDate } from '../lib/format';

export function SupportPage() {
  const storeId = useStoreId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ subject: '', body: '' });

  const q = useQuery({
    queryKey: ['store', storeId, 'support-tickets'],
    queryFn: () => storeApi.listSupportTickets(storeId!),
    enabled: !!storeId,
  });

  const rows = useMemo(() => q.data?.items ?? [], [q.data]);

  const mut = useMutation({
    mutationFn: () =>
      storeApi.createSupportTicket(storeId!, {
        subject: form.subject,
        body: form.body,
      }),
    onSuccess: () => {
      toast({ title: 'Support ticket created', tone: 'success' });
      setForm({ subject: '', body: '' });
      void qc.invalidateQueries({ queryKey: ['store', storeId, 'support-tickets'] });
    },
    onError: (err) =>
      toast({
        title: 'Could not create ticket',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  if (!storeId) return <ErrorState message="Missing store context." />;
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
          Contact CommerceNest platform support for this store
        </p>
      </div>

      <Card elevated className="max-w-2xl space-y-3">
        <FormField label="Subject" htmlFor="subject">
          <Input
            id="subject"
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          />
        </FormField>
        <FormField label="Message" htmlFor="body">
          <Textarea
            id="body"
            rows={5}
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          />
        </FormField>
        <Button
          loading={mut.isPending}
          disabled={!form.subject.trim() || !form.body.trim()}
          onClick={() => mut.mutate()}
        >
          Submit ticket
        </Button>
      </Card>

      <Card elevated padding="none">
        <DataTable
          data={rows}
          getRowKey={(r) => r.id}
          state={rows.length ? 'ready' : 'empty'}
          emptyTitle="No tickets yet"
          emptyDescription="Submit a ticket above if you need platform help."
          columns={[
            { key: 'subject', header: 'Subject', cell: (r) => r.subject },
            {
              key: 'status',
              header: 'Status',
              cell: (r) => <Badge tone="info">{r.status}</Badge>,
            },
            {
              key: 'created',
              header: 'Created',
              cell: (r) => formatDate(r.createdAt),
            },
          ]}
        />
      </Card>
    </div>
  );
}
