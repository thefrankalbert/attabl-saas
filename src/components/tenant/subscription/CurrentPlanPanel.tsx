'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Crown, Zap, Building2, Loader2, CalendarDays, CreditCard, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PLAN_NAMES } from '@/lib/plans/features';
import type { SubscriptionPlan, BillingInterval } from '@/types/billing';
import { planBilledTotal, type SelfServicePlan } from './pricing-format';

const PLAN_ICON_MAP: Record<SelfServicePlan, typeof Zap> = {
  starter: Zap,
  pro: Crown,
  business: Building2,
};

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
  billingInterval: BillingInterval;
  hasSubscription: boolean;
  isBillingLoading: boolean;
  onManageBilling: () => void;
}

/**
 * Account / billing summary panel. Reads like Linear's billing pane: the plan,
 * its live status, the renewal (or trial end) date, and - for active
 * subscribers - the next amount charged, with one primary "manage billing"
 * action.
 */
export function CurrentPlanPanel({
  plan,
  status,
  periodEnd,
  billingInterval,
  hasSubscription,
  isBillingLoading,
  onManageBilling,
}: CurrentPlanPanelProps) {
  const t = useTranslations('admin');
  const locale = useLocale();

  const PlanIcon = PLAN_ICON_MAP[plan in PLAN_ICON_MAP ? (plan as SelfServicePlan) : 'starter'];

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

  const formattedDate = periodEnd
    ? new Date(periodEnd).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;
  const dateLabel = status === 'trial' ? t('subscription.trialEndsOn') : t('subscription.renewsOn');

  const nextCharge =
    hasSubscription && plan in PLAN_ICON_MAP
      ? planBilledTotal(plan as SelfServicePlan, billingInterval).toLocaleString(locale)
      : null;
  const chargeSuffix: Record<BillingInterval, string> = {
    monthly: t('subscription.perMonth'),
    yearly: t('subscription.perYear'),
    semiannual: t('subscription.perSemiannual'),
  };

  return (
    <div className="rounded-xl border border-app-border bg-app-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-elevated">
            <PlanIcon className="h-5 w-5 text-app-text" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-app-text-muted">
              {t('subscription.currentSubscription')}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-base font-semibold text-app-text">
                {PLAN_NAMES[plan] || plan}
              </span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  statusBadgeClasses(status),
                )}
              >
                {statusLabel}
              </span>
            </div>
          </div>
        </div>

        {hasSubscription && (
          <Button
            variant="outline"
            onClick={onManageBilling}
            disabled={isBillingLoading}
            className="h-9 gap-1.5 rounded-lg px-3 text-xs font-semibold"
          >
            {isBillingLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CreditCard className="h-3.5 w-3.5" />
            )}
            {t('subscription.manageBilling')}
          </Button>
        )}
      </div>

      {(formattedDate || nextCharge) && (
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-app-border pt-4 sm:grid-cols-2">
          {formattedDate && (
            <div className="flex items-center gap-2.5">
              <CalendarDays className="h-4 w-4 shrink-0 text-app-text-muted" />
              <div className="min-w-0">
                <p className="text-[11px] text-app-text-muted">{dateLabel}</p>
                <p className="text-sm font-medium text-app-text">{formattedDate}</p>
              </div>
            </div>
          )}
          {nextCharge && (
            <div className="flex items-center gap-2.5">
              <Receipt className="h-4 w-4 shrink-0 text-app-text-muted" />
              <div className="min-w-0">
                <p className="text-[11px] text-app-text-muted">{t('subscription.nextCharge')}</p>
                <p className="text-sm font-medium tabular-nums text-app-text">
                  {nextCharge} {chargeSuffix[billingInterval]}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
