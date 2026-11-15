'use client';

import { useTranslations } from 'next-intl';
import { formatCurrency } from '@/lib/utils/currency';

export interface CartDisplayItem {
  name: string;
  quantity: number;
  price: number;
  modifiers?: string[];
}

interface PaymentReceiptProps {
  currency: string;
  /** Order total, tip excluded (major units). */
  finalTotal: number;
  tipAmount: number;
  cartItems?: CartDisplayItem[];
  subtotal?: number;
  taxAmount?: number;
  serviceChargeAmount?: number;
  discountAmount?: number;
}

/** Left column of the payment screen: amount to pay, items, breakdown. */
export function PaymentReceipt({
  currency,
  finalTotal,
  tipAmount,
  cartItems,
  subtotal,
  taxAmount,
  serviceChargeAmount,
  discountAmount,
}: PaymentReceiptProps) {
  const t = useTranslations('payment');
  const totalWithTip = finalTotal + tipAmount;
  const money = (v: number) => formatCurrency(v, currency);

  // The items receipt (cart mode) already ends with its own Total row. Only
  // show the breakdown block when it adds information (taxes, service charge,
  // discount) or when there is no items receipt to display the total at all.
  const showItemsReceipt = !!cartItems && cartItems.length > 0;
  const hasExtras =
    (taxAmount ?? 0) > 0 || (serviceChargeAmount ?? 0) > 0 || (discountAmount ?? 0) > 0;
  const hasBreakdown = hasExtras || (!showItemsReceipt && subtotal !== undefined);

  const extraRow = (label: string, value: number | undefined, sign = '') =>
    value !== undefined && value > 0 ? (
      <div className="flex justify-between text-app-text-secondary text-xs">
        <span>{label}</span>
        <span className="tabular-nums font-mono">
          {sign}
          {money(value)}
        </span>
      </div>
    ) : null;

  const totalRow = (
    <div className="flex justify-between border-t border-app-border pt-2 text-sm font-bold text-app-text">
      <span>{t('total')}</span>
      <span className="tabular-nums font-mono">{money(finalTotal)}</span>
    </div>
  );

  // With a tip, the "Total" (order only) and the "Amount to pay" headline
  // (order + tip) differ: spell the gap out under the Total row so the two
  // figures never look contradictory (live test 2026-11-15).
  const tipRows =
    tipAmount > 0 ? (
      <>
        <div className="flex justify-between text-app-text-secondary text-xs pt-1.5">
          <span>{t('tip')}</span>
          <span className="tabular-nums font-mono">+{money(tipAmount)}</span>
        </div>
        <div className="flex justify-between font-bold text-app-text text-sm">
          <span>{t('totalWithTip')}</span>
          <span className="tabular-nums font-mono">{money(totalWithTip)}</span>
        </div>
      </>
    ) : null;

  return (
    <>
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-widest text-app-text-muted mb-1">
          {t('amountToPay')}
        </p>
        <p className="text-2xl sm:text-3xl lg:text-5xl font-bold text-app-text tabular-nums tracking-tight">
          {money(totalWithTip)}
        </p>
        {tipAmount > 0 && (
          <p className="mt-1 text-xs text-app-text-muted">
            {t('tipAmount', { amount: money(tipAmount) })}
          </p>
        )}
      </div>

      {showItemsReceipt && (
        <div className="border-t border-app-border py-3 space-y-2 mb-3">
          {cartItems.map((item, idx) => (
            <div key={idx} className="flex justify-between items-start gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-app-text text-xs">{item.name}</span>
                  {item.quantity > 1 && (
                    <span className="text-app-text-muted font-mono text-[10px]">
                      &times;{item.quantity}
                    </span>
                  )}
                </div>
                {item.modifiers && item.modifiers.length > 0 && (
                  <p className="text-[10px] text-app-text-muted mt-0.5">
                    {item.modifiers.join(', ')}
                  </p>
                )}
              </div>
              <span className="text-app-text-secondary tabular-nums font-mono text-xs shrink-0">
                {money(item.price * item.quantity)}
              </span>
            </div>
          ))}
          {!hasBreakdown && totalRow}
          {!hasBreakdown && tipRows}
        </div>
      )}

      {hasBreakdown && (
        <div className="space-y-1.5 border-t border-app-border py-3 text-sm mb-3">
          {subtotal !== undefined && (
            <div className="flex justify-between text-app-text-secondary text-xs">
              <span>{t('subtotal')}</span>
              <span className="tabular-nums font-mono">{money(subtotal)}</span>
            </div>
          )}
          {extraRow(t('taxes'), taxAmount)}
          {extraRow(t('service'), serviceChargeAmount)}
          {discountAmount !== undefined && discountAmount > 0 && (
            <div className="flex justify-between text-[var(--success)] text-xs">
              <span>{t('discount')}</span>
              <span className="tabular-nums font-mono">-{money(discountAmount)}</span>
            </div>
          )}
          {totalRow}
          {tipRows}
        </div>
      )}
    </>
  );
}
