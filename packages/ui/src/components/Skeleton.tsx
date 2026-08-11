import { type HTMLAttributes } from 'react';
import { cn } from '../cn';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  circle?: boolean;
}

export function Skeleton({
  width,
  height,
  circle = false,
  className,
  style,
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse bg-[var(--cn-color-surface-muted)]',
        circle ? 'rounded-[var(--cn-radius-full)]' : 'rounded-[var(--cn-radius-md)]',
        className,
      )}
      style={{
        width,
        height,
        ...style,
      }}
      {...props}
    />
  );
}
