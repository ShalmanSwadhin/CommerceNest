import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../cn';

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-[var(--cn-radius-md)] px-3 py-2 text-sm',
        'bg-[var(--cn-color-surface-base)] text-[var(--cn-color-text-primary)]',
        'border border-[var(--cn-color-border-input)]',
        'placeholder:text-[var(--cn-color-text-tertiary)]',
        'transition-colors duration-[var(--cn-duration-fast)]',
        'hover:border-[var(--cn-color-border-strong)]',
        'focus-visible:outline-none',
        'focus-visible:ring-[var(--cn-focus-ring-width)]',
        'focus-visible:ring-[var(--cn-focus-ring-color)]',
        'focus-visible:ring-offset-[var(--cn-focus-ring-offset)]',
        'focus-visible:ring-offset-[var(--cn-color-surface-base)]',
        'focus-visible:border-[var(--cn-color-border-focus)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'resize-y',
        error && 'border-[var(--cn-color-danger)] focus-visible:ring-[var(--cn-color-danger)]',
        className,
      )}
      aria-invalid={error || undefined}
      {...props}
    />
  ),
);

Textarea.displayName = 'Textarea';
