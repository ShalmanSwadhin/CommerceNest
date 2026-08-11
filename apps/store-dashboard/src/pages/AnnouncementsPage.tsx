import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@commercenest/ui';
import { storeApi } from '../lib/api';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';
import { useStoreId } from '../stores/authStore';
import { formatDate } from '../lib/format';

export function AnnouncementsPage() {
  const storeId = useStoreId();
  const q = useQuery({
    queryKey: ['store', storeId, 'announcements'],
    queryFn: () => storeApi.listAnnouncements(storeId!),
    enabled: !!storeId,
  });

  const items = useMemo(() => q.data?.items ?? [], [q.data]);

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Announcements</h2>
        <p className="text-sm text-ink-secondary">
          Platform messages from CommerceNest Master Admin
        </p>
      </div>
      {items.length === 0 ? (
        <SoftEmpty
          title="No announcements"
          description="Published platform announcements will appear here."
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} elevated className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold">{item.title}</h3>
                <span className="shrink-0 text-xs text-ink-secondary">
                  {formatDate(item.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-ink-secondary">{item.body}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
