'use client';

import { useTranslations } from 'next-intl';
import { X, Receipt } from 'lucide-react';
import { ListRowsSkeleton } from '@/components/admin/skeletons/ListRowsSkeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrencyMinor } from '@/lib/utils/money';
import type { Order, CurrencyCode } from '@/types/admin.types';

interface POSUnpaidPanelProps {
  open: boolean;
  onClose: () => void;
  orders: Order[];
  loading: boolean;
  currency: CurrencyCode;
  onSelect: (order: Order) => void;
}

/**
 * Cash-desk panel listing orders awaiting payment (audit C2). Selecting an order
 * routes it to the existing PaymentModal (order mode) -> actionMarkOrderPaid, so
 * the cashier bills the actual QR/served order instead of re-ringing a duplicate.
 */
export default function POSUnpaidPanel({
  open,
  onClose,
  orders,
  loading,
  currency,
  onSelect,
}: POSUnpaidPanelProps) {
  const t = useTranslations('pos');
  const tc = useTranslations('common');

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
    >
      <div aria-hidden className="absolute inset-0 h-full w-full" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden border-l border-app-border bg-app-card animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-app-border px-4 py-3 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-app-text">{t('toSettle')}</h2>
            <p className="text-xs text-app-text-muted">{t('toSettleSubtitle')}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={tc('cancel')}
            onClick={onClose}
            className="min-h-[44px] min-w-[44px]"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <ListRowsSkeleton rows={4} />
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-app-text-muted">
              <Receipt className="h-8 w-8 opacity-40" />
              <p className="text-sm">{t('toSettleEmpty')}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {orders.map((order) => {
                const label = order.order_number || order.table_number || order.id.slice(0, 6);
                const itemCount = (order.items || []).reduce((n, i) => n + (i.quantity || 0), 0);
                // Tableless POS orders store a "CMD-<n>" ticket id in table_number
                // (the column is NOT NULL server-side) - do not title them "Table CMD-n".
                const isRealTable = !!order.table_number && !/^CMD-/i.test(order.table_number);
                return (
                  <li key={order.id}>
                    <Button
                      variant="ghost"
                      onClick={() => onSelect(order)}
                      className={cn(
                        'flex h-auto w-full items-center justify-between gap-3 rounded-xl border border-app-border bg-app-elevated px-4 py-3 text-left',
                        'min-h-[44px] hover:border-accent/40 hover:bg-app-bg',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-app-text">
                          {isRealTable
                            ? t('tableWithNumber', { table: order.table_number })
                            : `#${label}`}
                        </span>
                        <span className="block truncate text-xs text-app-text-muted">
                          {/* Do not repeat the order number when it is already the title */}
                          {isRealTable && order.order_number
                            ? `#${order.order_number} - ${t('itemsCount', { count: itemCount })}`
                            : t('itemsCount', { count: itemCount })}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold text-app-text">
                        {formatCurrencyMinor(order.total_price || 0, currency)}
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
