'use client';

import { Check } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { useCheckout } from '@stripe/react-stripe-js/checkout';
import { PLAN_NAMES } from '@/lib/plans/features';
import type { BillingInterval } from '@/types/billing';
import {
  planBilledTotal,
  type SelfServicePlan,
} from '@/components/tenant/subscription/pricing-format';
import { PLAN_FEATURES, INCLUDES_PLAN } from '@/components/tenant/subscription/plan-features';

interface CheckoutSummaryProps {
  plan: SelfServicePlan;
  interval: BillingInterval;
}

/**
 * Recapitulatif de commande. Le prix de la formule vient de notre grille; le
 * montant du jour et la fin d'essai viennent de la session Stripe, qui fait foi
 * (un essai en cours ramene le montant du jour a 0).
 */
export function CheckoutSummary({ plan, interval }: CheckoutSummaryProps) {
  const t = useTranslations('admin');
  const tc = useTranslations('checkout');
  const locale = useLocale();
  const result = useCheckout();
  const session = result.type === 'success' ? result.checkout : null;

  const money = (amount: number) => tc('page.amount', { amount: amount.toLocaleString(locale) });
  const billed = money(planBilledTotal(plan, interval));
  const period = interval === 'yearly' ? tc('page.perYear') : tc('page.perMonth');
  const dueToday = session
    ? money(session.total.total.minorUnitsAmount / session.minorUnitsAmountDivisor)
    : null;
  const trialEnd = session?.recurring?.trial?.trialEnd ?? null;
  const trialDate = trialEnd
    ? new Date(trialEnd * 1000).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;
  const includesPlan = INCLUDES_PLAN[plan];

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
      <h2 className="text-sm font-medium text-zinc-500">{tc('page.summary')}</h2>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">
            {tc('page.lineItem', { plan: PLAN_NAMES[plan] })}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {interval === 'yearly' ? tc('page.billedYearly') : tc('page.billedMonthly')}
          </p>
        </div>
        <p className="shrink-0 text-sm text-zinc-900 tabular-nums">{billed}</p>
      </div>

      {trialDate && (
        <p className="mt-3 text-sm text-zinc-600">{tc('page.trialUntil', { date: trialDate })}</p>
      )}

      <div className="mt-5 flex items-center justify-between gap-4 border-t border-zinc-200 pt-4">
        <p className="text-sm font-semibold text-zinc-900">{tc('page.dueToday')}</p>
        {dueToday ? (
          <p className="text-base font-semibold text-zinc-900 tabular-nums">{dueToday}</p>
        ) : (
          <span className="h-5 w-20 animate-pulse rounded bg-zinc-100" />
        )}
      </div>
      {trialDate && (
        <p className="mt-2 text-xs text-zinc-500">
          {tc('page.thenCharged', { amount: billed, period, date: trialDate })}
        </p>
      )}

      <div className="mt-6 hidden border-t border-zinc-200 pt-5 lg:block">
        <p className="text-xs font-medium text-zinc-500">
          {includesPlan
            ? t('subscription.everythingIn', { plan: PLAN_NAMES[includesPlan] })
            : t('subscription.includes')}
        </p>
        <ul className="mt-3 space-y-2">
          {PLAN_FEATURES[plan].map((key) => (
            <li key={key} className="flex items-start gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
              <span className="text-sm text-zinc-700">
                {t(`subscription.${key}` as Parameters<typeof t>[0])}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
