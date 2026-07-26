'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BillingPeriod } from '../pricing-data';

const PILL =
  'h-auto rounded-full px-[18px] py-2 text-[13px] font-medium shadow-none transition-colors hover:bg-transparent';
const PILL_ON =
  'bg-white text-zinc-950 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-zinc-950 dark:text-zinc-50';
const PILL_OFF = 'bg-transparent text-zinc-500 dark:text-zinc-400';

export function PricingHero({
  effectivePeriod,
  showSemiannual,
  setPeriod,
}: {
  effectivePeriod: BillingPeriod;
  showSemiannual: boolean;
  setPeriod: (period: BillingPeriod) => void;
}) {
  const t = useTranslations('marketing.pricing');

  return (
    <section className="bg-white pt-20 sm:pt-[88px] dark:bg-zinc-950">
      <div className="mx-auto max-w-[1160px] px-5 text-center sm:px-7">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
          {t('hero.eyebrow')}
        </p>
        <h1 className="mx-auto mt-3.5 max-w-[640px] text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] text-zinc-950 lg:text-[52px] dark:text-zinc-50">
          {t('hero.title')}
        </h1>
        <p className="mx-auto mt-4 max-w-[540px] text-[19px] leading-[1.5] text-zinc-600 dark:text-zinc-400">
          {t('hero.subtitle')}
        </p>

        {/* Billing toggle - preserves the 3 real Stripe periods + AB (semiannual) */}
        <div className="mt-8 inline-flex gap-[3px] rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-900">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setPeriod('monthly')}
            className={cn(PILL, effectivePeriod === 'monthly' ? PILL_ON : PILL_OFF)}
          >
            {t('billing.monthly')}
          </Button>
          {showSemiannual && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPeriod('semiannual')}
              className={cn(PILL, effectivePeriod === 'semiannual' ? PILL_ON : PILL_OFF)}
            >
              {t('billing.semiannual')}
              <span className="ml-1.5 text-xs font-semibold text-green-600 dark:text-green-500">
                {t('billing.semiannualDiscount')}
              </span>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setPeriod('yearly')}
            className={cn(PILL, effectivePeriod === 'yearly' ? PILL_ON : PILL_OFF)}
          >
            {t('billing.yearly')}
            <span className="ml-1.5 text-xs font-semibold text-green-600 dark:text-green-500">
              {t('billing.yearlyDiscount')}
            </span>
          </Button>
        </div>
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">{t('billing.noCommitment')}</p>
      </div>
    </section>
  );
}
