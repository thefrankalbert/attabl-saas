'use client';

import type { CurrencyCode } from '@/types/admin.types';

interface OrderSummaryProps {
  subtotal: number;
  taxAmount: number;
  serviceChargeAmount: number;
  discountAmount: number;
  tipAmount: number;
  finalTotal: number;
  enableTax: boolean;
  enableServiceCharge: boolean;
  taxRate: number;
  serviceChargeRate: number;
  currencyCode: CurrencyCode;
  formatDisplayPrice: (amount: number, currency: CurrencyCode) => string;
  labels: {
    subtotal: string;
    tax: string;
    serviceCharge: string;
    discount: string;
    tip: string;
    total: string;
    totalHint: string;
  };
}

export function OrderSummary({
  subtotal,
  taxAmount,
  serviceChargeAmount,
  discountAmount,
  tipAmount,
  finalTotal,
  enableTax,
  enableServiceCharge,
  taxRate,
  serviceChargeRate,
  currencyCode,
  formatDisplayPrice,
  labels,
}: OrderSummaryProps) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-white px-4 py-3.5">
      <div className="space-y-2.5">
        {/* Subtotal */}
        <div className="flex justify-between items-center">
          <span className="text-[13px] font-normal text-[#737373]">{labels.subtotal}</span>
          <span className="text-[13px] font-medium tabular-nums text-[var(--color-ink-2)]">
            {formatDisplayPrice(subtotal, currencyCode)}
          </span>
        </div>

        {/* Tax */}
        {enableTax && taxAmount > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-[13px] font-normal text-[#737373]">
              {labels.tax} ({taxRate}%)
            </span>
            <span className="text-[13px] font-medium tabular-nums text-[var(--color-ink-2)]">
              {formatDisplayPrice(taxAmount, currencyCode)}
            </span>
          </div>
        )}

        {/* Service charge */}
        {enableServiceCharge && serviceChargeAmount > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-[13px] font-normal text-[#737373]">
              {labels.serviceCharge} ({serviceChargeRate}%)
            </span>
            <span className="text-[13px] font-medium tabular-nums text-[var(--color-ink-2)]">
              {formatDisplayPrice(serviceChargeAmount, currencyCode)}
            </span>
          </div>
        )}

        {/* Discount */}
        {discountAmount > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-[13px] font-normal text-[#737373]">{labels.discount}</span>
            <span className="text-[13px] font-medium tabular-nums text-[var(--color-brand-dark)]">
              -{formatDisplayPrice(discountAmount, currencyCode)}
            </span>
          </div>
        )}

        {/* Tip */}
        {tipAmount > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-[13px] font-normal text-[#737373]">{labels.tip}</span>
            <span className="text-[13px] font-medium tabular-nums text-[var(--color-ink-2)]">
              {formatDisplayPrice(tipAmount, currencyCode)}
            </span>
          </div>
        )}

        {/* Divider */}
        <div className="mt-1 border-t border-[var(--color-divider)] pt-3">
          <div className="flex justify-between items-center">
            <span className="text-[14px] font-semibold tracking-[-0.2px] text-[var(--color-ink)]">
              {labels.total}
            </span>
            <span className="text-[18px] font-bold tabular-nums text-[var(--color-ink)]">
              {formatDisplayPrice(finalTotal, currencyCode)}
            </span>
          </div>
          {((enableTax && taxAmount > 0) || (enableServiceCharge && serviceChargeAmount > 0)) && (
            <div className="text-[11px] text-right" style={{ color: '#B0B0B0' }}>
              {labels.totalHint}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
