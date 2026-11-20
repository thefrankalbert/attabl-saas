'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PLAN_NAMES } from '@/lib/plans/features';
import type { BillingInterval } from '@/types/billing';
import { planMonthlyPrice, planBilledTotal, type SelfServicePlan } from './pricing-format';

interface PlanCardProps {
  plan: SelfServicePlan;
  /** Fonctionnalites propres a ce plan (cumulatives: "Tout Starter, plus"). */
  features: string[];
  /** Plan dont celui-ci reprend tout (null pour le premier plan). */
  includesPlan: SelfServicePlan | null;
  billingInterval: BillingInterval;
  isCurrent: boolean;
  isRecommended: boolean;
  isLoading: boolean;
  disabled: boolean;
  onChoose: () => void;
  /** Libelle du bouton a la place de "Passer a ..." (ex: paiement mobile money). */
  ctaLabel?: string;
  /** Le plan actuel reste payable (renouvellement par lien de paiement). */
  repayable?: boolean;
}

/**
 * Carte de formule, texte seul: nom, a qui elle s'adresse, prix, bouton,
 * puis ce qu'elle apporte de plus que la formule precedente.
 */
export function PlanCard({
  plan,
  features,
  includesPlan,
  billingInterval,
  isCurrent,
  isRecommended,
  isLoading,
  disabled,
  onChoose,
  ctaLabel,
  repayable = false,
}: PlanCardProps) {
  const t = useTranslations('admin');
  const locale = useLocale();

  const locked = isCurrent && !repayable;
  const price = planMonthlyPrice(plan, billingInterval).toLocaleString(locale);
  const yearlyTotal =
    billingInterval === 'yearly'
      ? t('subscription.billedYearly', {
          total: planBilledTotal(plan, billingInterval).toLocaleString(locale),
        })
      : null;

  return (
    <article
      className={cn(
        'flex flex-col rounded-2xl border bg-app-card p-6',
        isRecommended ? 'border-app-text' : 'border-app-border',
      )}
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-app-text">{PLAN_NAMES[plan]}</h3>
        {isCurrent ? (
          <span className="rounded-full bg-app-elevated px-2.5 py-0.5 text-xs font-medium text-app-text-secondary">
            {t('subscription.yourCurrentPlan')}
          </span>
        ) : isRecommended ? (
          <span className="rounded-full bg-app-text px-2.5 py-0.5 text-xs font-medium text-app-bg">
            {t('subscription.popularPlan')}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 min-h-10 text-sm text-app-text-secondary">
        {t(`subscription.${plan}Tagline` as Parameters<typeof t>[0])}
      </p>

      <div className="mt-6 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tracking-tight tabular-nums text-app-text">
          {price}
        </span>
        <span className="text-sm text-app-text-muted">{t('subscription.perMonth')}</span>
      </div>
      <p className="mt-1 min-h-5 text-xs text-app-text-muted">{yearlyTotal}</p>

      <Button
        onClick={() => !locked && onChoose()}
        disabled={disabled || locked}
        variant={isRecommended && !locked ? 'default' : 'outline'}
        className="mt-6 h-11 w-full rounded-xl text-sm font-semibold"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : locked ? (
          t('subscription.yourCurrentPlan')
        ) : (
          (ctaLabel ?? t('subscription.switchTo', { plan: PLAN_NAMES[plan] }))
        )}
      </Button>

      <div className="mt-6 border-t border-app-border pt-5">
        <p className="text-xs font-medium text-app-text-muted">
          {includesPlan
            ? t('subscription.everythingIn', { plan: PLAN_NAMES[includesPlan] })
            : t('subscription.includes')}
        </p>
        <ul className="mt-3 space-y-2.5">
          {features.map((key) => (
            <li key={key} className="flex items-start gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-app-text-muted" />
              <span className="text-sm text-app-text-secondary">
                {t(`subscription.${key}` as Parameters<typeof t>[0])}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
