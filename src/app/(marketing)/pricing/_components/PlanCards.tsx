'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { PLAN_AMOUNTS, PLAN_TOTALS } from '@/lib/stripe/pricing';
import { cn } from '@/lib/utils';
import type { BillingPeriod } from '../pricing-data';

type PaidKey = 'starter' | 'pro' | 'business';

const PLANS: {
  key: PaidKey | 'enterprise';
  featCount: number;
  cta: string;
  href: string;
  dark: boolean;
}[] = [
  { key: 'starter', featCount: 5, cta: 'button', href: '/signup', dark: false },
  { key: 'pro', featCount: 10, cta: 'button', href: '/signup', dark: true },
  { key: 'business', featCount: 7, cta: 'primaryButton', href: '/signup', dark: false },
  { key: 'enterprise', featCount: 6, cta: 'button', href: '/contact', dark: false },
];

export function PlanCards({ effectivePeriod }: { effectivePeriod: BillingPeriod }) {
  const t = useTranslations('marketing.pricing');
  const locale = useLocale();
  const fmt = (n: number) => new Intl.NumberFormat(locale).format(n);
  const suffix = t('priceSuffix');

  return (
    <section className="bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-[1160px] px-5 pt-9 text-center sm:px-7">
        <div className="grid grid-cols-1 items-stretch gap-4 text-left sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => {
            const paid = plan.key !== 'enterprise';
            const perMonth = paid ? PLAN_AMOUNTS[plan.key as PaidKey][effectivePeriod] : null;
            const total = paid ? PLAN_TOTALS[plan.key as PaidKey][effectivePeriod] : null;
            const perDay = perMonth != null ? Math.round(perMonth / 30 / 50) * 50 : null;
            const feats = Array.from({ length: plan.featCount }, (_, i) => `f${i + 1}`);

            return (
              <div
                key={plan.key}
                className={cn(
                  'flex flex-col rounded-2xl border p-6',
                  plan.dark
                    ? 'border-zinc-900 bg-zinc-900 shadow-[0_20px_50px_-24px_rgba(9,9,11,0.5)] dark:border-zinc-100 dark:bg-zinc-100'
                    : 'border-zinc-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(9,9,11,0.04)] dark:border-zinc-800 dark:bg-zinc-950',
                )}
              >
                <span
                  className={cn(
                    'self-start rounded-full px-2.5 py-[5px] text-[10px] font-semibold uppercase tracking-[0.04em]',
                    plan.dark
                      ? 'bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50'
                      : 'border border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
                  )}
                >
                  {t(`plans.${plan.key}.badge`)}
                </span>
                <div
                  className={cn(
                    'mt-4 text-[19px] font-semibold tracking-[-0.015em]',
                    plan.dark ? 'text-white dark:text-zinc-900' : 'text-zinc-950 dark:text-zinc-50',
                  )}
                >
                  {t(`plans.${plan.key}.title`)}
                </div>
                <div
                  className={cn(
                    'mt-1.5 min-h-[38px] text-[13px] leading-[1.45]',
                    plan.dark
                      ? 'text-zinc-400 dark:text-zinc-500'
                      : 'text-zinc-500 dark:text-zinc-400',
                  )}
                >
                  {t(`plans.${plan.key}.subtitle`)}
                </div>

                {/* Price */}
                {perMonth != null ? (
                  <>
                    <div className="mt-5 flex items-baseline gap-1.5">
                      <span
                        className={cn(
                          'text-[32px] font-semibold tracking-[-0.025em]',
                          plan.dark
                            ? 'text-white dark:text-zinc-900'
                            : 'text-zinc-950 dark:text-zinc-50',
                        )}
                      >
                        {fmt(perMonth)}
                      </span>
                      <span
                        className={cn(
                          'text-sm font-medium',
                          plan.dark
                            ? 'text-zinc-400 dark:text-zinc-500'
                            : 'text-zinc-500 dark:text-zinc-400',
                        )}
                      >
                        {suffix}
                      </span>
                    </div>
                    <div
                      className={cn(
                        'mt-1 text-xs',
                        plan.dark
                          ? 'text-zinc-400 dark:text-zinc-500'
                          : 'text-zinc-500 dark:text-zinc-400',
                      )}
                    >
                      {effectivePeriod === 'monthly'
                        ? t('billedMonthly')
                        : t('billedTotal', { total: fmt(total as number) })}
                    </div>
                    <div
                      className={cn(
                        'mt-0.5 text-xs',
                        plan.dark
                          ? 'text-zinc-400 dark:text-zinc-500'
                          : 'text-zinc-500 dark:text-zinc-400',
                      )}
                    >
                      {t('perDay', { amount: fmt(perDay as number) })}
                    </div>
                  </>
                ) : (
                  <div className="mt-5">
                    <span
                      className={cn(
                        'text-[30px] font-semibold tracking-[-0.025em]',
                        plan.dark
                          ? 'text-white dark:text-zinc-900'
                          : 'text-zinc-950 dark:text-zinc-50',
                      )}
                    >
                      {t('customPrice')}
                    </span>
                  </div>
                )}

                {/* CTA */}
                <Link
                  href={plan.href}
                  className={cn(
                    'mt-[22px] rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors',
                    plan.dark
                      ? 'bg-white text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800'
                      : 'border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900',
                  )}
                >
                  {t(`plans.${plan.key}.${plan.cta}`)}
                </Link>

                {/* Features */}
                <div className="mt-[22px] flex flex-col gap-2.5">
                  {feats.map((f) => (
                    <div
                      key={f}
                      className={cn(
                        'flex gap-2 text-[13px] leading-[1.4]',
                        plan.dark
                          ? 'text-zinc-200 dark:text-zinc-700'
                          : 'text-zinc-700 dark:text-zinc-300',
                      )}
                    >
                      <Check
                        className={cn(
                          'mt-0.5 h-[15px] w-[15px] flex-none',
                          plan.dark
                            ? 'text-green-400 dark:text-green-600'
                            : 'text-green-600 dark:text-green-500',
                        )}
                        strokeWidth={2}
                      />
                      <span>{t(`plans.${plan.key}.features.${f}`)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-[22px] text-[13px] text-zinc-400 dark:text-zinc-500">{t('priceNote')}</p>
      </div>
    </section>
  );
}
