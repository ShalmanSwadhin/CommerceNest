import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../cn';
import { IconButton } from './IconButton';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  side?: 'left' | 'right';
  width?: 'sm' | 'md' | 'lg';
  className?: string;
}

const widthClasses = {
  sm: 'max-w-xs',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

export function Drawer({
  open,
  onClose,
  title,
  children,
  side = 'right',
  width = 'md',
  className,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50" role="presentation">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-hidden
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'absolute top-0 bottom-0 flex flex-col',
          'bg-[var(--cn-color-surface-overlay)] shadow-[var(--cn-shadow-4)]',
          'border-[var(--cn-color-border-default)]',
          'w-full outline-none',
          widthClasses[width],
          side === 'right'
            ? 'right-0 border-l'
            : 'left-0 border-r',
          className,
        )}
      >
        <div
          className={cn(
            'flex items-center justify-between gap-4 px-6 py-4',
            'border-b border-[var(--cn-color-border-default)]',
          )}
        >
          {title && (
            <h2 className="text-base font-semibold text-[var(--cn-color-text-primary)]">
              {title}
            </h2>
          )}
          <IconButton
            label="Close drawer"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="ml-auto"
          >
            <X />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
