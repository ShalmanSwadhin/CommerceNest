import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';

export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required for accessibility — used as aria-label */
  label: string;
  size?: IconButtonSize;
  variant?: 'default' | 'ghost' | 'destructive';
  children: ReactNode;
}

const sizeClasses: Record<IconButtonSize, string> = {
  sm: 'size-8 rounded-[var(--cn-radius-sm)] [&>svg]:size-4',
  md: 'size-10 rounded-[var(--cn-radius-md)] [&>svg]:size-5',
  lg: 'size-11 rounded-[var(--cn-radius-md)] [&>svg]:size-5',
};

const variantClasses = {
  default: cn(
    'bg-[var(--cn-color-surface-base)] text-[var(--cn-color-text-secondary)]',
    'border border-[var(--cn-color-border-default)]',
    'hover:bg-[var(--cn-color-surface-raised)] hover:text-[var(--cn-color-text-primary)]',
  ),
  ghost: cn(
    'bg-transparent text-[var(--cn-color-text-secondary)]',
    'hover:bg-[var(--cn-color-surface-raised)] hover:text-[var(--cn-color-text-primary)]',
  ),
  destructive: cn(
    'bg-transparent text-[var(--cn-color-danger)]',
    'hover:bg-[var(--cn-color-danger-subtle)]',
  ),
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      label,
      size = 'md',
      variant = 'default',
      className,
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center shrink-0',
        'transition-colors duration-[var(--cn-duration-fast)]',
        'disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:outline-none',
        'focus-visible:ring-[var(--cn-focus-ring-width)]',
        'focus-visible:ring-[var(--cn-focus-ring-color)]',
        'focus-visible:ring-offset-[var(--cn-focus-ring-offset)]',
        'focus-visible:ring-offset-[var(--cn-color-surface-base)]',
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);

IconButton.displayName = 'IconButton';
