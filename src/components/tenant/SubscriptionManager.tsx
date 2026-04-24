'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Crown, Zap, Building2, Check, Loader2, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { PLAN_NAMES } from '@/lib/plans/features';
import { PLAN_AMOUNTS, PLAN_TOTALS } from '@/lib/stripe/pricing';
import { logger } from '@/lib/logger';
import type { SubscriptionPlan, BillingInterval } from '@/types/billing';

interface Tenant {
  id: string;
  subscription_plan?: string;
  subscription_status?: string;
  subscription_current_period_end: string | null;
  billing_interval: string | null;
  email?: string;
}

type SelfServicePlan = Exclude<SubscriptionPlan, 'enterprise'>;

const SELF_SERVICE_PLANS: SelfServicePlan[] = ['starter', 'pro', 'business'];

const PLAN_FEATURES: Record<SelfServicePlan, string[]> = {
  starter: [
    'feature1Space',
    'featureUnlimitedMenu',
    'featureBasicPOS',
    'featureHdPhotos',
    'featureEmailSupport',
  ],
  pro: [
    'feature1Space',
    'featureFullPOS',
    'featureKDS',
    'featureInventory',
    'featureTableOrder',
    'featureAdvancedStats',
  ],
  business: [
    'feature10Spaces',
    'featureAllProFeatures',
    'featureRoomService',
    'featureDelivery',
    'featureAIAnalytics',
    'featureUnlimitedStaff',
  ],
};

const PLAN_ICON_MAP: Record<SelfServicePlan, typeof Zap> = {
  starter: Zap,
  pro: Crown,
  business: Building2,
};

const BILLING_INTERVALS: BillingInterval[] = ['monthly', 'yearly', 'semiannual'];

