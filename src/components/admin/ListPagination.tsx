'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ListPaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function ListPagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  className,
}: ListPaginationProps) {
  const tc = useTranslations('common');
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  if (totalCount <= pageSize) {
    return null;
  }

  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, totalCount);
  const isFirstPage = page === 0;
  const isLastPage = page >= totalPages - 1;

  const goToPage = (nextPage: number) => {
    onPageChange(Math.max(0, Math.min(nextPage, totalPages - 1)));
  };

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 border-t border-app-border bg-app-card px-4 py-3',
        className,
      )}
    >
      <span className="text-xs text-app-text-secondary">
        {tc('paginationShowing', { from, to, total: totalCount })}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(0)}
          disabled={isFirstPage}
          className="h-9 w-9 p-0"
          aria-label={tc('aria.firstPage')}
        >
          <ChevronsLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(page - 1)}
          disabled={isFirstPage}
          className="h-9 w-9 p-0"
          aria-label={tc('aria.previous')}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium text-app-text px-3 tabular-nums min-w-[4.5rem] text-center">
          {tc('paginationPage', { current: page + 1, total: totalPages })}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(page + 1)}
          disabled={isLastPage}
          className="h-9 w-9 p-0"
          aria-label={tc('aria.next')}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(totalPages - 1)}
          disabled={isLastPage}
          className="h-9 w-9 p-0"
          aria-label={tc('aria.lastPage')}
        >
          <ChevronsRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
