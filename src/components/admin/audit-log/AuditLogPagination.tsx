'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PAGE_SIZE } from './types';

interface AuditLogPaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  setPage: Dispatch<SetStateAction<number>>;
}

export default function AuditLogPagination({
  page,
  totalPages,
  totalCount,
  setPage,
}: AuditLogPaginationProps) {
  const t = useTranslations('auditLog');

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-app-text-secondary">
        {t('showing', {
          from: page * PAGE_SIZE + 1,
          to: Math.min((page + 1) * PAGE_SIZE, totalCount),
          total: totalCount,
        })}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(page - 1)}
          disabled={page === 0}
          className="h-9 w-9 p-0"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium text-app-text px-3">
          {page + 1} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(page + 1)}
          disabled={page >= totalPages - 1}
          className="h-9 w-9 p-0"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
