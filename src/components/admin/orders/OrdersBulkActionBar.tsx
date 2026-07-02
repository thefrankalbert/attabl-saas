'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ChevronRight, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import type { Order } from '@/types/admin.types';
import type { OrderStatus } from '@/lib/design-tokens';
import type { GetOrderStatusConfig } from './use-order-status-config';

interface OrdersBulkActionBarProps {
  selectedIds: Set<string>;
  orders: Order[];
  getStatusConfig: GetOrderStatusConfig;
  handleStatusChange: (orderId: string, newStatus: OrderStatus) => void;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  setShowDeleteConfirm: Dispatch<SetStateAction<boolean>>;
}

/** Bulk action bar - inline above the orders table. */
export default function OrdersBulkActionBar({
  selectedIds,
  orders,
  getStatusConfig,
  handleStatusChange,
  setSelectedIds,
  setShowDeleteConfirm,
}: OrdersBulkActionBarProps) {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const { toast } = useToast();

  return (
    <div
      className={cn(
        'flex items-center gap-2 h-8 mt-3 transition-opacity duration-150',
        selectedIds.size > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
    >
      <span className="text-xs font-medium text-app-text tabular-nums">
        {t('selected', { count: selectedIds.size })}
      </span>
      <div className="w-px h-4 bg-app-border" />
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next"
        onClick={() => {
          const ids = Array.from(selectedIds);
          const selectedOrders = ids
            .map((id) => orders.find((o) => o.id === id))
            .filter(Boolean) as Order[];

          // Filter out orders that can't be advanced (already delivered/cancelled)
          const eligibleOrders = selectedOrders.filter(
            (o) => o.status !== 'delivered' && o.status !== 'cancelled',
          );
          if (eligibleOrders.length === 0) {
            toast({
              title: t('noEligibleOrders') || 'Aucune commande eligible',
              variant: 'destructive',
            });
            return;
          }
          if (eligibleOrders.length < selectedOrders.length) {
            toast({
              title:
                t('someOrdersSkipped', {
                  count: selectedOrders.length - eligibleOrders.length,
                }) ||
                `${selectedOrders.length - eligibleOrders.length} commande(s) non-eligible(s) ignoree(s)`,
            });
          }

          eligibleOrders.forEach((order) => {
            const config = getStatusConfig(order.status);
            if (config.nextStatus) {
              handleStatusChange(order.id, config.nextStatus);
            }
          });
          setSelectedIds(new Set());
        }}
        title={t('advanceStatus')}
        className="h-8 w-8 text-accent hover:bg-accent-muted"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Delete"
        onClick={() => setShowDeleteConfirm(true)}
        title={tc('delete')}
        className="h-8 w-8 text-[var(--destructive)] hover:bg-[var(--accent)]"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Cancel selection"
        onClick={() => {
          setSelectedIds(new Set());
        }}
        title={tc('cancel')}
        className="h-8 w-8 text-app-text-muted"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
