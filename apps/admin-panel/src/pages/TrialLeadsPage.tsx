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
import { Copy, ExternalLink, Search } from 'lucide-react';
import { adminApi, ApiClientError, type TrialLead } from '../lib/api';
import { formatDate } from '../lib/format';
import { ErrorState, PageSkeleton } from '../components/QueryState';

const statusTone: Record<TrialLead['status'], 'success' | 'caution' | 'danger' | 'neutral'> = {
  LEAD: 'neutral',
  TRIAL_PENDING: 'caution',
  TRIAL_ACTIVE: 'success',
  TRIAL_EXPIRED: 'danger',
  CONVERTED: 'success',
  REJECTED: 'danger',
};

const statusLabel: Record<TrialLead['status'], string> = {
  LEAD: 'Lead',
  TRIAL_PENDING: 'Trial pending',
  TRIAL_ACTIVE: 'Trial active',
  TRIAL_EXPIRED: 'Trial expired',
  CONVERTED: 'Converted',
  REJECTED: 'Rejected',
};

export function TrialLeadsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState<TrialLead | null>(null);
  const [extendTarget, setExtendTarget] = useState<TrialLead | null>(null);
  const [extendDays, setExtendDays] = useState('7');
  const [convertTarget, setConvertTarget] = useState<TrialLead | null>(null);
  const [convertPlan, setConvertPlan] = useState('starter');
  const [rejectTarget, setRejectTarget] = useState<TrialLead | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const q = useQuery({
    queryKey: ['admin', 'trial-leads', search, status],
    queryFn: () =>
      adminApi.listTrialLeads({ search: search || undefined, status: status || undefined, limit: 100 }),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin', 'trial-leads'] });

  const extendMut = useMutation({
    mutationFn: () => adminApi.extendTrial(extendTarget!.id, Number(extendDays)),
    onSuccess: () => {
      toast({ title: 'Trial extended', tone: 'success' });
      setExtendTarget(null);
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Extend failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const convertMut = useMutation({
    mutationFn: () => adminApi.convertTrial(convertTarget!.id, convertPlan),
    onSuccess: () => {
      toast({ title: 'Converted to paid store', tone: 'success' });
      setConvertTarget(null);
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Convert failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const rejectMut = useMutation({
    mutationFn: () => adminApi.rejectTrial(rejectTarget!.id, rejectReason || undefined),
    onSuccess: () => {
      toast({ title: 'Lead rejected', tone: 'caution' });
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

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError) {
    return (
      <ErrorState
        message={q.error instanceof Error ? q.error.message : undefined}
        onRetry={() => void q.refetch()}
      />
    );
  }

  const rows = q.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Leads & Trials</h1>
        <p className="text-sm text-ink-secondary">
          Prospects who requested a free trial storefront — each gets a real, isolated
          tenant store immediately.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-tertiary" />
          <Input
            placeholder="Search leads…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          className="h-10 rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {Object.entries(statusLabel).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <Card elevated padding="none">
        <DataTable
          data={rows}
          getRowKey={(r) => r.id}
          state={rows.length ? 'ready' : 'empty'}
          emptyTitle="No trial leads yet"
          emptyDescription="Trial requests from the marketing site will show up here."
          columns={[
            {
              key: 'business',
              header: 'Business',
              cell: (r) => (
                <div>
                  <p className="font-medium text-ink">{r.businessName}</p>
                  <p className="text-xs text-ink-secondary">{r.prospectName}</p>
                </div>
              ),
            },
            {
              key: 'contact',
              header: 'Contact',
              cell: (r) => (
                <div className="text-xs text-ink-secondary">
                  <p>{r.email}</p>
                  <p>{r.phone}</p>
                </div>
              ),
            },
            { key: 'category', header: 'Category', cell: (r) => r.category || '—' },
            {
              key: 'status',
              header: 'Status',
              cell: (r) => <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>,
            },
            {
              key: 'expiry',
              header: 'Trial expiry',
              cell: (r) => (r.store?.trialExpiresAt ? formatDate(r.store.trialExpiresAt) : '—'),
            },
            { key: 'created', header: 'Created', cell: (r) => formatDate(r.createdAt) },
            {
              key: 'actions',
              header: '',
              cell: (r) => (
                <div className="flex justify-end gap-1">
                  {r.trialUrl ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Open trial store"
                      onClick={() => window.open(r.trialUrl!, '_blank')}
                    >
                      <ExternalLink className="size-3.5" />
                    </Button>
                  ) : null}
                  {r.trialUrl ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Copy trial link"
                      onClick={() => {
                        void navigator.clipboard.writeText(r.trialUrl!);
                        toast({ title: 'Trial link copied', tone: 'success' });
                      }}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => setDetail(r)}>
                    Details
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.businessName}
        description={detail ? statusLabel[detail.status] : undefined}
        size="lg"
        footer={
          detail ? (
            <div className="flex flex-wrap justify-end gap-2">
              {detail.status !== 'REJECTED' && detail.status !== 'CONVERTED' ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setRejectTarget(detail);
                      setDetail(null);
                    }}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setExtendTarget(detail);
                      setDetail(null);
                    }}
                  >
                    Extend trial
                  </Button>
                  <Button
                    onClick={() => {
                      setConvertTarget(detail);
                      setDetail(null);
                    }}
                  >
                    Convert to active store
                  </Button>
                </>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {detail ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-ink-tertiary">Prospect</p>
                <p className="text-ink">{detail.prospectName}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-ink-tertiary">Category</p>
                <p className="text-ink">{detail.category || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-ink-tertiary">Email</p>
                <p className="text-ink">{detail.email}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-ink-tertiary">Phone</p>
                <p className="text-ink">{detail.phone}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-ink-tertiary">Catalog size</p>
                <p className="text-ink">{detail.catalogSize || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-ink-tertiary">Trial expiry</p>
                <p className="text-ink">
                  {detail.store?.trialExpiresAt ? formatDate(detail.store.trialExpiresAt) : '—'}
                </p>
              </div>
            </div>
            {detail.message ? (
              <div>
                <p className="text-xs font-semibold uppercase text-ink-tertiary">Message</p>
                <p className="mt-1 rounded-lg bg-surface-raised p-3 text-ink">{detail.message}</p>
              </div>
            ) : null}
            {detail.trialUrl ? (
              <div>
                <p className="text-xs font-semibold uppercase text-ink-tertiary">Trial URL</p>
                <a
                  href={detail.trialUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block break-all font-mono text-xs text-primary hover:underline"
                >
                  {detail.trialUrl}
                </a>
              </div>
            ) : null}
            {detail.rejectionReason ? (
              <div>
                <p className="text-xs font-semibold uppercase text-ink-tertiary">Rejection reason</p>
                <p className="text-ink">{detail.rejectionReason}</p>
              </div>
            ) : null}
            <a
              href={`mailto:${detail.email}`}
              className="inline-block text-xs font-semibold text-primary hover:underline"
            >
              Contact lead by email
            </a>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!extendTarget}
        onClose={() => setExtendTarget(null)}
        title="Extend trial"
        footer={
          <>
            <Button variant="secondary" onClick={() => setExtendTarget(null)}>
              Cancel
            </Button>
            <Button loading={extendMut.isPending} onClick={() => extendMut.mutate()}>
              Extend
            </Button>
          </>
        }
      >
        <FormField label="Additional days" htmlFor="extendDays">
          <Input
            id="extendDays"
            type="number"
            min={1}
            max={90}
            value={extendDays}
            onChange={(e) => setExtendDays(e.target.value)}
          />
        </FormField>
      </Modal>

      <Modal
        open={!!convertTarget}
        onClose={() => setConvertTarget(null)}
        title="Convert to active store"
        description="This ends the trial and activates the store on a paid plan."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConvertTarget(null)}>
              Cancel
            </Button>
            <Button loading={convertMut.isPending} onClick={() => convertMut.mutate()}>
              Convert
            </Button>
          </>
        }
      >
        <FormField label="Plan" htmlFor="convertPlan">
          <select
            id="convertPlan"
            className="h-10 w-full rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-sm"
            value={convertPlan}
            onChange={(e) => setConvertPlan(e.target.value)}
          >
            <option value="starter">Starter</option>
            <option value="business">Business</option>
            <option value="pro">Pro</option>
          </select>
        </FormField>
      </Modal>

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject lead"
        description="The trial store will be suspended. Data is preserved, not deleted."
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
        <FormField label="Reason (optional)" htmlFor="rejectReason">
          <Textarea
            id="rejectReason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
        </FormField>
      </Modal>
    </div>
  );
}
