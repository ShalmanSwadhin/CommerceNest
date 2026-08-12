import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  DataTable,
  FormField,
  Input,
  Modal,
  useToast,
} from '@commercenest/ui';
import { Plus } from 'lucide-react';
import { ApiClientError, storeApi, unwrapList, type CouponRow } from '../lib/api';
import { formatBdt, formatDate } from '../lib/format';
import { ErrorState, PageSkeleton } from '../components/QueryState';
import { useStoreId } from '../stores/authStore';

const emptyForm = {
  code: '',
  discountType: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED',
  discountValue: '',
  minOrderValue: '',
  usageLimit: '',
  perCustomerLimit: '',
  endsAt: '',
};

export function CouponsPage() {
  const storeId = useStoreId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const q = useQuery({
    queryKey: ['store', storeId, 'coupons'],
    queryFn: () => storeApi.listCoupons(storeId!, { limit: 100 }),
    enabled: !!storeId,
  });
  const rows = useMemo(() => unwrapList(q.data), [q.data]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['store', storeId, 'coupons'] });

  const createMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        code: form.code.trim(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
      };
      if (form.minOrderValue.trim()) body.minOrderValue = Number(form.minOrderValue);
      if (form.usageLimit.trim()) body.usageLimit = Number(form.usageLimit);
      if (form.perCustomerLimit.trim()) body.perCustomerLimit = Number(form.perCustomerLimit);
      if (form.endsAt.trim()) body.endsAt = new Date(form.endsAt).toISOString();
      return storeApi.createCoupon(storeId!, body);
    },
    onSuccess: () => {
      toast({ title: 'Coupon created', tone: 'success' });
      setOpen(false);
      setForm(emptyForm);
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Save failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const toggleMut = useMutation({
    mutationFn: (c: CouponRow) => storeApi.updateCoupon(storeId!, c.id, { active: !c.active }),
    onSuccess: () => {
      toast({ title: 'Coupon updated', tone: 'success' });
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Update failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => storeApi.deleteCoupon(storeId!, id),
    onSuccess: () => {
      toast({ title: 'Coupon removed', tone: 'success' });
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Remove failed',
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

  const validForm =
    form.code.trim().length >= 3 &&
    Number(form.discountValue) > 0 &&
    !(form.discountType === 'PERCENTAGE' && Number(form.discountValue) > 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Coupons</h2>
          <p className="text-sm text-ink-secondary">
            Discount codes shoppers can apply at checkout. Discounts are always calculated on the
            server — customers can never set their own discount.
          </p>
        </div>
        <Button
          leftIcon={<Plus className="size-4" />}
          onClick={() => {
            setForm(emptyForm);
            setOpen(true);
          }}
        >
          Add coupon
        </Button>
      </div>

      <Card elevated padding="none">
        <DataTable
          data={rows}
          getRowKey={(r) => r.id}
          state={rows.length ? 'ready' : 'empty'}
          emptyTitle="No coupons yet"
          emptyDescription="Create a coupon code to run a promotion."
          columns={[
            { key: 'code', header: 'Code', cell: (r) => <span className="font-mono">{r.code}</span> },
            {
              key: 'discount',
              header: 'Discount',
              cell: (r) =>
                r.discountType === 'PERCENTAGE'
                  ? `${r.discountValue}%`
                  : formatBdt(Number(r.discountValue)),
            },
            {
              key: 'minOrder',
              header: 'Min. order',
              cell: (r) => (r.minOrderValue ? formatBdt(Number(r.minOrderValue)) : '—'),
            },
            {
              key: 'usage',
              header: 'Used',
              cell: (r) => `${r.usedCount}${r.usageLimit ? ` / ${r.usageLimit}` : ''}`,
            },
            {
              key: 'ends',
              header: 'Ends',
              cell: (r) => (r.endsAt ? formatDate(r.endsAt) : 'No expiry'),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (r) => (
                <Badge tone={r.active ? 'success' : 'neutral'}>
                  {r.active ? 'Active' : 'Inactive'}
                </Badge>
              ),
            },
            {
              key: 'actions',
              header: '',
              cell: (r) => (
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={toggleMut.isPending}
                    onClick={() => toggleMut.mutate(r)}
                  >
                    {r.active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={deleteMut.isPending}
                    onClick={() => deleteMut.mutate(r.id)}
                  >
                    Remove
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add coupon"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={createMut.isPending} disabled={!validForm} onClick={() => createMut.mutate()}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Code" htmlFor="coupon-code" required>
            <Input
              id="coupon-code"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="e.g. EID20"
            />
          </FormField>
          <FormField label="Discount type" htmlFor="coupon-type" required>
            <select
              id="coupon-type"
              className="h-10 w-full rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-sm"
              value={form.discountType}
              onChange={(e) =>
                setForm((f) => ({ ...f, discountType: e.target.value as 'PERCENTAGE' | 'FIXED' }))
              }
            >
              <option value="PERCENTAGE">Percentage off</option>
              <option value="FIXED">Fixed amount off (BDT)</option>
            </select>
          </FormField>
          <FormField
            label={form.discountType === 'PERCENTAGE' ? 'Percentage (1-100)' : 'Amount (BDT)'}
            htmlFor="coupon-value"
            required
          >
            <Input
              id="coupon-value"
              type="number"
              value={form.discountValue}
              onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
            />
          </FormField>
          <FormField label="Minimum order value (optional)" htmlFor="coupon-min">
            <Input
              id="coupon-min"
              type="number"
              value={form.minOrderValue}
              onChange={(e) => setForm((f) => ({ ...f, minOrderValue: e.target.value }))}
            />
          </FormField>
          <FormField label="Total usage limit (optional)" htmlFor="coupon-usage">
            <Input
              id="coupon-usage"
              type="number"
              value={form.usageLimit}
              onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
            />
          </FormField>
          <FormField label="Per-customer usage limit (optional)" htmlFor="coupon-per-customer">
            <Input
              id="coupon-per-customer"
              type="number"
              value={form.perCustomerLimit}
              onChange={(e) => setForm((f) => ({ ...f, perCustomerLimit: e.target.value }))}
            />
          </FormField>
          <FormField label="End date (optional)" htmlFor="coupon-ends">
            <Input
              id="coupon-ends"
              type="date"
              value={form.endsAt}
              onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
