'use client';

import { useTranslations } from 'next-intl';
import type { Order } from '@/types/admin.types';
import type { useOrderDetails } from './useOrderDetails';

interface OrderItemsListProps {
  order: Order;
  itemCount: number;
  hasBreakdown: ReturnType<typeof useOrderDetails>['hasBreakdown'];
  displayTotal: number;
  tipAmount: number;
  fmt: (amount: number) => string;
  fmtMajor: (amount: number) => string;
}

export function OrderItemsList({
  order,
  itemCount,
  hasBreakdown,
  displayTotal,
  tipAmount,
  fmt,
  fmtMajor,
}: OrderItemsListProps) {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const ta = useTranslations('admin');

  return (
    <div className="rounded-xl border border-app-border overflow-hidden flex flex-col min-h-0 flex-1">
      <div className="px-3 py-2 bg-app-bg border-b border-app-border flex items-center justify-between shrink-0">
        <p className="text-[10px] font-medium text-app-text-secondary uppercase tracking-wider">
          {t('orderDetails')}
        </p>
        <p className="text-[10px] text-app-text-muted">
          {itemCount} {tc('items')}
        </p>
      </div>
      <div className="overflow-y-auto flex-1 divide-y divide-app-border">
        {(order.items || []).map((item, i) => (
          <div key={i} className="flex justify-between items-start px-3 py-2">
            <div className="flex gap-2 min-w-0 flex-1">
              <div className="w-5 h-5 bg-app-elevated rounded flex items-center justify-center text-[10px] font-bold text-app-text shrink-0 mt-0.5">
                {item.quantity}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-xs text-app-text">{item.name}</p>
                {item.customer_notes && (
                  <p className="text-[10px] text-status-warning mt-0.5 bg-status-warning-bg px-1.5 py-0.5 rounded inline-block">
                    {item.customer_notes}
                  </p>
                )}
                {item.notes && !item.customer_notes && (
                  <p className="text-[10px] text-app-text-muted mt-0.5">{item.notes}</p>
                )}
                {item.modifiers && Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                  <div className="mt-0.5">
                    {item.modifiers.map((m, mi) => (
                      <p key={mi} className="text-[10px] text-status-info">
                        + {m.name} ({fmtMajor(m.price)})
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="font-medium text-sm text-app-text">{fmt(item.price * item.quantity)}</p>
          </div>
        ))}
      </div>

      {/* Price breakdown inside the items card */}
      {hasBreakdown && (
        <div className="border-t border-app-border px-3 py-2 space-y-1 shrink-0 bg-app-bg">
          <div className="flex justify-between text-[11px] text-app-text-secondary">
            <span>{t('subtotal')}</span>
            <span>{fmt(order.subtotal || 0)}</span>
          </div>
          {(order.tax_amount ?? 0) > 0 && (
            <div className="flex justify-between text-[11px] text-app-text-secondary">
              <span>{t('vat')}</span>
              <span>{fmt(order.tax_amount!)}</span>
            </div>
          )}
          {(order.service_charge_amount ?? 0) > 0 && (
            <div className="flex justify-between text-[11px] text-app-text-secondary">
              <span>{t('serviceCharge')}</span>
              <span>{fmt(order.service_charge_amount!)}</span>
            </div>
          )}
          {(order.discount_amount ?? 0) > 0 && (
            <div className="flex justify-between text-[11px] text-status-error">
              <span>{t('discountLabel')}</span>
              <span>-{fmt(order.discount_amount!)}</span>
            </div>
          )}
          {tipAmount > 0 && (
            <div className="flex justify-between text-[11px] text-[var(--success)]">
              <span>{ta('tipLabel')}</span>
              <span>+{fmt(tipAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-xs text-app-text border-t border-app-border pt-1.5 mt-1">
            <span>{tc('total')}</span>
            <span>{fmt(displayTotal + tipAmount)}</span>
          </div>
        </div>
      )}

      {/* Tip-only footer when no full breakdown exists but tip is present */}
      {!hasBreakdown && tipAmount > 0 && (
        <div className="border-t border-app-border px-3 py-2 space-y-1 shrink-0 bg-app-bg">
          <div className="flex justify-between text-[11px] text-[var(--success)]">
            <span>{ta('tipLabel')}</span>
            <span>+{fmt(tipAmount)}</span>
          </div>
          <div className="flex justify-between font-bold text-xs text-app-text border-t border-app-border pt-1.5 mt-1">
            <span>{tc('total')}</span>
            <span>{fmt(displayTotal + tipAmount)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
