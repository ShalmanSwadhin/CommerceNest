import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../cn';
import { IconButton } from './IconButton';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Callers overwhelmingly pass `onClose={() => ...}` as an inline closure,
  // so its identity changes on every render of the parent — including
  // renders triggered by keystrokes in a controlled input inside this modal.
  // Routing it through a ref (instead of the effect's dependency array)
  // keeps the mount/focus-trap effect below from tearing down and
  // re-running on every keystroke, which was stealing focus to the first
  // focusable element (the close button) after each typed character.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const trapFocus = useCallback((event: KeyboardEvent) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';

    const timer = requestAnimationFrame(() => {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      focusable?.[0]?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
      trapFocus(event);
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnimationFrame(timer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      previousFocusRef.current?.focus();
    };
  }, [open, trapFocus]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-hidden
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        aria-describedby={description ? 'modal-description' : undefined}
        className={cn(
          'relative z-10 flex max-h-[85vh] w-full flex-col rounded-[var(--cn-radius-lg)]',
          'bg-[var(--cn-color-surface-overlay)] shadow-[var(--cn-shadow-4)]',
          'border border-[var(--cn-color-border-default)]',
          'transition-opacity duration-[var(--cn-duration-normal)]',
          sizeClasses[size],
          className,
        )}
      >
        {(title || description) && (
          <div className="flex shrink-0 items-start justify-between gap-4 p-6 pb-0">
            <div className="flex flex-col gap-1.5">
              {title && (
                <h2
                  id="modal-title"
                  className="text-lg font-semibold text-[var(--cn-color-text-primary)]"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p
                  id="modal-description"
                  className="text-sm text-[var(--cn-color-text-secondary)]"
                >
                  {description}
                </p>
              )}
            </div>
            <IconButton label="Close dialog" variant="ghost" size="sm" onClick={onClose}>
              <X />
            </IconButton>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
        {footer && (
          <div
            className={cn(
              'flex shrink-0 items-center justify-end gap-3 px-6 py-4',
              'border-t border-[var(--cn-color-border-default)]',
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
