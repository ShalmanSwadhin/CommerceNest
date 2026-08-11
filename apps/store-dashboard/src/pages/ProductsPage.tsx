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
  Textarea,
  useToast,
} from '@commercenest/ui';
import { Plus, Trash2 } from 'lucide-react';
import { ApiClientError, storeApi, type ProductRow, unwrapList } from '../lib/api';
import { formatBdt } from '../lib/format';
import { ErrorState, PageSkeleton } from '../components/QueryState';
import { useStoreId } from '../stores/authStore';
import { MediaImageField } from '../features/theme-builder/MediaImageField';

const statusTone: Record<string, 'success' | 'caution' | 'neutral'> = {
  ACTIVE: 'success',
  DRAFT: 'caution',
  ARCHIVED: 'neutral',
};

type VariantForm = {
  id?: string;
  sku: string;
  size: string;
  color: string;
  priceOverride: string;
  stock: string;
};

function newVariant(): VariantForm {
  return { sku: '', size: '', color: '', priceOverride: '', stock: '0' };
}

const emptyForm = {
  name: '',
  slug: '',
  basePrice: '0',
  description: '',
  status: 'DRAFT',
  categoryId: '',
  images: [] as string[],
  variants: [newVariant()] as VariantForm[],
};

export function ProductsPage() {
  const storeId = useStoreId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [archiveTarget, setArchiveTarget] = useState<ProductRow | null>(null);

  const q = useQuery({
    queryKey: ['store', storeId, 'products'],
    queryFn: () => storeApi.listProducts(storeId!, { limit: 100 }),
    enabled: !!storeId,
  });
  const rows = useMemo(() => unwrapList(q.data), [q.data]);

  const categoriesQ = useQuery({
    queryKey: ['store', storeId, 'categories'],
    queryFn: () => storeApi.listCategories(storeId!),
    enabled: !!storeId && open,
  });
  const categories = categoriesQ.data ?? [];

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['store', storeId, 'products'] });

  const saveMut = useMutation({
    mutationFn: () => {
      const variants = form.variants
        .filter((v) => v.sku.trim())
        .map((v) => ({
          ...(v.id ? { id: v.id } : {}),
          sku: v.sku.trim(),
          size: v.size.trim() || undefined,
          color: v.color.trim() || undefined,
          priceOverride: v.priceOverride.trim() ? Number(v.priceOverride) : undefined,
          stock: Number(v.stock) || 0,
        }));
      const body: Record<string, unknown> = {
        name: form.name,
        slug: form.slug,
        basePrice: Number(form.basePrice),
        description: form.description,
        status: form.status,
        categoryId: form.categoryId || undefined,
        images: form.images
          .filter((url) => url.trim())
          .map((url, index) => ({ url, sortOrder: index })),
        variants,
      };
      return editing
        ? storeApi.updateProduct(storeId!, editing.id, body)
        : storeApi.createProduct(storeId!, body);
    },
    onSuccess: () => {
      toast({ title: editing ? 'Product updated' : 'Product created', tone: 'success' });
      setOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Save failed',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => storeApi.archiveProduct(storeId!, id),
    onSuccess: () => {
      toast({ title: 'Product archived', tone: 'success' });
      setArchiveTarget(null);
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Archive failed',
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

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (r: ProductRow) => {
    setEditing(r);
    setForm({
      name: r.name,
      slug: r.slug,
      basePrice: String(r.basePrice),
      description: r.description || '',
      status: r.status,
      categoryId: r.categoryId || '',
      images: (r.images || []).map((img) => img.url),
      variants:
        r.variants && r.variants.length
          ? r.variants.map((v) => ({
              id: v.id,
              sku: v.sku,
              size: v.size || '',
              color: v.color || '',
              priceOverride: '',
              stock: String(v.stock ?? 0),
            }))
          : [newVariant()],
    });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Products</h2>
          <p className="text-sm text-ink-secondary">Catalog for your storefront</p>
        </div>
        <Button leftIcon={<Plus className="size-4" />} onClick={openCreate}>
          Add product
        </Button>
      </div>
      <Card elevated padding="none">
        <DataTable
          data={rows}
          getRowKey={(r) => r.id}
          state={rows.length ? 'ready' : 'empty'}
          emptyTitle="No products yet"
          emptyDescription="Add your first product to start selling."
          columns={[
            {
              key: 'name',
              header: 'Product',
              cell: (r) => (
                <div className="flex items-center gap-2">
                  {r.images?.[0]?.url ? (
                    <img
                      src={r.images[0].url}
                      alt=""
                      className="size-8 shrink-0 rounded-cn object-cover bg-surface-sunken"
                    />
                  ) : null}
                  <span>{r.name}</span>
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (r) => <Badge tone={statusTone[r.status] || 'neutral'}>{r.status}</Badge>,
            },
            { key: 'price', header: 'Price', cell: (r) => formatBdt(r.basePrice) },
            {
              key: 'stock',
              header: 'Stock',
              cell: (r) => r.variants?.reduce((sum, v) => sum + (v.stock || 0), 0) ?? '-',
            },
            {
              key: 'actions',
              header: '',
              cell: (r) => (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                    Edit
                  </Button>
                  {r.status !== 'ARCHIVED' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Archive product"
                      onClick={() => setArchiveTarget(r)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit product' : 'Add product'}
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
        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Name" htmlFor="name">
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </FormField>
            <FormField label="Slug" htmlFor="slug">
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </FormField>
            <FormField label="Base price" htmlFor="basePrice">
              <Input
                id="basePrice"
                value={form.basePrice}
                onChange={(e) => setForm((f) => ({ ...f, basePrice: e.target.value }))}
              />
            </FormField>
            <FormField label="Status" htmlFor="status">
              <select
                id="status"
                className="h-10 w-full rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-sm"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </FormField>
            <FormField label="Category" htmlFor="categoryId" className="sm:col-span-2">
              <select
                id="categoryId"
                className="h-10 w-full rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-sm"
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <FormField label="Description" htmlFor="description">
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </FormField>

          <div className="space-y-3 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Images</p>
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => setForm((f) => ({ ...f, images: [...f.images, ''] }))}
              >
                Add image
              </Button>
            </div>
            {form.images.length === 0 ? (
              <p className="text-xs text-ink-secondary">
                No images yet — add at least one to help customers recognize this product.
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {form.images.map((url, index) => (
                <div key={index} className="relative">
                  <MediaImageField
                    storeId={storeId}
                    label={index === 0 ? 'Primary image' : `Image ${index + 1}`}
                    value={url}
                    usageType="PRODUCT_IMAGE"
                    onChange={(next) =>
                      setForm((f) => ({
                        ...f,
                        images: f.images.map((u, i) => (i === index ? next : u)),
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="mt-1 text-xs font-medium text-red-600 hover:underline"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        images: f.images.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    Remove image
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Variants</p>
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, variants: [...f.variants, newVariant()] }))
                }
              >
                Add variant
              </Button>
            </div>
            <div className="space-y-2">
              {form.variants.map((v, index) => (
                <div
                  key={index}
                  className="grid grid-cols-2 gap-2 rounded-lg border border-line p-2 sm:grid-cols-5"
                >
                  <FormField label="SKU" htmlFor={`sku-${index}`}>
                    <Input
                      id={`sku-${index}`}
                      value={v.sku}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          variants: f.variants.map((row, i) =>
                            i === index ? { ...row, sku: e.target.value } : row,
                          ),
                        }))
                      }
                    />
                  </FormField>
                  <FormField label="Size" htmlFor={`size-${index}`}>
                    <Input
                      id={`size-${index}`}
                      value={v.size}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          variants: f.variants.map((row, i) =>
                            i === index ? { ...row, size: e.target.value } : row,
                          ),
                        }))
                      }
                    />
                  </FormField>
                  <FormField label="Color" htmlFor={`color-${index}`}>
                    <Input
                      id={`color-${index}`}
                      value={v.color}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          variants: f.variants.map((row, i) =>
                            i === index ? { ...row, color: e.target.value } : row,
                          ),
                        }))
                      }
                    />
                  </FormField>
                  <FormField label="Price override" htmlFor={`price-${index}`}>
                    <Input
                      id={`price-${index}`}
                      value={v.priceOverride}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          variants: f.variants.map((row, i) =>
                            i === index ? { ...row, priceOverride: e.target.value } : row,
                          ),
                        }))
                      }
                    />
                  </FormField>
                  <div className="flex items-end gap-1">
                    <FormField label="Stock" htmlFor={`stock-${index}`} className="flex-1">
                      <Input
                        id={`stock-${index}`}
                        value={v.stock}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            variants: f.variants.map((row, i) =>
                              i === index ? { ...row, stock: e.target.value } : row,
                            ),
                          }))
                        }
                      />
                    </FormField>
                    {v.id ? null : (
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        disabled={form.variants.length <= 1}
                        aria-label="Remove variant"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            variants: f.variants.filter((_, i) => i !== index),
                          }))
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-ink-tertiary">
              At least one variant (SKU + stock) is required. Existing saved variants can be
              edited here but not removed — contact support to delete a variant entirely.
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title="Archive product?"
        description={
          archiveTarget
            ? `"${archiveTarget.name}" will be hidden from the storefront. You can still find it under Archived status.`
            : undefined
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setArchiveTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={archiveMut.isPending}
            onClick={() => archiveTarget && archiveMut.mutate(archiveTarget.id)}
          >
            Archive
          </Button>
        </div>
      </Modal>
    </div>
  );
}
