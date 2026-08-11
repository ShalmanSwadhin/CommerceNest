import { Alert, Button, EmptyState, Skeleton } from '@commercenest/ui';
import { AlertCircle, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
      <Skeleton className="h-56 w-full rounded-cn-lg" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-cn-lg" />
        ))}
      </div>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <Alert tone="danger" title="Something went wrong" icon={<AlertCircle className="size-5" />}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">{message || 'Could not load data from the API.'}</p>
        {onRetry && (
          <Button size="sm" variant="secondary" leftIcon={<RefreshCw className="size-4" />} onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </Alert>
  );
}

export function SoftEmpty({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-cn-lg border border-dashed border-line bg-white">
      <EmptyState title={title} description={description} icon={icon} action={action} />
    </div>
  );
}
