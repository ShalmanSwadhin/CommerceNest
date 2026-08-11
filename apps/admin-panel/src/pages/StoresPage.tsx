import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  DataTable,
  FormField,
  Input,
  Modal,
  Pagination,
  useToast,
} from '@commercenest/ui';
import { Plus, Search } from 'lucide-react';
import {
  adminApi,
  ApiClientError,
  type StoreRow,
  unwrapList,
  unwrapTotal,
} from '../lib/api';
import { formatDate } from '../lib/format';
import { ErrorState, PageSkeleton } from '../components/QueryState';

const statusTone: Record<string, 'success' | 'caution' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  PENDING_SETUP: 'caution',
  SUSPENDED: 'danger',
  ARCHIVED: 'neutral',
};

export function StoresPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<StoreRow | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<StoreRow | null>(null);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    ownerEmail: '',
    ownerName: '',
    category: '',
    planTier: 'starter',
  });

  const q = useQuery({
    queryKey: ['admin', 'stores', search, status, page],
    queryFn: () => adminApi.listStores({ search, status: status || undefined, page, limit: 10 }),
  });

  const createMut = useMutation({
    mutationFn: () => adminApi.createStore(form),
    onSuccess: () => {
      toast({ title: 'Store created', tone: 'success' });
      setCreateOpen(false);
      void qc.invalidateQueries({ queryKey: ['admin', 'stores'] });
    },
    onError: (err) =>
      toast({
        title: 'Create failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const suspendMut = useMutation({
    mutationFn: () => adminApi.suspendStore(suspendTarget!.id, suspendReason),
    onSuccess: () => {
      toast({ title: 'Store suspended', tone: 'caution' });
      setSuspendTarget(null);
      setSuspendReason('');
      void qc.invalidateQueries({ queryKey: ['admin', 'stores'] });
    },
    onError: (err) =>
      toast({
        title: 'Suspend failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const archiveMut = useMutation({
    mutationFn: () => adminApi.archiveStore(archiveTarget!.id),
    onSuccess: () => {
      toast({ title: 'Store archived', tone: 'success' });
      setArchiveTarget(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'stores'] });
    },
    onError: (err) =>
      toast({
        title: 'Archive failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const stores = useMemo(() => unwrapList(q.data), [q.data]);
  const total = unwrapTotal(q.data);

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink">Stores</h2>
          <p className="text-sm text-ink-secondary">Provision, suspend, and impersonate tenants</p>
        </div>
        <Button leftIcon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
          Create Store
        </Button>
      </div>

      <Card elevated padding="md" className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-tertiary" />
          <Input
            className="pl-9"
            placeholder="Search stores..."
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </div>
        <select
          className="h-10 rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-sm"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING_SETUP">Pending setup</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </Card>

      <Card elevated padding="none">
        <DataTable
          data={stores}
          getRowKey={(r) => r.id}
          state={stores.length ? 'ready' : 'empty'}
          emptyTitle="No stores found"
          emptyDescription="Create a store to provision the first tenant."
          columns={[
            {
              key: 'name',
              header: 'Store',
              cell: (r) => (
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-ink-tertiary">{r.slug}</div>
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (r) => <Badge tone={statusTone[r.status] || 'neutral'}>{r.status}</Badge>,
            },
            { key: 'plan', header: 'Plan', cell: (r) => r.planTier || '-' },
            { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt) },
            {
              key: 'actions',
              header: 'Actions',
              cell: (r) => (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/stores/${r.id}`)}>
                    View
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/themes/${r.id}`)}>
                    Edit Theme
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        const res = await adminApi.impersonate(r.id);
                        const dashboardBase = (
                          import.meta.env.VITE_STORE_DASHBOARD_URL ||
                          `${window.location.protocol}//app.localhost:${window.location.port || '8080'}`
                        ).replace(/\/$/, '');
                        toast({ title: 'Impersonation started', tone: 'caution' });
                        window.open(
                          `${dashboardBase}/?impersonation_handoff=${encodeURIComponent(res.handoffCode)}`,
                          '_blank',
                        );
                      } catch (err) {
                        toast({
                          title: 'Impersonate failed',
                          description:
                            err instanceof ApiClientError ? err.message : 'Unknown error',
                          tone: 'danger',
                        });
                      }
                    }}
                  >
                    Impersonate
                  </Button>
                  {r.status === 'SUSPENDED' ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await adminApi.reactivateStore(r.id);
                            toast({ title: 'Store reactivated', tone: 'success' });
                            void qc.invalidateQueries({ queryKey: ['admin', 'stores'] });
                          } catch (err) {
                            toast({
                              title: 'Reactivate failed',
                              description:
                                err instanceof ApiClientError ? err.message : 'Unknown error',
                              tone: 'danger',
                            });
                          }
                        }}
                      >
                        Reactivate
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setArchiveTarget(r)}>
                        Archive
                      </Button>
                    </>
                  ) : r.status === 'ARCHIVED' ? (
                    <Badge tone="neutral">Archived</Badge>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={() => setSuspendTarget(r)}>
                      Suspend
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
        <div className="border-t border-line px-4 py-3">
          <Pagination page={page} pageSize={10} total={total} onPageChange={setPage} />
        </div>
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create store"
        description="Provision a new tenant with an owner invite."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button loading={createMut.isPending} onClick={() => createMut.mutate()}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {(
            [
              ['name', 'Store name'],
              ['slug', 'Slug'],
              ['ownerName', 'Owner name'],
              ['ownerEmail', 'Owner email'],
              ['category', 'Category'],
            ] as const
          ).map(([key, label]) => (
            <FormField key={key} label={label} htmlFor={key}>
              <Input
                id={key}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </FormField>
          ))}
          <FormField label="Plan" htmlFor="planTier">
            <select
              id="planTier"
              className="h-10 w-full rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-sm"
              value={form.planTier}
              onChange={(e) => setForm((f) => ({ ...f, planTier: e.target.value }))}
            >
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="pro">Pro</option>
            </select>
          </FormField>
        </div>
      </Modal>

      <Modal
        open={!!suspendTarget}
        onClose={() => setSuspendTarget(null)}
        title="Suspend store"
        description={`Suspend ${suspendTarget?.name ?? 'store'}? Orders and storefront access will be blocked.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSuspendTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={suspendMut.isPending}
              onClick={() => suspendMut.mutate()}
            >
              Suspend
            </Button>
          </>
        }
      >
        <FormField label="Reason" htmlFor="reason" required>
          <Input
            id="reason"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            placeholder="Policy violation, non-payment..."
          />
        </FormField>
      </Modal>

      <Modal
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title="Archive store"
        description={`Archive ${archiveTarget?.name ?? 'store'}? This is a further step beyond suspension and typically precedes permanent removal. The store will no longer appear as active anywhere on the platform.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setArchiveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={archiveMut.isPending}
              onClick={() => archiveMut.mutate()}
            >
              Archive
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-secondary">This action can be reversed by support engineering only.</p>
      </Modal>
    </div>
  );
}
