import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
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

type DescribableElementProps = {
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
};

export function FormField({
  label,
  htmlFor,
  description,
  error,
  required,
  children,
  className,
}: FormFieldProps) {
  // IDs are derived from `htmlFor`, which callers already set to a unique,
  // stable value to associate the <label> — reusing it keeps these ids
  // unique/stable for free instead of generating a separate one.
  const descriptionId = htmlFor && description ? `${htmlFor}-description` : undefined;
  const errorId = htmlFor && error ? `${htmlFor}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  // FormField wraps a single Input/Textarea/select — clone it to wire
  // aria-describedby (pointing at the description/error text below) and
  // aria-invalid, so screen readers announce *why* a field is invalid, not
  // just that role="alert" fired something somewhere on the page. Falls
  // back to rendering children as-is if it isn't a single element (e.g. a
  // custom composite control), rather than crashing.
  const child =
    describedBy && isValidElement(children)
      ? cloneElement(children as ReactElement<DescribableElementProps>, {
          'aria-describedby':
            [
              (children as ReactElement<DescribableElementProps>).props['aria-describedby'],
              describedBy,
            ]
              .filter(Boolean)
              .join(' ') || undefined,
          'aria-invalid':
            error !== undefined
              ? true
              : (children as ReactElement<DescribableElementProps>).props['aria-invalid'],
        })
      : children;

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
        <p id={descriptionId} className="text-sm text-[var(--cn-color-text-secondary)]">
          {description}
        </p>
      )}
      {child}
      {error && (
        <p
          className="text-sm text-[var(--cn-color-danger)]"
          role="alert"
          id={errorId}
        >
          {error}
        </p>
      )}
    </div>
  );
}
