'use client';

import { ArrowRight, Check, Printer, StickyNote, Tag, X, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import { formatCurrency } from '@/lib/utils/currency';
import type { CurrencyCode, PricingBreakdown } from '@/types/admin.types';
import type { CartItem, AppliedCoupon } from '@/hooks/usePOSData';

interface POSCartFooterProps {
  cart: CartItem[];
  currency: CurrencyCode;
  pricing: PricingBreakdown;
  totalItems: number;

  // Order-level notes
  orderNotes: string;
  setOrderNotes: (notes: string) => void;
  showOrderNotes: boolean;
  setShowOrderNotes: React.Dispatch<React.SetStateAction<boolean>>;

  // Coupon
  enableCoupons: boolean;
  couponCode: string;
  setCouponCode: (code: string) => void;
  appliedCoupon: AppliedCoupon | null;
  couponLoading: boolean;
  couponError: string;
  onValidateCoupon: (code: string) => void;
  onRemoveCoupon: () => void;

  // Payment
  onPrintOrder: () => void;
  onCheckout: () => void;
}

export function POSCartFooter({
  cart,
  currency,
  pricing,
  totalItems,
  orderNotes,
  setOrderNotes,
  showOrderNotes,
  setShowOrderNotes,
  enableCoupons,
  couponCode,
  setCouponCode,
  appliedCoupon,
  couponLoading,
  couponError,
  onValidateCoupon,
  onRemoveCoupon,
  onPrintOrder,
  onCheckout,
}: POSCartFooterProps) {
  const t = useTranslations('pos');
  const tc = useTranslations('common');
  const seg = useSegmentTerms();

  return (
    <div className="border-t border-app-border px-4 py-3 space-y-2">
      {/* Order note + Coupon on same line */}
      <div className="flex items-center gap-2">
        {/* Order note toggle */}
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowOrderNotes((prev) => !prev)}
          className={cn(
            'flex items-center gap-1 text-[11px] font-medium shrink-0 h-auto px-1 py-0.5',
            orderNotes
              ? 'text-[var(--warning)]'
              : 'text-app-text-muted hover:text-app-text-secondary',
          )}
        >
          <StickyNote className="w-3 h-3" />
          <span>{t('orderNote')}</span>
          {orderNotes && <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] shrink-0" />}
        </Button>

        {/* Coupon inline (only if enabled in tenant settings) */}
        {enableCoupons && (
          <div className="flex-1 min-w-0">
            {appliedCoupon ? (
              <div className="flex items-center gap-1 animate-in fade-in">
                <div className="flex items-center gap-1 text-[var(--success)] border border-[var(--border)] rounded-md px-2 py-1 text-[10px] font-medium min-w-0">
                  <Tag className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{appliedCoupon.code}</span>
                  <span className="text-[var(--success)] shrink-0">
                    -
                    {appliedCoupon.discount_type === 'percentage'
                      ? `${appliedCoupon.discount_value}%`
                      : formatCurrency(appliedCoupon.discountAmount, currency)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('removeCoupon')}
                  onClick={onRemoveCoupon}
                  className="w-6 h-6 text-app-text-muted hover:text-status-error shrink-0"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-1">
                <Input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder={t('couponPlaceholder')}
                  className="h-7 text-xs flex-1 min-w-0"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && couponCode.trim()) onValidateCoupon(couponCode);
                  }}
                  disabled={couponLoading || cart.length === 0}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs shrink-0"
                  disabled={!couponCode.trim() || couponLoading || cart.length === 0}
                  onClick={() => onValidateCoupon(couponCode)}
                >
                  {couponLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Tag className="w-3 h-3" />
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expandable notes textarea */}
      {showOrderNotes && (
        <Textarea
          value={orderNotes}
          onChange={(e) => setOrderNotes(e.target.value)}
          maxLength={500}
          placeholder={t('orderNotePlaceholder')}
          rows={2}
          className="w-full p-2 text-xs border border-app-border rounded-lg bg-app-elevated text-app-text placeholder:text-app-text-muted outline-none focus:border-accent/40 resize-none animate-in fade-in slide-in-from-top-1"
        />
      )}

      {/* Coupon error */}
      {enableCoupons && couponError && (
        <p className="text-[10px] text-status-error font-medium animate-in fade-in">
          {couponError}
        </p>
      )}

      {/* Pricing breakdown */}
      {(pricing.taxAmount > 0 || pricing.serviceChargeAmount > 0 || pricing.discountAmount > 0) && (
        <div className="space-y-1">
          <div className="flex justify-between items-baseline">
            <span className="text-[11px] text-app-text-muted">
              {tc('subtotal')} ({t('itemsCount', { count: totalItems })})
            </span>
            <span className="text-xs font-medium text-app-text-secondary tabular-nums font-mono">
              {formatCurrency(pricing.subtotal, currency)}
            </span>
          </div>
          {pricing.discountAmount > 0 && (
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] text-[var(--success)]">
                {tc('discount') || 'Remise'}
              </span>
              <span className="text-xs font-medium text-[var(--success)] tabular-nums font-mono">
                -{formatCurrency(pricing.discountAmount, currency)}
              </span>
            </div>
          )}
          {pricing.taxAmount > 0 && (
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] text-app-text-muted">{tc('tax')}</span>
              <span className="text-xs font-medium text-app-text-secondary tabular-nums font-mono">
                {formatCurrency(pricing.taxAmount, currency)}
              </span>
            </div>
          )}
          {pricing.serviceChargeAmount > 0 && (
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] text-app-text-muted">{tc('service')}</span>
              <span className="text-xs font-medium text-app-text-secondary tabular-nums font-mono">
                {formatCurrency(pricing.serviceChargeAmount, currency)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Total */}
      <div className="flex justify-between items-baseline">
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-app-text-muted font-medium uppercase tracking-wide">
            {tc('total')}
          </span>
          {totalItems > 0 &&
            pricing.taxAmount <= 0 &&
            pricing.serviceChargeAmount <= 0 &&
            pricing.discountAmount <= 0 && (
              <span className="text-[10px] text-app-text-muted">
                ({t('itemsCount', { count: totalItems })})
              </span>
            )}
        </div>
        <span className="text-2xl font-bold text-app-text tabular-nums tracking-tight">
          {formatCurrency(pricing.total, currency)}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-7 gap-2">
        <Button
          variant="outline"
          className="col-span-2 min-h-[48px] rounded-xl gap-1.5 touch-manipulation"
          disabled={cart.length === 0}
          onClick={onPrintOrder}
          title={seg.sentToProduction}
        >
          <Printer className="w-4 h-4" />
          <span className="hidden @sm:inline text-xs">{t('printShort')}</span>
        </Button>
        <Button
          variant="default"
          className="col-span-5 min-h-[48px] rounded-xl px-2 @sm:px-4 text-xs @sm:text-sm font-bold touch-manipulation"
          disabled={cart.length === 0}
          onClick={onCheckout}
        >
          <Check className="w-4 h-4 shrink-0 hidden @sm:inline" />
          <span className="truncate">{t('validatePayment')}</span>
          <ArrowRight className="ml-1 w-4 h-4 shrink-0 opacity-80 hidden @sm:inline" />
        </Button>
      </div>
    </div>
  );
}
