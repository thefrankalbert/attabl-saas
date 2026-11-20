'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PLAN_NAMES } from '@/lib/plans/features';
import type { SubscriptionPlan, BillingInterval } from '@/types/billing';
import { planBilledTotal, SELF_SERVICE_PLANS, type SelfServicePlan } from './pricing-format';

function statusBadgeClasses(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-status-success-bg text-status-success';
    case 'trial':
    case 'past_due':
      return 'bg-status-warning-bg text-status-warning';
    case 'cancelled':
    case 'frozen':
      return 'bg-status-error-bg text-status-error';
    default:
      return 'bg-app-elevated text-app-text-muted';
  }
}

interface CurrentPlanPanelProps {
  plan: SubscriptionPlan;
  status: string;
  periodEnd: string | null;
  /** Jours d'essai restants (null hors essai). */
  trialDaysLeft?: number | null;
  billingInterval: BillingInterval;
  hasSubscription: boolean;
  /**
   * Le prestataire d'encaissement actif heberge-t-il une page de gestion ?
   * Stripe oui, un agregateur mobile money non (voir `lib/billing/provider`).
   * Sans cette garde, le bouton menerait a une route qui ne peut rien rendre.
   */
  canOpenPortal: boolean;
  isBillingLoading: boolean;
  onManageBilling: () => void;
}

/**
 * Resume de la formule, en texte seul: nom, statut, et une ligne qui dit ce
 * qui va se passer (fin d'essai, prochain paiement). Le prorata est explique
 * ici, une fois, plutot que dans un message apres coup.
 */
export function CurrentPlanPanel({
  plan,
  status,
  periodEnd,
  trialDaysLeft = null,
  billingInterval,
  hasSubscription,
  canOpenPortal,
  isBillingLoading,
  onManageBilling,
}: CurrentPlanPanelProps) {
  const t = useTranslations('admin');
  const locale = useLocale();

  const statusLabel = (() => {
    switch (status) {
      case 'active':
        return t('subscription.statusActive');
      case 'trial':
        return t('subscription.statusTrial');
      case 'past_due':
        return t('subscription.statusPastDue');
      case 'cancelled':
        return t('subscription.statusCancelled');
      case 'frozen':
        return t('subscription.statusFrozen');
      default:
        return status;
    }
  })();

  const date = periodEnd
    ? new Date(periodEnd).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const isSelfService = (SELF_SERVICE_PLANS as string[]).includes(plan);
  const amount =
    hasSubscription && isSelfService
      ? `${planBilledTotal(plan as SelfServicePlan, billingInterval).toLocaleString(locale)} ${
          billingInterval === 'yearly' ? t('subscription.perYear') : t('subscription.perMonth')
        }`
      : null;

  const line = (() => {
    if (!date) return null;
    if (status === 'trial') return t('subscription.trialLine', { date });
    if (amount) return t('subscription.nextPaymentLine', { amount, date });
    return t('subscription.renewalLine', { date });
  })();

  return (
    <section className="rounded-2xl border border-app-border bg-app-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-app-text-muted">{t('subscription.yourPlan')}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h2 className="text-2xl font-semibold tracking-tight text-app-text">
              {PLAN_NAMES[plan] || plan}
            </h2>
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                statusBadgeClasses(status),
              )}
            >
              {statusLabel}
            </span>
          </div>
          {line && <p className="mt-2 text-sm text-app-text-secondary">{line}</p>}
          {trialDaysLeft !== null && (
            <p className="mt-1 text-sm font-medium text-status-warning">
              {t('subscription.trialDaysLeft', { count: trialDaysLeft })}
            </p>
          )}
        </div>

        {hasSubscription && canOpenPortal && (
          <Button
            variant="outline"
            onClick={onManageBilling}
            disabled={isBillingLoading}
            className="h-10 shrink-0 rounded-lg px-4 text-sm font-semibold"
          >
            {isBillingLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('subscription.manageBilling')}
          </Button>
        )}
      </div>

      {hasSubscription && (
        <p className="mt-5 border-t border-app-border pt-4 text-xs leading-relaxed text-app-text-muted">
          {t('subscription.prorataNote')}
        </p>
      )}
    </section>
  );
}
