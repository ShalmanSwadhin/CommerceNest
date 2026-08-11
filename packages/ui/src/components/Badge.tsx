import { type HTMLAttributes } from 'react';
import { cn } from '../cn';
import type { StatusTone } from '../tokens/tokens';

export type BadgeTone = StatusTone | 'primary' | 'impersonation';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: 'sm' | 'md';
}

const toneClasses: Record<BadgeTone, string> = {
  primary: cn(
    'bg-[var(--cn-color-primary-subtle)] text-[var(--cn-color-primary)]',
    'border border-[var(--cn-color-primary)]/20',
  ),
  success: cn(
    'bg-[var(--cn-color-success-subtle)] text-[var(--cn-color-success)]',
    'border border-[var(--cn-color-success-border)]',
  ),
  caution: cn(
    'bg-[var(--cn-color-caution-subtle)] text-[var(--cn-color-caution)]',
    'border border-[var(--cn-color-caution-border)]',
  ),
  danger: cn(
    'bg-[var(--cn-color-danger-subtle)] text-[var(--cn-color-danger)]',
    'border border-[var(--cn-color-danger-border)]',
  ),
  info: cn(
    'bg-[var(--cn-color-info-subtle)] text-[var(--cn-color-info)]',
    'border border-[var(--cn-color-info-border)]',
  ),
  neutral: cn(
    'bg-[var(--cn-color-neutral-subtle)] text-[var(--cn-color-neutral)]',
    'border border-[var(--cn-color-neutral-border)]',
  ),
  impersonation: cn(
    'bg-[var(--cn-color-amber-impersonation)]/15 text-[var(--cn-color-amber-impersonation)]',
    'border border-[var(--cn-color-amber-impersonation)]/40',
  ),
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-sm',
};

export function Badge({
  tone = 'neutral',
  size = 'sm',
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-[var(--cn-radius-full)]',
        'whitespace-nowrap',
        toneClasses[tone],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
