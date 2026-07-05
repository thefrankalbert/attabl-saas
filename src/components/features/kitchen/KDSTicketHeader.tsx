'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { Order } from '@/types/admin.types';

interface KDSTicketHeaderProps {
  order: Order;
  shortOrderNumber: string | undefined;
  dueTimeStr: string;
  serverName: string | undefined;
  serviceLabel: string | null;
  isDelayed: boolean;
  badge: { labelKey: string; className: string };
}

export default function KDSTicketHeader({
  order,
  shortOrderNumber,
  dueTimeStr,
  serverName,
  serviceLabel,
  isDelayed,
  badge,
}: KDSTicketHeaderProps) {
  const t = useTranslations('kitchen');

  return (
    <div className="px-3 pt-2.5 pb-2 border-b border-app-border">
      {/* Line 1: #order_number . table_number   Due HH:MM */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs font-semibold text-app-text">#{shortOrderNumber}</span>
          {order.order_number && order.table_number && (
            <>
              <span className="text-app-text-muted text-xs" aria-hidden="true">
                -
              </span>
              <span className="text-xs font-semibold text-app-text truncate">
                {order.table_number}
              </span>
            </>
          )}
        </div>
        <span className="text-xs text-app-text-muted shrink-0">
          {t('due')} {dueTimeStr}
        </span>
      </div>

      {/* Line 2: server . customer . service_type   [STATUS BADGE] */}
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <div className="flex items-center gap-1 min-w-0 text-xs text-app-text-muted truncate">
          {serverName && (
            <span className="font-medium text-app-text-secondary truncate max-w-24">
              {serverName}
            </span>
          )}
          {order.customer_name && (
            <>
              <span aria-hidden="true">-</span>
              <span className="truncate max-w-24">{order.customer_name}</span>
            </>
          )}
          {serviceLabel && (
            <>
              <span aria-hidden="true">-</span>
              <span>{serviceLabel}</span>
            </>
          )}
          {order.service_type === 'room_service' && order.room_number && (
            <span className="ml-0.5">Ch. {order.room_number}</span>
          )}
        </div>
        <span
          className={cn(
            'text-[10px] font-medium normal-case px-1.5 py-0.5 rounded shrink-0',
            isDelayed ? 'border border-[var(--border)] text-[var(--destructive)]' : badge.className,
          )}
        >
          {isDelayed ? t('footerDelayed').toUpperCase() : t(badge.labelKey)}
        </span>
      </div>
    </div>
  );
}
