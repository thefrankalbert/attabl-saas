'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BillingPeriod } from '../pricing-data';

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
    <section className="bg-white dark:bg-neutral-950 pt-20 lg:pt-28 pb-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="font-[family-name:var(--font-sora)] text-4xl sm:text-5xl font-bold text-neutral-900 dark:text-white">
            {t('hero.title')}
          </h1>
          <p className="text-lg text-neutral-500 dark:text-neutral-400 mt-4">
            {t('hero.subtitle')}
          </p>

          {/* Billing toggle */}
          <div className="inline-flex bg-neutral-100 dark:bg-neutral-800 rounded-full p-1 mt-8">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPeriod('monthly')}
              className={cn(
                'px-5 py-2 text-sm font-medium transition-all rounded-full h-auto',
                effectivePeriod === 'monthly'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:bg-transparent',
              )}
            >
              {t('billing.monthly')}
            </Button>
            {showSemiannual && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPeriod('semiannual')}
                className={cn(
                  'px-5 py-2 text-sm font-medium transition-all rounded-full h-auto',
                  effectivePeriod === 'semiannual'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500 dark:text-neutral-400 hover:bg-transparent',
                )}
              >
                {t('billing.semiannual')}
                <span className="ml-1.5 text-xs text-green-600 font-semibold">
                  {t('billing.semiannualDiscount')}
                </span>
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPeriod('yearly')}
              className={cn(
                'px-5 py-2 text-sm font-medium transition-all rounded-full h-auto',
                effectivePeriod === 'yearly'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:bg-transparent',
              )}
            >
              {t('billing.yearly')}
              <span className="ml-1.5 text-xs text-green-600 font-semibold">
                {t('billing.yearlyDiscount')}
              </span>
            </Button>
          </div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-3">
            {t('billing.noCommitment')}
          </p>
        </div>
      </div>
    </section>
  );
}
