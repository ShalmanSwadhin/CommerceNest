import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, DataTable, useToast } from '@commercenest/ui';
import { Star } from 'lucide-react';
import { ApiClientError, storeApi, unwrapList, type ReviewRow } from '../lib/api';
import { formatDate } from '../lib/format';
import { ErrorState, PageSkeleton } from '../components/QueryState';
import { useAuthStore, useStoreId } from '../stores/authStore';

const CAN_MODERATE_ROLES = new Set(['STORE_OWNER', 'STORE_MANAGER', 'MASTER_ADMIN']);

const STATUS_TONE: Record<ReviewRow['status'], 'caution' | 'success' | 'danger'> = {
  PENDING: 'caution',
  APPROVED: 'success',
  REJECTED: 'danger',
};

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={13} className={i <= rating ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'} />
      ))}
    </div>
  );
}

export function ReviewsPage() {
  const storeId = useStoreId();
  const role = useAuthStore((s) => s.user?.role);
  const canModerate = role ? CAN_MODERATE_ROLES.has(role) : false;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING');

  const q = useQuery({
    queryKey: ['store', storeId, 'reviews', status],
    queryFn: () => storeApi.listReviews(storeId!, { limit: 100, ...(status ? { status } : {}) }),
    enabled: !!storeId,
  });
  const rows = useMemo(() => unwrapList(q.data), [q.data]);
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['store', storeId, 'reviews'] });

  const moderateMut = useMutation({
    mutationFn: ({ id, next }: { id: string; next: 'APPROVED' | 'REJECTED' }) =>
      storeApi.moderateReview(storeId!, id, next),
    onSuccess: (_, { next }) => {
      toast({ title: next === 'APPROVED' ? 'Review approved' : 'Review rejected', tone: next === 'APPROVED' ? 'success' : 'caution' });
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'Could not update review',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      }),
  });

  if (!storeId) return <ErrorState message="Missing store context." />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Product Reviews</h2>
        <p className="text-sm text-ink-secondary">
          Review submissions are always tied to a verified delivered order. Approve to make a review
          visible on the storefront and count it toward the product's rating.
        </p>
      </div>

      <div className="flex gap-2">
        {[
          ['PENDING', 'Pending'],
          ['APPROVED', 'Approved'],
          ['REJECTED', 'Rejected'],
          ['', 'All'],
        ].map(([key, label]) => (
          <Button key={label} size="sm" variant={status === key ? 'primary' : 'secondary'} onClick={() => setStatus(key)}>
            {label}
          </Button>
        ))}
      </div>

      <Card elevated padding="none">
        {q.isLoading ? (
          <PageSkeleton />
        ) : q.isError ? (
          <ErrorState message={q.error instanceof Error ? q.error.message : undefined} onRetry={() => void q.refetch()} />
        ) : (
          <DataTable
            data={rows}
            getRowKey={(r) => r.id}
            state={rows.length ? 'ready' : 'empty'}
            emptyTitle="No reviews"
            emptyDescription="Reviews submitted by customers will show up here for moderation."
            columns={[
              { key: 'product', header: 'Product', cell: (r) => r.product?.name || r.productId },
              { key: 'rating', header: 'Rating', cell: (r) => <Stars rating={r.rating} /> },
              {
                key: 'comment',
                header: 'Comment',
                cell: (r) => <span className="line-clamp-2 max-w-xs text-sm">{r.comment || '—'}</span>,
              },
              { key: 'customer', header: 'Customer', cell: (r) => r.customerName || 'Customer' },
              { key: 'date', header: 'Submitted', cell: (r) => formatDate(r.createdAt) },
              {
                key: 'status',
                header: 'Status',
                cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>,
              },
              {
                key: 'actions',
                header: '',
                cell: (r) =>
                  canModerate && r.status === 'PENDING' ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        loading={moderateMut.isPending}
                        onClick={() => moderateMut.mutate({ id: r.id, next: 'APPROVED' })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={moderateMut.isPending}
                        onClick={() => moderateMut.mutate({ id: r.id, next: 'REJECTED' })}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
