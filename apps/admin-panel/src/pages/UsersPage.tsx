import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, DataTable, useToast } from '@commercenest/ui';
import { adminApi, ApiClientError, type AdminUser, unwrapList } from '../lib/api';
import { formatDate } from '../lib/format';
import { ErrorState, PageSkeleton } from '../components/QueryState';

const ROLE_OPTIONS = [
  'STORE_OWNER',
  'STORE_MANAGER',
  'INVENTORY_MANAGER',
  'ORDER_MANAGER',
  'CUSTOMER_SUPPORT',
] as const;

const statusTone: Record<string, 'success' | 'caution' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  INVITED: 'caution',
  SUSPENDED: 'danger',
};

export function UsersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => adminApi.listUsers({ limit: 100 }),
  });

  const patchMut = useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) =>
      adminApi.patchUser(vars.id, vars.body),
    onSuccess: () => {
      toast({ title: 'User updated', tone: 'success' });
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) =>
      toast({
        title: 'Update failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError) {
    return (
      <ErrorState
        message={q.error instanceof Error ? q.error.message : undefined}
        onRetry={() => void q.refetch()}
      />
    );
  }

  const rows = unwrapList<AdminUser>(q.data);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Users</h2>
        <p className="text-sm text-ink-secondary">
          Platform staff and store operator accounts
        </p>
      </div>
      <Card elevated padding="none">
        <DataTable
          data={rows}
          getRowKey={(r) => r.id}
          state={rows.length ? 'ready' : 'empty'}
          emptyTitle="No users"
          emptyDescription="Users appear after store creation and staff invites."
          columns={[
            { key: 'name', header: 'Name', cell: (r) => r.name },
            { key: 'email', header: 'Email', cell: (r) => r.email },
            {
              key: 'role',
              header: 'Role',
              cell: (r) => (
                <select
                  className="h-9 rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-2 text-sm"
                  value={r.role}
                  disabled={patchMut.isPending}
                  onChange={(e) =>
                    patchMut.mutate({ id: r.id, body: { role: e.target.value } })
                  }
                >
                  {!ROLE_OPTIONS.includes(r.role as (typeof ROLE_OPTIONS)[number]) && (
                    <option value={r.role}>{r.role}</option>
                  )}
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              ),
            },
            {
              key: 'store',
              header: 'Store',
              cell: (r) => r.store?.name || r.storeId?.slice(0, 8) || 'Platform',
            },
            {
              key: 'status',
              header: 'Status',
              cell: (r) => (
                <Badge tone={statusTone[r.status || ''] || 'neutral'}>
                  {r.status || 'UNKNOWN'}
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
              cell: (r) =>
                r.status === 'SUSPENDED' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={patchMut.isPending}
                    onClick={() =>
                      patchMut.mutate({ id: r.id, body: { status: 'ACTIVE' } })
                    }
                  >
                    Activate
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    loading={patchMut.isPending}
                    onClick={() =>
                      patchMut.mutate({ id: r.id, body: { status: 'SUSPENDED' } })
                    }
                  >
                    Deactivate
                  </Button>
                ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
