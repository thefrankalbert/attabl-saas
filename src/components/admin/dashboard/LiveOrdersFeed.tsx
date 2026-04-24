'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Clock, Pause, Play, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Order } from '@/types/admin.types';
import { STATUS_STYLES } from '@/lib/design-tokens';
import type { OrderStatus } from '@/lib/design-tokens';

interface LiveOrdersFeedProps {
  orders: Order[];
  adminBase: string;
  formatValue: (n: number) => string;
  currentTime: Date;
  labels: {
    title: string;
    countSuffix: string;
    pauseTitle: string;
    resumeTitle: string;
    emptyTitle: string;
    emptySubtitle: string;
    newLabel: string;
    statusDelivered: string;
    statusPending: string;
    statusPreparing: string;
    statusCanceled: string;
    statusDefault: string;
  };
}

function statusLabel(status: string, labels: LiveOrdersFeedProps['labels']): string {
  switch (status) {
    case 'delivered':
      return labels.statusDelivered;
    case 'pending':
      return labels.statusPending;
    case 'preparing':
      return labels.statusPreparing;
    case 'canceled':
      return labels.statusCanceled;
    default:
      return labels.statusDefault;
  }
}

function formatTime(iso: string, locale = 'fr-FR'): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

export function LiveOrdersFeed({
  orders,
  adminBase,
  formatValue,
  currentTime,
  labels,
}: LiveOrdersFeedProps) {
  const [paused, setPaused] = useState(false);
  const now = currentTime.getTime();

  // Snapshot orders when paused so incoming realtime updates do not mutate the view
  const [snapshot, setSnapshot] = useState<Order[] | null>(null);
  const visible = useMemo(
    () => (paused && snapshot ? snapshot : orders),
    [paused, snapshot, orders],
  );

  const togglePause = () => {
    setPaused((p) => {
      const next = !p;
      setSnapshot(next ? orders : null);
      return next;
    });
  };

  return (
    <div className="rounded-[10px] border border-app-border bg-app-card overflow-hidden flex flex-col flex-1 min-h-[240px] @lg:min-h-0">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-app-border">
        <div className="flex items-center gap-2 text-[13px] font-medium text-app-text">
          <Zap className="w-[13px] h-[13px] text-app-text-muted" />
          <span>{labels.title}</span>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] text-app-text-secondary">
          <span className="w-1.5 h-1.5 rounded-full bg-accent admin-pulse" aria-hidden />
          {orders.length} {labels.countSuffix}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={paused ? labels.resumeTitle : labels.pauseTitle}
          onClick={togglePause}
          title={paused ? labels.resumeTitle : labels.pauseTitle}
          className="w-[30px] h-[30px] rounded-md border border-app-border bg-app-card text-app-text-secondary hover:bg-app-elevated hover:text-app-text"
        >
          {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto admin-thin-scroll">
        {visible.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[13px] text-app-text">{labels.emptyTitle}</p>
            <p className="text-[11px] text-app-text-muted mt-1">{labels.emptySubtitle}</p>
          </div>
        ) : (
          visible.map((order, idx) => {
            const sc = STATUS_STYLES[order.status as OrderStatus] || STATUS_STYLES.pending;
            const ageSeconds = Math.floor((now - new Date(order.created_at).getTime()) / 1000);
            const isNew = ageSeconds < 300 && idx === 0;
            const orderLabel = order.order_number || `#${order.id.slice(0, 6).toUpperCase()}`;
            const items = order.items ?? [];
            const itemsSummary = items
              .slice(0, 3)
              .map((i) => `${i.quantity}x ${i.name}`)
              .join(' · ');

            return (
              <Link
                key={order.id}
                href={`${adminBase}/orders/${order.id}`}
                className={cn(
                  'relative grid grid-cols-[28px_1fr_auto] items-center gap-3 px-5 py-2.5 border-b border-app-border last:border-b-0 hover:bg-app-elevated/70 transition-colors cursor-pointer',
                  isNew && 'admin-flash-in',
                )}
              >
                <div className="w-7 h-7 rounded-md border border-app-border bg-app-bg grid place-items-center text-app-text-secondary">
                  <Clock className="w-3 h-3" />
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-xs text-app-text flex items-center gap-2 truncate">
                    <span>{orderLabel}</span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-1.5 py-[2px] rounded text-[10px] uppercase tracking-[0.08em]',
                        sc.bg,
                        sc.text,
                      )}
                    >
                      <span className="w-1 h-1 rounded-full bg-current" />
                      {statusLabel(order.status, labels)}
                    </span>
                  </div>
                  <div className="mt-[3px] font-mono text-[11px] text-app-text-muted truncate">
                    {order.table_number} · {itemsSummary || labels.statusDefault}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-[13px] tabular-nums">
                    {formatValue((order.total_price ?? 0) + (order.tip_amount ?? 0))}
                  </div>
                  <div className="font-mono text-[10px] text-app-text-muted mt-[2px]">
                    {formatTime(order.created_at)}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
