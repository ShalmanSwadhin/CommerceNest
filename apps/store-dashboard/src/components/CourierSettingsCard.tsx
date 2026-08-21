import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Badge, Button, Card, FormField, Input, useToast } from '@commercenest/ui';
import { API_BASE, ApiClientError, storeApi, type CourierAccountRow, type CourierProviderInfo } from '../lib/api';
import { useStoreId } from '../stores/authStore';

function ProviderRow({
  provider,
  account,
}: {
  provider: CourierProviderInfo;
  account: CourierAccountRow | undefined;
}) {
  const storeId = useStoreId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(!account);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const webhookUrl = `${API_BASE}/api/public/webhooks/courier/${storeId}/${provider.id}`;

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['store', storeId, 'courier-accounts'] });

  const saveMut = useMutation({
    mutationFn: () =>
      storeApi.saveCourierAccount(storeId!, {
        provider: provider.id,
        credentials,
        enabled: account?.enabled ?? true,
        isDefault: true,
      }),
    onSuccess: () => {
      toast({ title: `${provider.label} credentials saved`, tone: 'success' });
      setEditing(false);
      setCredentials({});
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Could not save credentials',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const toggleMut = useMutation({
    mutationFn: (enabled: boolean) => storeApi.setCourierAccountEnabled(storeId!, account!.id, enabled),
    onSuccess: (_, enabled) => {
      toast({ title: enabled ? `${provider.label} enabled` : `${provider.label} disabled`, tone: 'success' });
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Could not update',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const testMut = useMutation({
    mutationFn: () => storeApi.testCourierConnection(storeId!, account!.id),
    onSuccess: (res) => {
      toast({
        title: res.ok ? 'Connection successful' : 'Connection failed',
        description: res.message,
        tone: res.ok ? 'success' : 'danger',
      });
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Could not test connection',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const deleteMut = useMutation({
    mutationFn: () => storeApi.deleteCourierAccount(storeId!, account!.id),
    onSuccess: () => {
      toast({ title: `${provider.label} disconnected`, tone: 'caution' });
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Could not disconnect',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  return (
    <div className="space-y-3 rounded-cn border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="font-medium">{provider.label}</h4>
          {account ? (
            <Badge tone={account.enabled ? 'success' : 'neutral'}>
              {account.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          ) : (
            <Badge tone="neutral">Not connected</Badge>
          )}
          {account?.lastTestOk === true ? (
            <span className="flex items-center gap-1 text-xs text-[var(--cn-color-success)]">
              <CheckCircle2 className="size-3.5" /> Connection verified
            </span>
          ) : account?.lastTestOk === false ? (
            <span className="flex items-center gap-1 text-xs text-[var(--cn-color-danger)]">
              <XCircle className="size-3.5" /> {account.lastTestMessage || 'Connection failed'}
            </span>
          ) : null}
        </div>
        {account && !editing ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" loading={testMut.isPending} onClick={() => testMut.mutate()}>
              Test connection
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={toggleMut.isPending}
              onClick={() => toggleMut.mutate(!account.enabled)}
            >
              {account.enabled ? 'Disable' : 'Enable'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Update credentials
            </Button>
            <Button size="sm" variant="destructive" loading={deleteMut.isPending} onClick={() => deleteMut.mutate()}>
              Disconnect
            </Button>
          </div>
        ) : null}
      </div>

      {account ? (
        <div className="space-y-1">
          <div className="text-xs font-medium text-ink-secondary">
            Webhook URL — paste this into your {provider.label} dashboard for instant delivery
            updates (optional; without it, use "Sync status" on each order instead)
          </div>
          <div className="flex flex-wrap gap-2">
            <Input readOnly value={webhookUrl} className="min-w-0 flex-1 font-mono text-xs" />
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(webhookUrl);
                toast({ title: 'Webhook URL copied', tone: 'success' });
              }}
            >
              Copy
            </Button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="space-y-3">
          {provider.credentialFields.map((field) => (
            <FormField key={field.key} label={field.label} htmlFor={`courier-${provider.id}-${field.key}`}>
              <Input
                id={`courier-${provider.id}-${field.key}`}
                type={field.secret ? 'password' : 'text'}
                value={credentials[field.key] ?? ''}
                onChange={(e) => setCredentials((c) => ({ ...c, [field.key]: e.target.value }))}
                placeholder={field.optional ? 'Optional' : undefined}
              />
            </FormField>
          ))}
          <div className="flex gap-2">
            <Button size="sm" loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
              Save credentials
            </Button>
            {account ? (
              <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Store Admin → Settings → Delivery/Courier. Credentials are entered here
 * and go straight to the server encrypted at rest (lib/crypto.ts) — this
 * page never receives them back once saved, only enabled/lastTest status.
 */
export function CourierSettingsCard() {
  const storeId = useStoreId();

  const providersQ = useQuery({
    queryKey: ['store', storeId, 'courier-providers'],
    queryFn: () => storeApi.listCourierProviders(storeId!),
    enabled: !!storeId,
  });
  const accountsQ = useQuery({
    queryKey: ['store', storeId, 'courier-accounts'],
    queryFn: () => storeApi.listCourierAccounts(storeId!),
    enabled: !!storeId,
  });

  if (providersQ.isLoading || accountsQ.isLoading) return null;
  const providers = providersQ.data?.items ?? [];
  const accounts = accountsQ.data?.items ?? [];

  return (
    <Card elevated className="max-w-2xl space-y-4">
      <div>
        <h3 className="font-semibold">Delivery / Courier</h3>
        <p className="text-sm text-ink-secondary">
          Connect a courier account to create real shipments and get live tracking updates directly
          on your orders. Your API keys are encrypted and never shown again after saving.
        </p>
      </div>
      <div className="space-y-3">
        {providers.map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            account={accounts.find((a) => a.provider === provider.id)}
          />
        ))}
      </div>
    </Card>
  );
}
