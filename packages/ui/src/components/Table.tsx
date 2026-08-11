import {
  type HTMLAttributes,
  type ReactNode,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../cn';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';
import { Spinner } from './Spinner';

export type DataTableState = 'loading' | 'ready' | 'empty' | 'error';

export interface TableColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  state?: DataTableState;
  getRowKey: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  errorMessage?: string;
  className?: string;
}

export function Table({ className, children, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn(
          'w-full caption-bottom text-sm border-collapse',
          className,
        )}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHeader({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        'border-b border-[var(--cn-color-border-default)]',
        '[&_tr]:border-0',
        className,
      )}
      {...props}
    >
      {children}
    </thead>
  );
}

export function TableBody({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    >
      {children}
    </tbody>
  );
}

export function TableRow({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'border-b border-[var(--cn-color-border-default)]',
        'transition-colors hover:bg-[var(--cn-color-surface-raised)]',
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableHead({
  className,
  children,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'h-11 px-4 text-left align-middle font-medium',
        'text-[var(--cn-color-text-secondary)]',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableCell({
  className,
  children,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        'px-4 py-3 align-middle text-[var(--cn-color-text-primary)]',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

export function DataTable<T>({
  columns,
  data,
  state = 'ready',
  getRowKey,
  emptyTitle = 'No results',
  emptyDescription = 'Try adjusting your filters or search query.',
  errorMessage = 'Something went wrong while loading data.',
  className,
}: DataTableProps<T>) {
  if (state === 'loading') {
    return (
      <div className={cn('rounded-[var(--cn-radius-lg)] border border-[var(--cn-color-border-default)]', className)}>
        <div className="flex items-center justify-center gap-3 py-16">
          <Spinner />
          <span className="text-sm text-[var(--cn-color-text-secondary)]">
            Loading…
          </span>
        </div>
        <div className="hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={44} className="mb-2 mx-4" />
          ))}
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div
        className={cn(
          'rounded-[var(--cn-radius-lg)] border border-[var(--cn-color-danger-border)]',
          'bg-[var(--cn-color-danger-subtle)]',
          className,
        )}
      >
        <EmptyState
          icon={<AlertCircle />}
          title="Failed to load"
          description={errorMessage}
        />
      </div>
    );
  }

  if (state === 'empty' || data.length === 0) {
    return (
      <div
        className={cn(
          'rounded-[var(--cn-radius-lg)] border border-[var(--cn-color-border-default)]',
          className,
        )}
      >
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-[var(--cn-radius-lg)] border border-[var(--cn-color-border-default)]',
        'bg-[var(--cn-color-surface-base)] overflow-hidden',
        className,
      )}
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead key={col.key} className={col.headerClassName}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow key={getRowKey(row)}>
              {columns.map((col) => (
                <TableCell key={col.key} className={col.className}>
                  {col.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
