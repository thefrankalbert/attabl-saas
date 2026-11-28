'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { logger } from '@/lib/logger';

export interface AppliedCoupon {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  discountAmount: number;
  /** Cart total the discount was computed on; a different cart re-checks it. */
  validatedTotal: number;
}

/** Coupon entry, validation and re-check of the till for a cart total (split out of usePOSData). */
export function usePosCoupon(total: number) {
  const t = useTranslations('pos');
  // --- Coupon state ---------------------------------------
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');
  // --- Coupon validation (client-side preview) ------------
  const validateCoupon = useCallback(
    async (code: string) => {
      if (!code.trim()) return;
      setCouponLoading(true);
      setCouponError('');
      // BUG-38: Abort coupon validation after 10s to prevent hanging requests
      try {
        const res = await fetch('/api/coupons/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, subtotal: total }),
          signal: AbortSignal.timeout(10000),
        });
        const data: {
          valid: boolean;
          coupon?: {
            id: string;
            code: string;
            discount_type: 'percentage' | 'fixed';
            discount_value: number;
          };
          discountAmount: number;
          error?: string;
        } = await res.json();
        if (data.valid && data.coupon) {
          setAppliedCoupon({
            id: data.coupon.id,
            code: data.coupon.code,
            discount_type: data.coupon.discount_type,
            discount_value: data.coupon.discount_value,
            discountAmount: data.discountAmount,
            validatedTotal: total,
          });
          setCouponCode('');
        } else {
          // Also drops a coupon that no longer applies to the changed cart.
          setAppliedCoupon(null);
          setCouponError(data.error || t('couponInvalid'));
        }
      } catch (err) {
        logger.error('Coupon validation failed', err);
        // Not checked = not applied: keeping a discount computed on another
        // cart would announce a wrong amount.
        setAppliedCoupon(null);
        setCouponError(t('couponValidationError'));
      } finally {
        setCouponLoading(false);
      }
    },
    [total, t],
  );

  const removeCoupon = useCallback(() => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError('');
  }, []);

  // The discount was computed on the cart as it was: a percentage, a minimum
  // order or a cap all depend on the total. Re-check it (server is the source of
  // truth) once the cart settles, instead of announcing a stale discount.
  const appliedCode = appliedCoupon?.code;
  const couponTotal = appliedCoupon?.validatedTotal;
  useEffect(() => {
    if (!appliedCode || couponTotal === total) return;
    const timer = setTimeout(() => {
      void validateCoupon(appliedCode);
    }, 400);
    return () => clearTimeout(timer);
  }, [appliedCode, couponTotal, total, validateCoupon]);

  return {
    couponCode,
    setCouponCode,
    appliedCoupon,
    setAppliedCoupon,
    couponLoading,
    couponError,
    setCouponError,
    validateCoupon,
    removeCoupon,
  };
}
