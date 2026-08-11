import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, FormField, Input, useToast } from '@commercenest/ui';
import { adminApi, ApiClientError } from '../lib/api';
import { ErrorState, PageSkeleton } from '../components/QueryState';

function settingsMap(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  const obj = data as { items?: Array<{ key: string; value: unknown }> };
  if (Array.isArray(obj.items)) {
    return Object.fromEntries(obj.items.map((i) => [i.key, i.value]));
  }
  return data as Record<string, unknown>;
}

export function SettingsPage() {
  const { toast } = useToast();
  const [supportEmail, setSupportEmail] = useState('');
  const [platformName, setPlatformName] = useState('CommerceNest');

  const q = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => adminApi.settings(),
    retry: false,
  });

  useEffect(() => {
    if (!q.data) return;
    const map = settingsMap(q.data);
    if (typeof map.supportEmail === 'string') setSupportEmail(map.supportEmail);
    if (typeof map.platformName === 'string') setPlatformName(map.platformName);
  }, [q.data]);

  const mut = useMutation({
    mutationFn: () =>
      adminApi.updateSettings([
        { key: 'supportEmail', value: supportEmail },
        { key: 'platformName', value: platformName },
      ]),
    onSuccess: () => toast({ title: 'Settings saved', tone: 'success' }),
    onError: (err) =>
      toast({
        title: 'Save failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  if (q.isLoading) return <PageSkeleton rows={2} />;
  if (q.isError && !(q.error instanceof ApiClientError && q.error.status === 404)) {
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
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-sm text-ink-secondary">Platform-level configuration</p>
      </div>
      {q.isError && (
        <Alert tone="caution" title="Settings endpoint unavailable">
          Showing local editable fields. Saving requires <code>/api/admin/settings</code>.
        </Alert>
      )}
      <Card elevated className="max-w-xl space-y-4">
        <FormField label="Platform name" htmlFor="platformName">
          <Input
            id="platformName"
            value={platformName}
            onChange={(e) => setPlatformName(e.target.value)}
          />
        </FormField>
        <FormField label="Support email" htmlFor="supportEmail">
          <Input
            id="supportEmail"
            type="email"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
          />
        </FormField>
        <Button loading={mut.isPending} onClick={() => mut.mutate()}>
          Save changes
        </Button>
      </Card>
    </div>
  );
}