export function SubscriptionManager({ tenant }: { tenant: Tenant }) {
  const t = useTranslations('admin');
  const locale = useLocale();
  const { toast } = useToast();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(
    (tenant.billing_interval as BillingInterval) || 'monthly',
  );
  const [isLoading, setIsLoading] = useState<SelfServicePlan | null>(null);

  const currentPlan = (tenant.subscription_plan || 'starter') as SubscriptionPlan;
  const currentStatus = tenant.subscription_status || 'trial';
  const CurrentPlanIcon =
    PLAN_ICON_MAP[
      (currentPlan as SelfServicePlan) in PLAN_ICON_MAP
        ? (currentPlan as SelfServicePlan)
        : 'starter'
    ];

  const handleUpgrade = async (plan: SelfServicePlan) => {
    try {
      setIsLoading(plan);
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billingInterval }),
      });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (err) {
      logger.error('Checkout session error', err);
      toast({ title: t('subscription.paymentError'), variant: 'destructive' });
    } finally {
      setIsLoading(null);
    }
  };

  const statusBadgeClasses = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-status-success-bg text-status-success';
      case 'trial':
        return 'bg-status-warning-bg text-status-warning';
      case 'past_due':
        return 'bg-status-warning-bg text-status-warning';
      case 'cancelled':
      case 'frozen':
        return 'bg-status-error-bg text-status-error';
      default:
        return 'bg-app-elevated text-app-text-muted';
    }
  };

  const statusLabel = (status: string) => {
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
  };

  const dateInfo = (() => {
    if (!tenant.subscription_current_period_end) return null;
    const formatted = new Date(tenant.subscription_current_period_end).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const label =
      currentStatus === 'trial' ? t('subscription.trialEndsOn') : t('subscription.renewsOn');
    return `${label} ${formatted}`;
  })();

  const billingSubtitle = (plan: SelfServicePlan) => {
    if (billingInterval === 'monthly') return null;
    const total = PLAN_TOTALS[plan][billingInterval].toLocaleString(locale);
    return billingInterval === 'yearly'
      ? t('subscription.billedYearly', { total })
      : t('subscription.billedSemiannual', { total });
  };

  const intervalLabel: Record<BillingInterval, string> = {
    monthly: t('subscription.monthly'),
    yearly: t('subscription.yearly'),
    semiannual: t('subscription.semiannual'),
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Current plan bar */}
      <div className="shrink-0">
        <div className="bg-app-card rounded-xl border border-app-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-app-elevated border border-app-border flex items-center justify-center shrink-0">
              <CurrentPlanIcon className="w-4 h-4 text-app-text" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-app-text">
                  {PLAN_NAMES[currentPlan] || currentPlan}
                </span>
                <span
                  className={cn(
                    'text-xs font-semibold px-2 py-0.5 rounded-full',
                    statusBadgeClasses(currentStatus),
                  )}
                >
                  {statusLabel(currentStatus)}
                </span>
              </div>
              {dateInfo && (
                <p className="text-xs text-app-text-muted mt-0.5 flex items-center gap-1">
                  <CalendarDays className="w-3 h-3 shrink-0" />
                  {dateInfo}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Plan comparison (scrollable) */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4">
        {/* Section title + billing toggle */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap @sm:flex-nowrap">
          <h2 className="text-sm font-semibold text-app-text shrink-0">
            {t('subscription.changePlan')}
          </h2>
          <div className="flex items-center gap-0.5 p-1 bg-app-elevated rounded-lg border border-app-border shrink-0">
            {BILLING_INTERVALS.map((interval) => (
              <Button
                key={interval}
                variant="ghost"
                onClick={() => setBillingInterval(interval)}
                className={cn(
                  'h-7 px-3 text-xs font-semibold rounded-md transition-colors',
                  billingInterval === interval
                    ? 'bg-app-card text-app-text shadow-sm hover:bg-app-card'
                    : 'text-app-text-muted hover:text-app-text hover:bg-transparent',
                )}
              >
                {intervalLabel[interval]}
              </Button>
            ))}
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 @md:grid-cols-3 gap-3 pb-4">
          {SELF_SERVICE_PLANS.map((plan) => {
            const isCurrent = currentPlan === plan;
            const isPro = plan === 'pro';
            const PlanIcon = PLAN_ICON_MAP[plan];
            const price = PLAN_AMOUNTS[plan][billingInterval].toLocaleString(locale);
            const subtitle = billingSubtitle(plan);

            return (
              <div
                key={plan}
                className={cn(
                  'relative rounded-xl border flex flex-col p-5 transition-colors',
                  isCurrent
                    ? 'border-app-text bg-app-elevated'
                    : isPro
                      ? 'border-app-border bg-app-card ring-1 ring-inset ring-app-text/10'
                      : 'border-app-border bg-app-card',
                )}
              >
                {/* Top badge */}
                {(isCurrent || isPro) && (
                  <div className="absolute -top-3 left-0 right-0 flex justify-center">
                    <span className="bg-app-text text-white text-xs font-bold px-3 py-0.5 rounded-full whitespace-nowrap">
                      {isCurrent ? t('subscription.currentPlan') : t('subscription.popularPlan')}
                    </span>
                  </div>
                )}

                {/* Plan header */}
                <div className="flex items-center gap-2 mb-4 mt-1">
                  <div className="w-8 h-8 rounded-lg bg-app-bg border border-app-border flex items-center justify-center shrink-0">
                    <PlanIcon className="w-3.5 h-3.5 text-app-text-muted" />
                  </div>
                  <h3 className="text-sm font-bold text-app-text">{PLAN_NAMES[plan]}</h3>
                </div>

                {/* Price */}
                <div className="mb-5">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-app-text tabular-nums">{price}</span>
                    <span className="text-xs text-app-text-muted">
                      {t('subscription.perMonth')}
                    </span>
                  </div>
                  {subtitle && <p className="text-xs text-app-text-muted mt-0.5">{subtitle}</p>}
                </div>

                {/* Feature list */}
                <ul className="space-y-2.5 flex-1 mb-5">
                  {PLAN_FEATURES[plan].map((key) => (
                    <li key={key} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-status-success shrink-0 mt-0.5" />
                      <span className="text-xs text-app-text">
                        {t(`subscription.${key}` as Parameters<typeof t>[0])}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Button
                  onClick={() => !isCurrent && handleUpgrade(plan)}
                  disabled={isLoading !== null}
                  className={cn(
                    'w-full h-10 text-sm font-semibold rounded-lg',
                    isCurrent
                      ? 'bg-app-bg text-app-text-muted border border-app-border cursor-default hover:bg-app-bg'
                      : 'bg-app-text text-white hover:bg-app-text/90',
                  )}
                >
                  {isLoading === plan ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isCurrent ? (
                    t('subscription.currentPlan')
                  ) : (
                    t('subscription.choosePlan')
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
