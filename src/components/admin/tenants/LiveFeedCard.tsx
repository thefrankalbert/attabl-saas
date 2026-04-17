'use client';

import { ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RecentOrder } from '@/types/command-center.types';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-400/15 text-amber-400 ring-amber-400/20',
  confirmed: 'bg-blue-400/15 text-blue-400 ring-blue-400/20',
  preparing: 'bg-violet-400/15 text-violet-400 ring-violet-400/20',
  ready: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/20',
  served: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/20',
  completed: 'bg-app-text-muted/10 text-app-text-muted ring-app-border',
  cancelled: 'bg-red-400/15 text-red-400 ring-red-400/20',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmee',
  preparing: 'En prep',
  ready: 'Prete',
  served: 'Servie',
  completed: 'Terminee',
  cancelled: 'Annulee',
};

function formatCFA(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount) + ' F';
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

interface LiveFeedCardProps {
  orders: RecentOrder[];
  multiTenant: boolean;
  onSelectTenant: (slug: string) => void;
}

export function LiveFeedCard({ orders, multiTenant, onSelectTenant }: LiveFeedCardProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-app-border px-1 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-app-text-muted">
            Flux en direct
          </h2>
          <span className="text-[11px] text-app-text-muted">{orders.length}</span>
        </div>
        {orders.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[10px] font-medium text-emerald-400">Live</span>
          </div>
        )}
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <ShoppingBag className="h-5 w-5 text-app-text-muted/40" />
          <p className="text-[11px] text-app-text-muted">Aucune commande recente</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-app-border overflow-y-auto scrollbar-hide">
          {orders.map((order) => (
            <li key={order.id}>
              <Button
                variant="ghost"
                onClick={() => onSelectTenant(order.tenant_slug)}
                className="group flex h-auto w-full items-center justify-start gap-3 rounded-none px-1 py-2 text-left hover:bg-app-hover/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-app-text">#{order.order_number}</span>
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1',
                        STATUS_STYLES[order.status] || STATUS_STYLES.pending,
                      )}
                    >
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                  </div>
                  {multiTenant && order.tenant_name && (
                    <p className="truncate text-[10px] text-app-text-muted">
                      {order.tenant_name}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-bold tabular-nums text-app-text">
                    {formatCFA(order.total)}
                  </p>
                  <p className="text-[10px] tabular-nums text-app-text-muted">
                    {formatTime(order.created_at)}
                  </p>
                </div>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
