'use client';

import { cn } from '@/lib/utils';
import { ORDER_STATUS } from '@/lib/constants';
import type { OrderStatus } from '@/types/admin.types';
import { useTranslations } from 'next-intl';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = ORDER_STATUS[status as OrderStatus] || ORDER_STATUS.pending;
  const t = useTranslations('orders');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
        config.bgClass,
        config.textClass,
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dotClass)} />
      {t(config.key)}
    </span>
  );
}
