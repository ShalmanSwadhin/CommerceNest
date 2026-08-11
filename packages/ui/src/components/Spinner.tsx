import { type HTMLAttributes } from 'react';
import { cn } from '../cn';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'size-4 border-2',
  md: 'size-6 border-2',
  lg: 'size-8 border-[3px]',
};

export function Spinner({ size = 'md', className, ...props }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block rounded-[var(--cn-radius-full)] animate-spin',
        'border-[var(--cn-color-border-default)] border-t-[var(--cn-color-primary)]',
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
