import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../cn';
import { Button } from './Button';
import { IconButton } from './IconButton';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
  siblingCount?: number;
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function getPageNumbers(
  page: number,
  totalPages: number,
  siblingCount: number,
): (number | 'ellipsis')[] {
  if (totalPages <= 7) return range(1, totalPages);

  const left = Math.max(page - siblingCount, 1);
  const right = Math.min(page + siblingCount, totalPages);
  const pages: (number | 'ellipsis')[] = [];

  if (left > 1) {
    pages.push(1);
    if (left > 2) pages.push('ellipsis');
  }

  pages.push(...range(left, right));

  if (right < totalPages) {
    if (right < totalPages - 1) pages.push('ellipsis');
    pages.push(totalPages);
  }

  return pages;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
  siblingCount = 1,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);
  const pages = getPageNumbers(currentPage, totalPages, siblingCount);

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-col sm:flex-row items-center justify-between gap-4',
        className,
      )}
    >
      <p className="text-sm text-[var(--cn-color-text-secondary)]">
        Showing{' '}
        <span className="font-medium text-[var(--cn-color-text-primary)]">
          {start}–{end}
        </span>{' '}
        of{' '}
        <span className="font-medium text-[var(--cn-color-text-primary)]">
          {total}
        </span>
      </p>

      <div className="flex items-center gap-1">
        <IconButton
          label="Previous page"
          variant="ghost"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft />
        </IconButton>

        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span
              key={`ellipsis-${i}`}
              className="px-2 text-[var(--cn-color-text-tertiary)]"
              aria-hidden
            >
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === currentPage ? 'primary' : 'ghost'}
              size="sm"
              className="min-w-8 px-2"
              onClick={() => onPageChange(p)}
              aria-current={p === currentPage ? 'page' : undefined}
            >
              {p}
            </Button>
          ),
        )}

        <IconButton
          label="Next page"
          variant="ghost"
          size="sm"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight />
        </IconButton>
      </div>
    </nav>
  );
}
