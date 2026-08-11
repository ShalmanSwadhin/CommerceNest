import { Alert, Button, EmptyState, Skeleton } from '@commercenest/ui';
import { AlertCircle, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-cn-lg" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-cn" />
      ))}
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
    <Alert tone="danger" title="Unable to load data" icon={<AlertCircle className="size-5" />}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">{message || 'The API request failed. Please try again.'}</p>
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
    <div className="rounded-cn-lg border border-dashed border-line bg-surface-base">
      <EmptyState title={title} description={description} icon={icon} action={action} />
    </div>
  );
}
