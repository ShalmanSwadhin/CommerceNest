import { useEffect, useMemo, useState } from 'react';
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

const STAFF_ROLES = [
  'STORE_MANAGER',
  'INVENTORY_MANAGER',
  'ORDER_MANAGER',
  'CUSTOMER_SUPPORT',
] as const;

export function SettingsPage() {
  const storeId = useStoreId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    tagline: '',
    category: '',
    bkashNumber: '',
    bkashInstructions: '',
  });
  const [invite, setInvite] = useState({
    name: '',
    email: '',
    role: 'STORE_MANAGER' as (typeof STAFF_ROLES)[number],
  });

  const settingsQ = useQuery({
    queryKey: ['store', storeId, 'settings'],
    queryFn: () => storeApi.getSettings(storeId!),
    enabled: !!storeId,
  });

  const staffQ = useQuery({
    queryKey: ['store', storeId, 'staff'],
    queryFn: () => storeApi.listStaff(storeId!),
    enabled: !!storeId,
  });

  useEffect(() => {
    const data = settingsQ.data;
    if (!data) return;
    setForm({
      tagline: String(data.tagline ?? ''),
      category: String(data.category ?? ''),
      bkashNumber: String(data.bkashNumber ?? ''),
      bkashInstructions: String(data.bkashInstructions ?? ''),
    });
  }, [settingsQ.data]);

  const staff = useMemo(() => {
    if (!staffQ.data) return [];
    if (Array.isArray(staffQ.data)) return staffQ.data;
    return staffQ.data.items ?? staffQ.data.data ?? [];
  }, [staffQ.data]);

  const mut = useMutation({
    mutationFn: () => storeApi.updateSettings(storeId!, form),
    onSuccess: () => {
      toast({ title: 'Settings saved', tone: 'success' });
      void qc.invalidateQueries({ queryKey: ['store', storeId, 'settings'] });
    },
    onError: (err) =>
      toast({
        title: 'Save failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const inviteMut = useMutation({
    mutationFn: () =>
      storeApi.inviteStaff(storeId!, {
        name: invite.name,
        email: invite.email,
        role: invite.role,
      }),
    onSuccess: () => {
      toast({ title: 'Staff invited', tone: 'success' });
      setInvite({ name: '', email: '', role: 'STORE_MANAGER' });
      void qc.invalidateQueries({ queryKey: ['store', storeId, 'staff'] });
    },
    onError: (err) =>
      toast({
        title: 'Invite failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  if (!storeId) return <ErrorState message="Missing store context." />;
  if (settingsQ.isLoading) return <PageSkeleton />;
  if (settingsQ.isError) {
    return (
      <ErrorState
        message={settingsQ.error instanceof Error ? settingsQ.error.message : undefined}
        onRetry={() => void settingsQ.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Store settings</h2>
        <p className="text-sm text-ink-secondary">Business info, bKash details, and staff</p>
      </div>
      <Card elevated className="max-w-2xl space-y-3">
        {(
          [
            ['tagline', 'Tagline'],
            ['category', 'Category'],
            ['bkashNumber', 'bKash number'],
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
        <FormField label="bKash instructions" htmlFor="bkashInstructions">
          <Textarea
            id="bkashInstructions"
            value={form.bkashInstructions}
            onChange={(e) => setForm((f) => ({ ...f, bkashInstructions: e.target.value }))}
          />
        </FormField>
        <Button loading={mut.isPending} onClick={() => mut.mutate()}>
          Save settings
        </Button>
      </Card>

      <Card elevated className="max-w-2xl space-y-3">
        <h3 className="font-semibold">Invite staff</h3>
        <FormField label="Name" htmlFor="invite-name">
          <Input
            id="invite-name"
            value={invite.name}
            onChange={(e) => setInvite((f) => ({ ...f, name: e.target.value }))}
          />
        </FormField>
        <FormField label="Email" htmlFor="invite-email">
          <Input
            id="invite-email"
            type="email"
            value={invite.email}
            onChange={(e) => setInvite((f) => ({ ...f, email: e.target.value }))}
          />
        </FormField>
        <FormField label="Role" htmlFor="invite-role">
          <select
            id="invite-role"
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
            value={invite.role}
            onChange={(e) =>
              setInvite((f) => ({
                ...f,
                role: e.target.value as (typeof STAFF_ROLES)[number],
              }))
            }
          >
            {STAFF_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </FormField>
        <Button
          loading={inviteMut.isPending}
          disabled={!invite.name.trim() || !invite.email.trim()}
          onClick={() => inviteMut.mutate()}
        >
          Send invite
        </Button>
      </Card>

      <Card elevated padding="none">
        <div className="border-b border-line px-6 py-4">
          <h3 className="font-semibold">Staff</h3>
        </div>
        <DataTable
          data={staff}
          getRowKey={(r) => r.id}
          state={staffQ.isError ? 'error' : staff.length ? 'ready' : 'empty'}
          errorMessage={staffQ.error instanceof Error ? staffQ.error.message : undefined}
          emptyTitle="No staff listed"
          emptyDescription="Invite managers and support staff for this store."
          columns={[
            { key: 'name', header: 'Name', cell: (r) => r.name },
            { key: 'email', header: 'Email', cell: (r) => r.email },
            { key: 'role', header: 'Role', cell: (r) => <Badge tone="neutral">{r.role}</Badge> },
            {
              key: 'status',
              header: 'Status',
              cell: (r) => <Badge tone="info">{r.status || 'ACTIVE'}</Badge>,
            },
          ]}
        />
      </Card>
    </div>
  );
}
