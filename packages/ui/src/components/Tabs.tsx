import {
  createContext,
  useContext,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '../cn';

interface TabsContextValue {
  value: string;
  onChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs components must be used within <Tabs>');
  return ctx;
}

export interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({
  value: controlledValue,
  defaultValue = '',
  onValueChange,
  children,
  className,
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = controlledValue ?? internalValue;

  const onChange = (next: string) => {
    if (controlledValue === undefined) setInternalValue(next);
    onValueChange?.(next);
  };

  return (
    <TabsContext.Provider value={{ value, onChange }}>
      <div className={cn('flex flex-col gap-4', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export interface TabsListProps extends HTMLAttributes<HTMLDivElement> {}

export function TabsList({ className, children, ...props }: TabsListProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-1 p-1 rounded-[var(--cn-radius-md)]',
        'bg-[var(--cn-color-surface-sunken)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface TabsTriggerProps
  extends Omit<HTMLAttributes<HTMLButtonElement>, 'value'> {
  value: string;
}

export function TabsTrigger({
  value,
  className,
  children,
  ...props
}: TabsTriggerProps) {
  const { value: selected, onChange } = useTabsContext();
  const isActive = selected === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      onClick={() => onChange(value)}
      className={cn(
        'inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium',
        'rounded-[var(--cn-radius-sm)] transition-colors duration-[var(--cn-duration-fast)]',
        'focus-visible:outline-none',
        'focus-visible:ring-[var(--cn-focus-ring-width)]',
        'focus-visible:ring-[var(--cn-focus-ring-color)]',
        'focus-visible:ring-offset-[var(--cn-focus-ring-offset)]',
        isActive
          ? 'bg-[var(--cn-color-surface-base)] text-[var(--cn-color-text-primary)] shadow-[var(--cn-shadow-1)]'
          : 'text-[var(--cn-color-text-secondary)] hover:text-[var(--cn-color-text-primary)]',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function TabsContent({
  value,
  className,
  children,
  ...props
}: TabsContentProps) {
  const { value: selected } = useTabsContext();
  if (selected !== value) return null;

  return (
    <div
      role="tabpanel"
      className={cn('focus-visible:outline-none', className)}
      tabIndex={0}
      {...props}
    >
      {children}
    </div>
  );
}
