import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  FormField,
  Input,
  Modal,
  Textarea,
  useToast,
} from '@commercenest/ui';
import { ExternalLink, Plus, Star, Trash2 } from 'lucide-react';
import { adminApi, ApiClientError, type Package } from '../lib/api';
import { ErrorState, PageSkeleton } from '../components/QueryState';

type PackageForm = {
  name: string;
  slug: string;
  description: string;
  monthlyPrice: string;
  yearlyPrice: string;
  active: boolean;
  featured: boolean;
  displayOrder: string;
  maxProducts: string;
  maxStaff: string;
  storageLimitMb: string;
  platformFeeRate: string;
  trialDays: string;
  customThemeAvailability: 'INCLUDED' | 'ADDITIONAL_CHARGE';
  supportLevel: string;
  featuresText: string;
};

function emptyForm(): PackageForm {
  return {
    name: '',
    slug: '',
    description: '',
    monthlyPrice: '',
    yearlyPrice: '',
    active: true,
    featured: false,
    displayOrder: '0',
    maxProducts: '',
    maxStaff: '',
    storageLimitMb: '',
    platformFeeRate: '0',
    trialDays: '7',
    customThemeAvailability: 'ADDITIONAL_CHARGE',
    supportLevel: 'basic',
    featuresText: '',
  };
}

function toForm(pkg: Package): PackageForm {
  return {
    name: pkg.name,
    slug: pkg.slug,
    description: pkg.description || '',
    monthlyPrice: String(pkg.monthlyPrice),
    yearlyPrice: pkg.yearlyPrice ? String(pkg.yearlyPrice) : '',
    active: pkg.active,
    featured: pkg.featured,
    displayOrder: String(pkg.displayOrder),
    maxProducts: pkg.maxProducts !== null ? String(pkg.maxProducts) : '',
    maxStaff: pkg.maxStaff !== null ? String(pkg.maxStaff) : '',
    storageLimitMb: pkg.storageLimitMb !== null ? String(pkg.storageLimitMb) : '',
    // Stored as a fraction (0.005), edited here as a percentage (0.50).
    platformFeeRate: String(pkg.platformFeeRate * 100),
    trialDays: String(pkg.trialDays),
    customThemeAvailability: pkg.customThemeAvailability,
    supportLevel: pkg.supportLevel,
    featuresText: pkg.features.join('\n'),
  };
}

function publicPricingUrl(): string {
  const fromEnv = import.meta.env.VITE_MARKETING_URL?.replace(/\/$/, '');
  if (fromEnv) return `${fromEnv}/pricing`;
  if (typeof window === 'undefined') return '/pricing';
  const { protocol, hostname, port } = window.location;
  const portSuffix = port ? `:${port}` : '';
  // admin.example.com → example.com ; admin.localhost → localhost
  const marketingHost = hostname.replace(/^admin\./, '') || hostname;
  return `${protocol}//${marketingHost}${portSuffix}/pricing`;
}

function formToBody(form: PackageForm) {
  return {
    name: form.name,
    slug: form.slug,
    description: form.description || undefined,
    monthlyPrice: Number(form.monthlyPrice),
    yearlyPrice: form.yearlyPrice ? Number(form.yearlyPrice) : undefined,
    active: form.active,
    featured: form.featured,
    displayOrder: Number(form.displayOrder) || 0,
    maxProducts: form.maxProducts ? Number(form.maxProducts) : null,
    maxStaff: form.maxStaff ? Number(form.maxStaff) : null,
    storageLimitMb: form.storageLimitMb ? Number(form.storageLimitMb) : null,
    platformFeeRate: (Number(form.platformFeeRate) || 0) / 100,
    trialDays: Number(form.trialDays) || 0,
    customThemeAvailability: form.customThemeAvailability,
    supportLevel: form.supportLevel,
    features: form.featuresText
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean),
  };
}

