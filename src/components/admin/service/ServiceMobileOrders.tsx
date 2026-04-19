'use client';

import { CheckCircle2, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatTimeHHMM, getElapsedMinutes } from './service-status';
import type { Order } from '@/types/admin.types';

interface Props {
  readyOrders: Order[];
  now: number;
  labels: {
    title: string;
    empty: string;
    markDelivered: string;
    tableShort: string;
    minutesAgoShort: (min: number) => string;
    itemsCount: (n: number) => string;
  };
  onMarkDelivered: (orderId: string) => void;
}

export function ServiceMobileOrders({ readyOrders, now, labels, onMarkDelivered }: Props) {
  return (
    <section className="shrink-0 border-t border-app-border/50 bg-app-card px-4 py-3 lg:hidden">
      <header className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.2px] text-app-text-muted">
        <Utensils className="h-3 w-3 text-status-warning" />
        <span>{labels.title}</span>
        <span className="ml-auto font-mono font-medium text-app-text-secondary">
          {readyOrders.length}
        </span>
      </header>

      {readyOrders.length === 0 ? (
        <div className="rounded border border-dashed border-app-border px-3 py-4 text-center text-[11px] text-app-text-muted">
          {labels.empty}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-[40vh] overflow-y-auto [scrollbar-width:none]">
          {readyOrders.map((order) => {
            const items = order.items ?? [];
            const minutes = getElapsedMinutes(order.created_at, now);
            return (
              <div
                key={order.id}
                className="flex items-center gap-2.5 rounded border border-app-border bg-app-elevated p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-app-text">
                      {labels.tableShort} {order.table_number}
                    </span>
                    <span className="font-mono text-[10px] text-app-text-muted">
                      {formatTimeHHMM(order.created_at)} · {labels.minutesAgoShort(minutes)}
                    </span>
                  </div>
                  <div className="text-[11px] text-app-text-secondary">
                    {labels.itemsCount(items.length)}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onMarkDelivered(order.id)}
                  className="h-8 shrink-0 gap-1 bg-status-success px-2.5 text-[11px] font-semibold text-white hover:bg-status-success/90"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {labels.markDelivered}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
