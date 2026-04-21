'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Check, ChevronRight, Loader2, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CurrencyCode } from '@/types/admin.types';

interface AppliedCoupon {
  code: string;
  discountAmount: number;
}

interface PromoSectionProps {
  appliedCoupon: AppliedCoupon | null;
  promoOpen: boolean;
  setPromoOpen: (v: boolean) => void;
  promoInput: string;
  setPromoInput: (v: string) => void;
  promoError: string | null;
  setPromoError: (v: string | null) => void;
  promoApplying: boolean;
  promoJustApplied: boolean;
  onApply: () => void;
  onRemove: () => void;
  currencyCode: CurrencyCode;
  formatDisplayPrice: (amount: number, currency: CurrencyCode) => string;
  labels: {
    promoCode: string;
    promoCodePlaceholder: string;
    apply: string;
    promoApplied: string;
    ariaRemovePromo: string;
  };
}

export function PromoSection({
  appliedCoupon,
  promoOpen,
  setPromoOpen,
  promoInput,
  setPromoInput,
  promoError,
  setPromoError,
  promoApplying,
  promoJustApplied,
  onApply,
  onRemove,
  currencyCode,
  formatDisplayPrice,
  labels,
}: PromoSectionProps) {
  if (appliedCoupon) {
    return (
      <section>
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-3 bg-[#F6F6F6] border border-[#EEEEEE] rounded-xl px-3 py-2.5"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full bg-[#1A1A1A] flex items-center justify-center flex-shrink-0">
              <Check className="w-4 h-4 text-white" strokeWidth={3} />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#1A1A1A] truncate">
                {appliedCoupon.code}
              </p>
              <p className="text-[11px] text-[#737373]">
                -{formatDisplayPrice(appliedCoupon.discountAmount, currencyCode)}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={labels.ariaRemovePromo}
            className="p-2 min-h-[36px] min-w-[36px] text-[#737373] hover:text-[#FF3008]"
          >
            <X className="w-4 h-4" />
          </Button>
        </motion.div>
      </section>
    );
  }

  if (!promoOpen) {
    return (
      <section>
        <Button
          variant="ghost"
          onClick={() => setPromoOpen(true)}
          className="w-full justify-start gap-2 text-[14px] font-semibold text-[#1A1A1A] py-3 hover:text-black"
        >
          <Tag className="w-4 h-4" />
          <span>{labels.promoCode}</span>
          <ChevronRight className="w-4 h-4 ml-auto text-[#B0B0B0]" />
        </Button>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <Label htmlFor="promo-input" className="text-[13px] font-semibold text-[#1A1A1A]">
          {labels.promoCode}
        </Label>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setPromoOpen(false);
            setPromoInput('');
            setPromoError(null);
          }}
          className="text-[#737373] hover:text-[#1A1A1A] h-8 w-8"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex items-stretch gap-2">
        <div className="flex-1 relative">
          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0B0B0]" />
          <Input
            id="promo-input"
            type="text"
            value={promoInput}
            onChange={(e) => {
              setPromoInput(e.target.value.toUpperCase());
              if (promoError) setPromoError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onApply();
              }
            }}
            placeholder={labels.promoCodePlaceholder}
            autoFocus
            className="w-full h-[44px] bg-[#F6F6F6] border border-[#EEEEEE] rounded-xl pl-9 pr-3 text-[14px] font-medium text-[#1A1A1A] placeholder:text-[#B0B0B0] focus:outline-none focus:border-[#1A1A1A] transition-colors"
          />
        </div>
        <Button
          onClick={onApply}
          disabled={!promoInput.trim() || promoApplying}
          className="h-[44px] px-4 rounded-xl bg-[#1A1A1A] text-white text-[14px] font-semibold hover:bg-black min-w-[90px]"
        >
          {promoApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : labels.apply}
        </Button>
      </div>
      <AnimatePresence>
        {promoError && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-2 text-[12px] text-[#FF3008] flex items-center gap-1"
          >
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {promoError}
          </motion.p>
        )}
        {promoJustApplied && !promoError && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-2 text-[12px] text-[#1A1A1A] flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5 flex-shrink-0" />
            {labels.promoApplied}
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}
