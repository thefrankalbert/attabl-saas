'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Order } from '@/types/admin.types';
import type { OrderStatus } from '@/lib/design-tokens';
import type { GetOrderStatusConfig } from './use-order-status-config';

interface OrderMobileCardProps {
  order: Order;
  getStatusConfig: GetOrderStatusConfig;
  formatNumber: (n: number) => string;
  handleStatusChange: (orderId: string, newStatus: OrderStatus) => void;
}

/** Mobile card renderer for an order row (ResponsiveDataTable mobileConfig). */
export default function OrderMobileCard({
  order,
  getStatusConfig,
  formatNumber,
  handleStatusChange,
}: OrderMobileCardProps) {
  const tc = useTranslations('common');
  const ta = useTranslations('admin');

  const config = getStatusConfig(order.status);
  const total =
    (order.total_price ?? order.total ?? order.total_amount ?? 0) + (order.tip_amount ?? 0);
  const items = order.items || [];
  return (
    <div className="border-b border-app-border py-4 space-y-3 active:bg-app-hover transition-colors">
      {/* Row 1: Table + Status + Time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex min-w-[2rem] h-8 px-2 items-center justify-center font-bold text-app-text text-xs bg-app-bg rounded-lg">
            {order.table_number?.trim() || '-'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-app-text-muted">
            {new Date(order.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <span className={cn('px-2 py-1 rounded-full text-xs font-bold', config.bg, config.text)}>
            {config.label}
          </span>
          {/* C3: payment axis shown alongside fulfillment status */}
          {order.payment_status && (
            <span
              className={cn(
                'px-2 py-1 rounded-full text-xs font-bold',
                order.payment_status === 'paid'
                  ? 'bg-status-success-bg text-status-success'
                  : order.payment_status === 'refunded'
                    ? 'bg-app-bg text-app-text-muted'
                    : 'bg-status-warning-bg text-status-warning',
              )}
            >
              {ta(
                order.payment_status === 'paid'
                  ? 'payPaid'
                  : order.payment_status === 'partial'
                    ? 'payPartial'
                    : order.payment_status === 'refunded'
                      ? 'payRefunded'
                      : 'payPending',
              )}
            </span>
          )}
        </div>
      </div>

      {/* Row 2: Item names summary */}
      {items.length > 0 && (
        <p className="text-xs text-app-text-secondary">
          {items
            .slice(0, 3)
            .map((i) => `${i.quantity}× ${i.name}`)
            .join(', ')}
          {items.length > 3 && <span className="text-app-text-muted"> +{items.length - 3}</span>}
        </p>
      )}

      {/* Row 3: Server + Items count + Total */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-app-text-muted break-words">{order.server?.full_name ?? ' - '}</span>
        <div className="flex items-center gap-3">
          <span className="text-app-text-secondary">
            {items.reduce((sum, i) => sum + i.quantity, 0)} {tc('items')}
          </span>
          <div className="text-right">
            <span className="font-mono font-bold text-app-text">{formatNumber(total)}</span>
            {(order.tip_amount ?? 0) > 0 && (
              <span className="block text-xs text-[var(--success)] font-medium">
                +{formatNumber(order.tip_amount ?? 0)} {ta('tipLabel')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Actions */}
      {config.nextStatus && (
        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleStatusChange(order.id, config.nextStatus!);
            }}
            className="text-xs gap-1 min-h-[44px]"
          >
            {config.nextLabel} <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
