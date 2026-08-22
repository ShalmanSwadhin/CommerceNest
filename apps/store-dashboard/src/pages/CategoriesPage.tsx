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
import { Plus, Trash2 } from 'lucide-react';
import { ApiClientError, storeApi, type CategoryRow } from '../lib/api';
import { ErrorState, PageSkeleton } from '../components/QueryState';
import { useAuthStore, useStoreId } from '../stores/authStore';
import { MediaImageField } from '../features/theme-builder/MediaImageField';

const CAN_DELETE_ROLES = new Set(['STORE_OWNER', 'STORE_MANAGER', 'MASTER_ADMIN']);

const emptyForm = { name: '', slug: '', parentId: '', imageUrl: '', seoTitle: '', seoDescription: '' };

export function CategoriesPage() {
  const storeId = useStoreId();
  const role = useAuthStore((s) => s.user?.role);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);

  const q = useQuery({
    queryKey: ['store', storeId, 'categories'],
    queryFn: () => storeApi.listCategories(storeId!),
    enabled: !!storeId,
  });
  const rows = useMemo(() => q.data ?? [], [q.data]);

  const excludedParentIds = useMemo(() => {
    if (!editing) return new Set<string>();
    // A category can't become its own descendant's child — walk the tree
    // from the category being edited and exclude the whole subtree.
    const ids = new Set<string>([editing.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const r of rows) {
        if (r.parentId && ids.has(r.parentId) && !ids.has(r.id)) {
          ids.add(r.id);
          grew = true;
        }
      }
    }
    return ids;
  }, [editing, rows]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['store', storeId, 'categories'] });

  const saveMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        parentId: form.parentId || undefined,
        // Always sent, even empty — an omitted key means "leave untouched"
        // on the backend, but Remove-image needs an explicit clear to go
        // through, so this can't use the same `|| undefined` pattern as
        // the optional text fields below.
        imageUrl: form.imageUrl.trim(),
        seoTitle: form.seoTitle.trim() || undefined,
        seoDescription: form.seoDescription.trim() || undefined,
      };
      return editing
        ? storeApi.updateCategory(storeId!, editing.id, body)
        : storeApi.createCategory(storeId!, body);
    },
    onSuccess: () => {
      toast({ title: editing ? 'Category updated' : 'Category created', tone: 'success' });
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

  const deleteMut = useMutation({
    mutationFn: (id: string) => storeApi.deleteCategory(storeId!, id),
    onSuccess: () => {
      toast({ title: 'Category deleted', tone: 'success' });
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

  const canDelete = role ? CAN_DELETE_ROLES.has(role) : false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Categories</h2>
          <p className="text-sm text-ink-secondary">Organize your catalog for shoppers</p>
        </div>
        <Button
          leftIcon={<Plus className="size-4" />}
          onClick={() => {
            setEditing(null);
            setForm(emptyForm);
            setOpen(true);
          }}
        >
          Add category
        </Button>
      </div>

      <Card elevated padding="none">
        <DataTable
          data={rows}
          getRowKey={(r) => r.id}
          state={rows.length ? 'ready' : 'empty'}
          emptyTitle="No categories yet"
          emptyDescription="Add a category to start organizing your products."
          columns={[
            {
              key: 'image',
              header: '',
              headerClassName: 'w-16',
              cell: (r) =>
                r.imageUrl ? (
                  <img src={r.imageUrl} alt="" className="h-10 w-10 rounded-cn object-cover bg-surface-sunken" />
                ) : (
                  <div className="h-10 w-10 rounded-cn bg-surface-sunken" />
                ),
            },
            { key: 'name', header: 'Name', cell: (r) => r.name },
            { key: 'slug', header: 'Slug', cell: (r) => r.slug },
            {
              key: 'parent',
              header: 'Parent',
              cell: (r) =>
                r.parentId ? rows.find((p) => p.id === r.parentId)?.name || '—' : '—',
            },
            {
              key: 'products',
              header: 'Products',
              cell: (r) => <Badge tone="neutral">{r._count?.products ?? 0}</Badge>,
            },
            {
              key: 'actions',
              header: '',
              cell: (r) => (
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(r);
                      setForm({
                        name: r.name,
                        slug: r.slug,
                        parentId: r.parentId || '',
                        imageUrl: r.imageUrl || '',
                        seoTitle: r.seoTitle || '',
                        seoDescription: r.seoDescription || '',
                      });
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  {canDelete ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Delete category"
                      onClick={() => setDeleteTarget(r)}
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
        title={editing ? 'Edit category' : 'Add category'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={saveMut.isPending}
              disabled={!form.name.trim() || !form.slug.trim()}
              onClick={() => saveMut.mutate()}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Name" htmlFor="cat-name" required>
            <Input
              id="cat-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </FormField>
          <FormField label="Slug" htmlFor="cat-slug" required>
            <Input
              id="cat-slug"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="e.g. mens-fashion"
            />
          </FormField>
          <MediaImageField
            storeId={storeId}
            label="Category image"
            value={form.imageUrl}
            usageType="CATEGORY_IMAGE"
            hint="Shown on the storefront's category grid. Without one, a photo from this category's own products is used instead."
            onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
          />
          <FormField label="Parent category" htmlFor="cat-parent">
            <select
              id="cat-parent"
              className="h-10 w-full rounded-cn border border-[var(--cn-color-border-input)] bg-surface-base px-3 text-sm"
              value={form.parentId}
              onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
            >
              <option value="">None</option>
              {rows
                .filter((r) => !excludedParentIds.has(r.id))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          </FormField>
          <FormField label="SEO title" htmlFor="cat-seo-title">
            <Input
              id="cat-seo-title"
              value={form.seoTitle}
              onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))}
            />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete category?"
        description={
          deleteTarget
            ? `Products in "${deleteTarget.name}" will become uncategorized. This cannot be undone.`
            : undefined
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={deleteMut.isPending}
            onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
