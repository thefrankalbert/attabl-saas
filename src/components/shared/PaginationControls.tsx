'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaginationControlsProps {
  page: number;
  pageCount: number;
  totalCount: number;
  canPrevPage: boolean;
  canNextPage: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  /** Label for the items, e.g. "commandes" */
  itemLabel?: string;
}

export function PaginationControls({
  page,
  pageCount,
  totalCount,
  canPrevPage,
  canNextPage,
  onPrevPage,
  onNextPage,
  itemLabel = 'éléments',
}: PaginationControlsProps) {
  if (pageCount <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
      <span>
        {totalCount} {itemLabel}
      </span>
      <div className="flex items-center gap-2">
        <span>
          Page {page + 1} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={onPrevPage}
          disabled={!canPrevPage}
          aria-label="Page précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={onNextPage}
          disabled={!canNextPage}
          aria-label="Page suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