export function PricingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Package | null>(null);
  const [form, setForm] = useState<PackageForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<Package | null>(null);

  const q = useQuery({
    queryKey: ['admin', 'packages'],
    queryFn: () => adminApi.listPackages(),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin', 'packages'] });

  const saveMut = useMutation({
    mutationFn: () => {
      const body = formToBody(form);
      return editing ? adminApi.updatePackage(editing.id, body) : adminApi.createPackage(body);
    },
    onSuccess: () => {
      toast({ title: editing ? 'Package updated' : 'Package created', tone: 'success' });
      setOpen(false);
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Save failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const deleteMut = useMutation({
    mutationFn: () => adminApi.deletePackage(deleteTarget!.id),
    onSuccess: (res) => {
      toast({
        title: res.deactivatedInstead ? 'Package deactivated' : 'Package deleted',
        description: res.deactivatedInstead
          ? 'Stores are already on this plan, so it was deactivated instead of deleted.'
          : undefined,
        tone: 'success',
      });
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Delete failed',
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

  const packages = [...(q.data?.items ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Pricing & Packages</h1>
          <p className="text-sm text-ink-secondary">
            Manage the plans merchants see on the public pricing page.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            leftIcon={<ExternalLink className="size-4" />}
            onClick={() => window.open(publicPricingUrl(), '_blank')}
          >
            View public pricing page
          </Button>
          <Button
            leftIcon={<Plus className="size-4" />}
            onClick={() => {
              setEditing(null);
              setForm(emptyForm());
              setOpen(true);
            }}
          >
            Add package
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => (
          <Card key={pkg.id} elevated padding="lg" className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-ink">{pkg.name}</h3>
                  {pkg.featured ? <Star className="size-4 fill-amber-400 text-amber-400" /> : null}
                </div>
                <p className="text-xs text-ink-tertiary">{pkg.slug}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge tone={pkg.active ? 'success' : 'neutral'}>
                  {pkg.active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
            <p className="text-2xl font-bold text-ink">
              ৳{Number(pkg.monthlyPrice).toLocaleString('en-US')}
              <span className="text-sm font-normal text-ink-secondary">/month</span>
            </p>
            {pkg.description ? (
              <p className="text-sm text-ink-secondary">{pkg.description}</p>
            ) : null}
            <ul className="space-y-1 text-xs text-ink-secondary">
              <li>Products: {pkg.maxProducts ?? 'Unlimited'}</li>
              <li>Staff: {pkg.maxStaff ?? 'Unlimited'}</li>
              <li>Storage: {pkg.storageLimitMb !== null ? `${pkg.storageLimitMb} MB` : 'Unlimited'}</li>
              <li>Platform fee: {(pkg.platformFeeRate * 100).toFixed(2)}%</li>
              <li>Trial: {pkg.trialDays} days</li>
              <li>
                Custom theme:{' '}
                {pkg.customThemeAvailability === 'INCLUDED' ? 'Included' : 'Additional charge'}
              </li>
            </ul>
            <div className="mt-auto flex gap-2 pt-2">
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setEditing(pkg);
                  setForm(toForm(pkg));
                  setOpen(true);
                }}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Delete package"
                onClick={() => setDeleteTarget(pkg)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit package' : 'Add package'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
              Save
            </Button>
          </>
        }
      >
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Name" htmlFor="pkg-name">
              <Input id="pkg-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </FormField>
            <FormField label="Slug" htmlFor="pkg-slug" description="Matches a store's plan tier">
              <Input id="pkg-slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
            </FormField>
            <FormField label="Monthly price (BDT)" htmlFor="pkg-monthly">
              <Input id="pkg-monthly" type="number" min={0} value={form.monthlyPrice} onChange={(e) => setForm((f) => ({ ...f, monthlyPrice: e.target.value }))} />
            </FormField>
            <FormField label="Yearly price (BDT, optional)" htmlFor="pkg-yearly">
              <Input id="pkg-yearly" type="number" min={0} value={form.yearlyPrice} onChange={(e) => setForm((f) => ({ ...f, yearlyPrice: e.target.value }))} />
            </FormField>
            <FormField label="Max products (blank = unlimited)" htmlFor="pkg-max-products">
              <Input id="pkg-max-products" type="number" min={0} value={form.maxProducts} onChange={(e) => setForm((f) => ({ ...f, maxProducts: e.target.value }))} />
            </FormField>
            <FormField label="Max staff (blank = unlimited)" htmlFor="pkg-max-staff">
              <Input id="pkg-max-staff" type="number" min={0} value={form.maxStaff} onChange={(e) => setForm((f) => ({ ...f, maxStaff: e.target.value }))} />
            </FormField>
            <FormField label="Storage limit (MB)" htmlFor="pkg-storage">
              <Input id="pkg-storage" type="number" min={0} value={form.storageLimitMb} onChange={(e) => setForm((f) => ({ ...f, storageLimitMb: e.target.value }))} />
            </FormField>
            <FormField
              label="Platform fee (%)"
              htmlFor="pkg-platform-fee"
              description="CommerceNest's cut of eligible order value — separate from any payment gateway fee"
            >
              <Input
                id="pkg-platform-fee"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.platformFeeRate}
                onChange={(e) => setForm((f) => ({ ...f, platformFeeRate: e.target.value }))}
              />
            </FormField>
            <FormField label="Trial days" htmlFor="pkg-trial-days">
              <Input id="pkg-trial-days" type="number" min={0} max={90} value={form.trialDays} onChange={(e) => setForm((f) => ({ ...f, trialDays: e.target.value }))} />
            </FormField>
            <FormField label="Display order" htmlFor="pkg-order">
              <Input id="pkg-order" type="number" value={form.displayOrder} onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))} />
            </FormField>
            <FormField label="Support level" htmlFor="pkg-support">
              <select
                id="pkg-support"
                className="h-10 w-full rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-sm"
                value={form.supportLevel}
                onChange={(e) => setForm((f) => ({ ...f, supportLevel: e.target.value }))}
              >
                <option value="basic">Basic</option>
                <option value="priority">Priority</option>
              </select>
            </FormField>
            <FormField label="Custom theme service" htmlFor="pkg-theme">
              <select
                id="pkg-theme"
                className="h-10 w-full rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-sm"
                value={form.customThemeAvailability}
                onChange={(e) =>
                  setForm((f) => ({ ...f, customThemeAvailability: e.target.value as PackageForm['customThemeAvailability'] }))
                }
              >
                <option value="ADDITIONAL_CHARGE">Additional charge</option>
                <option value="INCLUDED">Included</option>
              </select>
            </FormField>
          </div>
          <FormField label="Description" htmlFor="pkg-description">
            <Textarea id="pkg-description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
          </FormField>
          <FormField label="Features (one per line)" htmlFor="pkg-features">
            <Textarea id="pkg-features" value={form.featuresText} onChange={(e) => setForm((f) => ({ ...f, featuresText: e.target.value }))} rows={6} />
          </FormField>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
              Active (visible on pricing page)
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={form.featured} onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))} />
              Featured ("Most popular")
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete package?"
      >
        <p className="text-sm text-ink-secondary">
          {deleteTarget
            ? `"${deleteTarget.name}" will be removed from the pricing page. If any stores are on this plan, it will be deactivated instead of deleted.`
            : null}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="destructive" loading={deleteMut.isPending} onClick={() => deleteMut.mutate()}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
