import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  DataTable,
  FormField,
  Input,
  Modal,
  Textarea,
  useToast,
} from '@commercenest/ui';
import { Megaphone } from 'lucide-react';
import { adminApi, ApiClientError, type Announcement, unwrapList } from '../lib/api';
import { formatDate } from '../lib/format';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';

const statusTone: Record<string, 'success' | 'caution' | 'danger' | 'neutral'> = {
  PUBLISHED: 'success',
  SCHEDULED: 'caution',
  DRAFT: 'neutral',
  EXPIRED: 'danger',
  ARCHIVED: 'neutral',
};

export function AnnouncementsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [editTarget, setEditTarget] = useState<Announcement | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editStatus, setEditStatus] = useState('DRAFT');

  const q = useQuery({
    queryKey: ['admin', 'announcements'],
    queryFn: () => adminApi.listAnnouncements({ limit: 50 }),
  });

  const create = useMutation({
    mutationFn: () =>
      adminApi.createAnnouncement({
        title: title.trim(),
        body: body.trim(),
        status: 'PUBLISHED',
        audience: { all: true },
      }),
    onSuccess: async () => {
      setTitle('');
      setBody('');
      toast({ title: 'Announcement published', tone: 'success' });
      await qc.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    },
    onError: (err: Error) => toast({ title: err.message, tone: 'danger' }),
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) =>
      adminApi.patchAnnouncement(vars.id, vars.body),
    onSuccess: async () => {
      toast({ title: 'Announcement updated', tone: 'success' });
      setEditTarget(null);
      await qc.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    },
    onError: (err) =>
      toast({
        title: 'Update failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const archive = useMutation({
    mutationFn: (id: string) => adminApi.patchAnnouncement(id, { status: 'ARCHIVED' }),
    onSuccess: async () => {
      toast({ title: 'Announcement archived', tone: 'success' });
      await qc.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    },
    onError: (err) =>
      toast({
        title: 'Archive failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  function openEdit(a: Announcement) {
    setEditTarget(a);
    setEditTitle(a.title);
    setEditBody(a.body || '');
    setEditStatus(a.status || 'DRAFT');
  }

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError) {
    return (
      <ErrorState
        message={q.error instanceof Error ? q.error.message : undefined}
        onRetry={() => void q.refetch()}
      />
    );
  }

  const rows = unwrapList(q.data);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Announcements</h2>
        <p className="text-sm text-ink-secondary">
          Broadcast messages to store operators across the platform
        </p>
      </div>

      <Card elevated className="space-y-3 p-4">
        <h3 className="text-sm font-semibold">New announcement</h3>
        <FormField label="Title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Maintenance window"
          />
        </FormField>
        <FormField label="Body">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Details for store owners..."
          />
        </FormField>
        <Button
          loading={create.isPending}
          disabled={!title.trim() || !body.trim()}
          onClick={() => create.mutate()}
        >
          Publish
        </Button>
      </Card>

      <Card elevated padding="none">
        {rows.length === 0 ? (
          <div className="p-8">
            <SoftEmpty
              icon={<Megaphone />}
              title="No announcements yet"
              description="Publish your first platform announcement above."
            />
          </div>
        ) : (
          <DataTable
            data={rows}
            getRowKey={(r) => r.id}
            columns={[
              { key: 'title', header: 'Title', cell: (r) => r.title },
              {
                key: 'status',
                header: 'Status',
                cell: (r) => (
                  <Badge tone={statusTone[r.status || ''] || 'neutral'}>
                    {r.status || '-'}
                  </Badge>
                ),
              },
              {
                key: 'created',
                header: 'Created',
                cell: (r) => formatDate(r.createdAt),
              },
              {
                key: 'actions',
                header: 'Actions',
                cell: (r) => (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                      Edit
                    </Button>
                    {r.status !== 'ARCHIVED' && (
                      <Button
                        size="sm"
                        variant="destructive"
                        loading={archive.isPending}
                        onClick={() => archive.mutate(r.id)}
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit announcement"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              loading={update.isPending}
              disabled={!editTitle.trim() || !editBody.trim()}
              onClick={() =>
                editTarget &&
                update.mutate({
                  id: editTarget.id,
                  body: {
                    title: editTitle.trim(),
                    body: editBody.trim(),
                    status: editStatus,
                  },
                })
              }
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Title">
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
          </FormField>
          <FormField label="Body">
            <Textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={4}
            />
          </FormField>
          <FormField label="Status">
            <select
              className="h-10 w-full rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-sm"
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
            >
              <option value="DRAFT">Draft</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="PUBLISHED">Published</option>
              <option value="EXPIRED">Expired</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
