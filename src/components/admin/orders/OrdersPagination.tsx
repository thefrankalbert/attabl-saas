'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ListPagination } from '@/components/admin/ListPagination';
import type { ServerListPagination } from '@/lib/pagination';

interface OrdersPaginationProps {
  serverListPagination?: ServerListPagination;
  page: number;
  pageSize: number;
  ordersLength: number;
  onPageChange: (pageIndex: number) => void;
}

/** Orders list pagination - server-driven when available, client fallback otherwise. */
export default function OrdersPagination({
  serverListPagination,
  page,
  pageSize,
  ordersLength,
  onPageChange,
}: OrdersPaginationProps) {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const useServerPagination = !!serverListPagination;

  return useServerPagination && serverListPagination ? (
    <ListPagination
      page={page}
      pageSize={pageSize}
      totalCount={serverListPagination.total}
      onPageChange={onPageChange}
    />
  ) : (
    <div className="flex items-center justify-center gap-2 py-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(Math.max(0, page - 1))}
        disabled={page === 0}
      >
        {tc('previous') || 'Precedent'}
      </Button>
      <span className="text-xs text-app-text-muted">
        {t('pageOf', { page: page + 1 }) || `Page ${page + 1}`}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={ordersLength < pageSize}
      >
        {tc('next') || 'Suivant'}
      </Button>
    </div>
  );
}
