import { type ReactNode } from 'react';
import { cn } from '../cn';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-6',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'mb-4 flex items-center justify-center size-12 rounded-[var(--cn-radius-lg)]',
            'bg-[var(--cn-color-surface-sunken)] text-[var(--cn-color-text-tertiary)]',
            '[&>svg]:size-6',
          )}
        >
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-[var(--cn-color-text-primary)] mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-[var(--cn-color-text-secondary)] max-w-sm mb-6">
          {description}
        </p>
      )}
      {action && (
        <Button variant="primary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
