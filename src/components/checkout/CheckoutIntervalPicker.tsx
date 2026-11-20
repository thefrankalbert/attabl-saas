'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BillingInterval } from '@/types/billing';
import {
  BILLING_INTERVALS,
  intervalSavingsPct,
  planMonthlyPrice,
  type SelfServicePlan,
} from '@/components/tenant/subscription/pricing-format';

interface CheckoutIntervalPickerProps {
  plan: SelfServicePlan;
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
}

/** Choix mensuel ou annuel, en deux cartes cote a cote, prix au mois. */
export function CheckoutIntervalPicker({ plan, value, onChange }: CheckoutIntervalPickerProps) {
  const tc = useTranslations('checkout');
  const locale = useLocale();

  return (
    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={tc('page.interval')}>
      {BILLING_INTERVALS.map((interval) => {
        const selected = interval === value;
        const savings = intervalSavingsPct(interval);
        return (
          <Button
            key={interval}
            type="button"
            variant="outline"
            role="radio"
            aria-checked={selected}
            onClick={() => !selected && onChange(interval)}
            className={cn(
              'h-auto min-h-[76px] flex-col items-start justify-center gap-1 whitespace-normal rounded-xl bg-white px-4 py-3 text-left hover:bg-white',
              selected
                ? 'border-zinc-900 ring-1 ring-zinc-900'
                : 'border-zinc-200 hover:border-zinc-400',
            )}
          >
            <span className="flex w-full items-center justify-between gap-2 text-sm font-medium text-zinc-900">
              {interval === 'yearly' ? tc('page.yearlyOption') : tc('page.monthlyOption')}
              {savings > 0 && (
                <span className="text-xs font-normal text-zinc-500">
                  {tc('page.savings', { pct: savings })}
                </span>
              )}
            </span>
            <span className="text-sm font-normal text-zinc-600 tabular-nums">
              {tc('page.perMonthAmount', {
                amount: planMonthlyPrice(plan, interval).toLocaleString(locale),
              })}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
