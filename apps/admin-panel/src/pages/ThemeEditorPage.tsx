import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Card } from '@commercenest/ui';
import { adminApi, unwrapList } from '../lib/api';
import { ErrorState, PageSkeleton, SoftEmpty } from '../components/QueryState';
import { ThemeBuilder } from '../features/theme-builder/ThemeBuilder';

/** Store picker when no :storeId, otherwise full visual Theme Builder. */
export function ThemeEditorPage() {
  const { storeId: routeStoreId } = useParams();
  const navigate = useNavigate();
  const [storeId, setStoreId] = useState(routeStoreId || '');

  useEffect(() => {
    if (routeStoreId) setStoreId(routeStoreId);
  }, [routeStoreId]);

  const storesQ = useQuery({
    queryKey: ['admin', 'stores', 'theme-picker'],
    queryFn: () => adminApi.listStores({ limit: 100 }),
    enabled: !routeStoreId,
  });

  if (routeStoreId || storeId) {
    const id = routeStoreId || storeId;
    return (
      <div className="-m-4 h-full md:-m-6">
        <ThemeBuilder storeId={id} />
      </div>
    );
  }

  if (storesQ.isLoading) return <PageSkeleton />;
  if (storesQ.isError) {
    return (
      <ErrorState
        message={storesQ.error instanceof Error ? storesQ.error.message : undefined}
        onRetry={() => void storesQ.refetch()}
      />
    );
  }

  const stores = unwrapList(storesQ.data);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Theme Builder</h1>
        <p className="text-sm text-ink-secondary">
          Design storefronts with live preview, section ordering, and draft/publish
          versioning.
        </p>
      </div>
      {stores.length === 0 ? (
        <SoftEmpty
          title="No stores yet"
          description="Create a store first, then open the Theme Builder."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <Card key={store.id} className="p-4">
              <p className="font-semibold text-ink">{store.name}</p>
              <p className="text-xs text-ink-secondary">{store.slug}</p>
              <Button
                className="mt-3"
                size="sm"
                onClick={() => navigate(`/themes/${store.id}`)}
              >
                Open Theme Builder
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
