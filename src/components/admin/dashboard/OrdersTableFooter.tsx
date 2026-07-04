'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PAGE_SIZE_OPTIONS } from './orders-table.constants';

interface OrdersTableFooterProps {
  selectedCount: number;
  pageSize: number;
  setPageSize: Dispatch<SetStateAction<number>>;
  setPage: Dispatch<SetStateAction<number>>;
  safePage: number;
  pageCount: number;
}

export function OrdersTableFooter({
  selectedCount,
  pageSize,
  setPageSize,
  setPage,
  safePage,
  pageCount,
}: OrdersTableFooterProps) {
  const t = useTranslations('admin');

  return (
    <div className="mt-3 flex flex-col items-stretch gap-3 px-1 sm:flex-row sm:items-center">
      <div className="flex-1 text-[13px] text-[var(--muted-foreground)]">
        {t('selectedCount', { count: selectedCount })}
      </div>
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          {t('rowsPerPage')}
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(0);
            }}
          >
            <SelectTrigger className="h-[30px] w-[72px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-[13px] font-medium">
          {t('pageOf', { page: safePage + 1, total: pageCount })}
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-[30px]"
            disabled={safePage === 0}
            onClick={() => setPage(0)}
            aria-label="First page"
          >
            <ChevronsLeft className="size-[15px]" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-[30px]"
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-[15px]" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-[30px]"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            aria-label="Next page"
          >
            <ChevronRight className="size-[15px]" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-[30px]"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(pageCount - 1)}
            aria-label="Last page"
          >
            <ChevronsRight className="size-[15px]" />
          </Button>
        </div>
      </div>
    </div>
  );
}
