'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { orderData, statusColors, type Segment } from './dashboard-preview.data';

export function DashboardPreviewOrders({ segment }: { segment: Segment }) {
  const t = useTranslations('marketing.home.videoHero.preview');
  const orders = orderData[segment];

  return (
    <div className="w-[42%] flex flex-col rounded-lg border border-app-border overflow-hidden bg-app-card">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-app-border shrink-0">
        <span className="text-[10px] font-semibold text-app-text-muted uppercase tracking-wider">
          {t('orders')}
        </span>
        <span className="text-[10px] font-semibold text-accent">{t('viewAll')}</span>
      </div>
      <div className="flex-1 overflow-hidden">
        {orders.map((order, i) => {
          const sc = statusColors[order.status];
          return (
            <div
              key={order.id}
              className={cn(
                'flex items-start gap-1.5 px-2 py-1.5',
                i < orders.length - 1 && 'border-b border-app-border',
              )}
            >
              <div className="relative shrink-0 mt-0.5">
                <div className={cn('h-1.5 w-1.5 rounded-full', sc.dot)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-app-text font-mono">
                    {order.table}
                  </span>
                  <span className="text-[10px] text-app-text-muted">{order.id}</span>
                  <span
                    className={cn('text-[10px] font-bold px-1 py-0.5 rounded-full', sc.bg, sc.text)}
                  >
                    {t(`status.${order.status}`)}
                  </span>
                </div>
                <p className="text-[10px] text-app-text-muted mt-0.5 truncate">{order.items}</p>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-[10px] font-bold text-app-text tabular-nums block">
                  {order.price}
                </span>
                <span className="text-[10px] text-app-text-muted">{order.time}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
