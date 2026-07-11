'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, HandCoins, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getCurrencySymbol } from '@/lib/utils/currency';
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
  // Collapsed trigger (matches the promo / notes rows)
  if (!tipOpen && tipAmount === 0) {
    return (
      <section>
        <Button
          variant="ghost"
          onClick={() => setTipOpen(true)}
          aria-expanded={false}
          className="w-full justify-start gap-2 py-3 text-[14px] font-semibold text-[#1A1A1A] hover:text-black"
        >
          <HandCoins className="h-4 w-4" />
          <span>{labels.tip}</span>
          <ChevronRight className="ml-auto h-4 w-4 text-[#B0B0B0]" />
        </Button>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-ink-muted)]">
          {labels.tip}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setTipOpen(false);
            setTipPreset(0);
            setCustomTipInput('');
          }}
          className="h-8 w-8 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          aria-label={labels.close}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
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
              variant="ghost"
              onClick={() => {
                setTipPreset(opt.key);
                if (opt.key !== 'custom') setCustomTipInput('');
              }}
              className={cn(
                'h-auto flex-[1_0_28%] rounded-[var(--radius-search)] border py-[11px] text-[12.5px] font-semibold tabular-nums',
                active
                  ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-white hover:bg-[var(--color-ink)]'
                  : 'border-[var(--color-divider)] bg-white text-[var(--color-ink-2)] hover:bg-white',
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
            <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-search)] border border-[var(--color-divider)] bg-white px-3.5 py-2.5">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={500}
                value={customTipInput}
                onChange={(e) => setCustomTipInput(e.target.value)}
                placeholder={labels.tipCustomPlaceholder}
                className="h-auto flex-1 border-0 bg-transparent p-0 text-[16px] md:text-[14px] font-semibold text-[var(--color-ink)] shadow-none focus-visible:ring-0"
              />
              <span className="font-mono text-[12px] text-[var(--color-ink-muted)]">
                {getCurrencySymbol(currencyCode)}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
