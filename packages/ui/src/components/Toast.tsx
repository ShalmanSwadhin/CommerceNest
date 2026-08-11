import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../cn';
export type ToastTone = 'success' | 'caution' | 'danger' | 'info' | 'neutral';

export interface ToastData {
  id: string;
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
}

interface ToastContextValue {
  toast: (data: Omit<ToastData, 'id'>) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export interface ToastProviderProps {
  children: ReactNode;
  position?: 'top-right' | 'bottom-right' | 'top-center';
}

const positionClasses = {
  'top-right': 'top-4 right-4 items-end',
  'bottom-right': 'bottom-4 right-4 items-end',
  'top-center': 'top-4 left-1/2 -translate-x-1/2 items-center',
};

const toastToneBorder: Record<ToastTone, string> = {
  success: 'border-l-[var(--cn-color-success)]',
  caution: 'border-l-[var(--cn-color-caution)]',
  danger: 'border-l-[var(--cn-color-danger)]',
  info: 'border-l-[var(--cn-color-info)]',
  neutral: 'border-l-[var(--cn-color-neutral)]',
};

let toastCounter = 0;

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const duration = toast.duration ?? 5000;
    if (duration <= 0) return;
    const timer = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const borderClass =
    toastToneBorder[toast.tone ?? 'info'] ?? toastToneBorder.info;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-auto w-full max-w-sm rounded-[var(--cn-radius-md)]',
        'border border-[var(--cn-color-border-default)] border-l-4',
        'bg-[var(--cn-color-surface-overlay)] shadow-[var(--cn-shadow-3)]',
        'p-4 flex gap-3',
        borderClass,
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--cn-color-text-primary)]">
          {toast.title}
        </p>
        {toast.description && (
          <p className="mt-1 text-sm text-[var(--cn-color-text-secondary)]">
            {toast.description}
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className={cn(
          'shrink-0 rounded-[var(--cn-radius-sm)] p-1',
          'text-[var(--cn-color-text-tertiary)] hover:text-[var(--cn-color-text-primary)]',
          'focus-visible:outline-none',
          'focus-visible:ring-[var(--cn-focus-ring-width)]',
          'focus-visible:ring-[var(--cn-focus-ring-color)]',
        )}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function ToastProvider({
  children,
  position = 'top-right',
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((data: Omit<ToastData, 'id'>) => {
    const id = `toast-${++toastCounter}`;
    setToasts((prev) => [...prev, { ...data, id }]);
    return id;
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          aria-label="Notifications"
          className={cn(
            'fixed z-[100] flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4',
            positionClasses[position],
          )}
        >
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export interface ToastProps extends Omit<ToastData, 'id'> {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Standalone toast display — prefer ToastProvider + useToast for app usage */
export function Toast({
  title,
  description,
  tone = 'info',
  open = true,
  onOpenChange,
}: ToastProps) {
  if (!open) return null;

  const borderClass = toastToneBorder[tone] ?? toastToneBorder.info;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'w-full max-w-sm rounded-[var(--cn-radius-md)]',
        'border border-[var(--cn-color-border-default)] border-l-4',
        'bg-[var(--cn-color-surface-overlay)] shadow-[var(--cn-shadow-3)]',
        'p-4',
        borderClass,
      )}
    >
      <div className="flex gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--cn-color-text-primary)]">
            {title}
          </p>
          {description && (
            <p className="mt-1 text-sm text-[var(--cn-color-text-secondary)]">
              {description}
            </p>
          )}
        </div>
        {onOpenChange && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => onOpenChange(false)}
            className="text-[var(--cn-color-text-tertiary)] hover:text-[var(--cn-color-text-primary)]"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
