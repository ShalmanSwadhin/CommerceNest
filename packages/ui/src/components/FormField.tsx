import { type ReactNode } from 'react';
import { cn } from '../cn';

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  description,
  error,
  required,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-[var(--cn-color-text-primary)]"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-[var(--cn-color-danger)]" aria-hidden>
            *
          </span>
        )}
      </label>
      {description && (
        <p className="text-sm text-[var(--cn-color-text-secondary)]">
          {description}
        </p>
      )}
      {children}
      {error && (
        <p
          className="text-sm text-[var(--cn-color-danger)]"
          role="alert"
          id={htmlFor ? `${htmlFor}-error` : undefined}
        >
          {error}
        </p>
      )}
    </div>
  );
}
