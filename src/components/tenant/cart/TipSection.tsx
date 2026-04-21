'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, HandCoins, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { CurrencyCode } from '@/types/admin.types';

export type TipPreset = 0 | 500 | 1000 | 1500 | 2000 | 'custom';

interface TipSectionProps {
  tipOpen: boolean;
  setTipOpen: (v: boolean) => void;
  tipPreset: TipPreset;
  setTipPreset: (v: TipPreset) => void;
  customTipInput: string;
  setCustomTipInput: (v: string) => void;
  tipAmount: number;
  currencyCode: CurrencyCode;
  formatDisplayPrice: (amount: number, currency: CurrencyCode) => string;
  labels: {
    tip: string;
    tipNone: string;
    tipCustom: string;
    tipCustomPlaceholder: string;
    close: string;
  };
}

export function TipSection({
  tipOpen,
  setTipOpen,
  tipPreset,
  setTipPreset,
  customTipInput,
  setCustomTipInput,
  tipAmount,
  currencyCode,
  formatDisplayPrice,
  labels,
}: TipSectionProps) {
  if (!tipOpen && tipAmount === 0) {
    return (
      <section>
        <Button
          variant="ghost"
          onClick={() => setTipOpen(true)}
          className="w-full justify-start gap-2 text-[14px] font-semibold text-[#1A1A1A] py-3 hover:text-black"
        >
          <HandCoins className="w-4 h-4" />
          <span>{labels.tip}</span>
          <ChevronRight className="w-4 h-4 ml-auto text-[#B0B0B0]" />
        </Button>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-xl border border-[#EEEEEE] p-4">
      <div className="flex items-center justify-between mb-3">
        <Label className="text-[13px] font-semibold text-[#1A1A1A]">{labels.tip}</Label>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setTipOpen(false);
            setTipPreset(0);
            setCustomTipInput('');
          }}
          className="text-[#737373] hover:text-[#1A1A1A] h-8 w-8"
          aria-label={labels.close}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            { key: 0, label: labels.tipNone },
            { key: 500, label: formatDisplayPrice(500, currencyCode) },
            { key: 1000, label: formatDisplayPrice(1000, currencyCode) },
            { key: 1500, label: formatDisplayPrice(1500, currencyCode) },
            { key: 2000, label: formatDisplayPrice(2000, currencyCode) },
            { key: 'custom', label: labels.tipCustom },
          ] as const
        ).map((opt) => {
          const active = tipPreset === opt.key;
          return (
            <Button
              key={String(opt.key)}
              variant={active ? 'default' : 'outline'}
              onClick={() => {
                setTipPreset(opt.key);
                if (opt.key !== 'custom') setCustomTipInput('');
              }}
              className={cn(
                'min-h-[44px] rounded-xl text-[13px] font-semibold px-1',
                active
                  ? 'bg-[#1A1A1A] text-white border border-[#1A1A1A] hover:bg-black'
                  : 'bg-white text-[#737373] border-[#EEEEEE] hover:border-[#B0B0B0]',
              )}
            >
              {opt.label}
            </Button>
          );
        })}
      </div>
      <AnimatePresence>
        {tipPreset === 'custom' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={500}
                value={customTipInput}
                onChange={(e) => setCustomTipInput(e.target.value)}
                placeholder={labels.tipCustomPlaceholder}
                className="w-full h-[44px] bg-[#F6F6F6] border border-[#EEEEEE] rounded-xl px-3 text-[14px] font-semibold text-[#1A1A1A] placeholder:text-[#B0B0B0] focus:outline-none focus:border-[#1A1A1A] transition-colors"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
