import { type ReactNode } from 'react';
import { cn } from '../cn';
import { Card } from './Card';

export interface KpiCardProps {
  label: string;
  value: string | number;
  change?: {
    value: string;
    trend: 'up' | 'down' | 'neutral';
  };
  icon?: ReactNode;
  className?: string;
}

const trendClasses = {
  up: 'text-[var(--cn-color-success)]',
  down: 'text-[var(--cn-color-danger)]',
  neutral: 'text-[var(--cn-color-text-secondary)]',
};

export function KpiCard({
  label,
  value,
  change,
  icon,
  className,
}: KpiCardProps) {
  return (
    <Card padding="md" className={cn('relative overflow-hidden', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-sm font-medium text-[var(--cn-color-text-secondary)] truncate">
            {label}
          </span>
          <span className="text-2xl font-semibold tracking-tight text-[var(--cn-color-text-primary)]">
            {value}
          </span>
          {change && (
            <span className={cn('text-sm font-medium', trendClasses[change.trend])}>
              {change.value}
            </span>
          )}
        </div>
        {icon && (
          <div
            className={cn(
              'flex shrink-0 items-center justify-center size-10 rounded-[var(--cn-radius-md)]',
              'bg-[var(--cn-color-primary-subtle)] text-[var(--cn-color-primary)]',
              '[&>svg]:size-5',
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
