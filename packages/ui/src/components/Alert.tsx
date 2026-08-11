import { type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import { cn } from '../cn';
import type { StatusTone } from '../tokens/tokens';

export type AlertTone = StatusTone | 'impersonation';

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  icon?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const toneConfig: Record<
  AlertTone,
  { icon: ReactNode; container: string; title: string }
> = {
  success: {
    icon: <CheckCircle2 className="size-5" />,
    container: cn(
      'bg-[var(--cn-color-success-subtle)] border-[var(--cn-color-success-border)]',
      'text-[var(--cn-color-success)]',
    ),
    title: 'text-[var(--cn-color-success)]',
  },
  caution: {
    icon: <AlertTriangle className="size-5" />,
    container: cn(
      'bg-[var(--cn-color-caution-subtle)] border-[var(--cn-color-caution-border)]',
      'text-[var(--cn-color-caution)]',
    ),
    title: 'text-[var(--cn-color-caution)]',
  },
  danger: {
    icon: <AlertCircle className="size-5" />,
    container: cn(
      'bg-[var(--cn-color-danger-subtle)] border-[var(--cn-color-danger-border)]',
      'text-[var(--cn-color-danger)]',
    ),
    title: 'text-[var(--cn-color-danger)]',
  },
  info: {
    icon: <Info className="size-5" />,
    container: cn(
      'bg-[var(--cn-color-info-subtle)] border-[var(--cn-color-info-border)]',
      'text-[var(--cn-color-info)]',
    ),
    title: 'text-[var(--cn-color-info)]',
  },
  neutral: {
    icon: <Info className="size-5" />,
    container: cn(
      'bg-[var(--cn-color-neutral-subtle)] border-[var(--cn-color-neutral-border)]',
      'text-[var(--cn-color-neutral)]',
    ),
    title: 'text-[var(--cn-color-text-primary)]',
  },
  impersonation: {
    icon: <ShieldAlert className="size-5" />,
    container: cn(
      'bg-[var(--cn-color-amber-impersonation)]/10 border-[var(--cn-color-amber-impersonation)]/40',
      'text-[var(--cn-color-amber-impersonation)]',
    ),
    title: 'text-[var(--cn-color-amber-impersonation)]',
  },
};

export function Alert({
  tone = 'info',
  title,
  children,
  icon,
  onDismiss,
  className,
}: AlertProps) {
  const config = toneConfig[tone];

  return (
    <div
      role="alert"
      className={cn(
        'flex gap-3 rounded-[var(--cn-radius-md)] border p-4',
        config.container,
        className,
      )}
    >
      <span className="shrink-0 mt-0.5">{icon ?? config.icon}</span>
      <div className="flex-1 min-w-0">
        {title && (
          <p className={cn('text-sm font-semibold mb-1', config.title)}>
            {title}
          </p>
        )}
        {children && (
          <div className="text-sm text-[var(--cn-color-text-secondary)] [&_a]:underline">
            {children}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss alert"
          className={cn(
            'shrink-0 self-start rounded-[var(--cn-radius-sm)] p-1',
            'opacity-70 hover:opacity-100 transition-opacity',
            'focus-visible:outline-none',
            'focus-visible:ring-[var(--cn-focus-ring-width)]',
            'focus-visible:ring-[var(--cn-focus-ring-color)]',
            'focus-visible:ring-offset-[var(--cn-focus-ring-offset)]',
          )}
        >
          <span aria-hidden className="text-lg leading-none">
            &times;
          </span>
        </button>
      )}
    </div>
  );
}
