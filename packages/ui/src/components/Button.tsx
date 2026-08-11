import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';
import { Spinner } from './Spinner';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'destructive'
  | 'link';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: cn(
    'bg-[var(--cn-color-primary)] text-[var(--cn-color-primary-foreground)]',
    'hover:bg-[var(--cn-color-primary-hover)]',
    'shadow-[var(--cn-shadow-1)]',
  ),
  secondary: cn(
    'bg-[var(--cn-color-surface-base)] text-[var(--cn-color-text-primary)]',
    'border border-[var(--cn-color-border-default)]',
    'hover:bg-[var(--cn-color-surface-raised)]',
    'shadow-[var(--cn-shadow-0)]',
  ),
  ghost: cn(
    'bg-transparent text-[var(--cn-color-text-secondary)]',
    'hover:bg-[var(--cn-color-surface-raised)] hover:text-[var(--cn-color-text-primary)]',
  ),
  destructive: cn(
    'bg-[var(--cn-color-danger)] text-white',
    'hover:opacity-90',
    'shadow-[var(--cn-shadow-1)]',
  ),
  link: cn(
    'bg-transparent text-[var(--cn-color-text-link)] p-0 h-auto',
    'hover:text-[var(--cn-color-text-link-hover)] underline-offset-4 hover:underline',
  ),
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-[var(--cn-radius-sm)]',
  md: 'h-10 px-4 text-sm gap-2 rounded-[var(--cn-radius-md)]',
  lg: 'h-11 px-5 text-base gap-2 rounded-[var(--cn-radius-md)]',
};

const focusClasses = cn(
  'focus-visible:outline-none',
  'focus-visible:ring-[var(--cn-focus-ring-width)]',
  'focus-visible:ring-[var(--cn-focus-ring-color)]',
  'focus-visible:ring-offset-[var(--cn-focus-ring-offset)]',
  'focus-visible:ring-offset-[var(--cn-color-surface-base)]',
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      leftIcon,
      rightIcon,
      children,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;
    const isLink = variant === 'link';

    return (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex items-center justify-center font-medium',
          'transition-colors duration-[var(--cn-duration-fast)]',
          'disabled:pointer-events-none disabled:opacity-50',
          !isLink && sizeClasses[size],
          variantClasses[variant],
          !isLink && focusClasses,
          className,
        )}
        {...props}
      >
        {loading ? (
          <Spinner size="sm" className="shrink-0" />
        ) : (
          leftIcon && <span className="shrink-0 [&>svg]:size-4">{leftIcon}</span>
        )}
        {children && <span>{children}</span>}
        {!loading && rightIcon && (
          <span className="shrink-0 [&>svg]:size-4">{rightIcon}</span>
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';
