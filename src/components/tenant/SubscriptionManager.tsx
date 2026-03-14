'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Crown, Zap, Check, Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { PLAN_LIMITS } from '@/lib/plans/features';
import { logger } from '@/lib/logger';
import type { PricingPlan, BillingInterval } from '@/components/shared/PricingCard';

interface Tenant {
  id: string;
  subscription_plan: string;
  subscription_status: string;
  subscription_current_period_end: string | null;
  billing_interval: string | null;
  email?: string;
}

interface SubscriptionManagerProps {
  tenant: Tenant;
}

const ESSENTIEL_FEATURE_KEYS = [
  'feature1Space',
  'featureUnlimitedMenu',
  'feature2Admins',
  'featureEmailSupport',
  'featureHdPhotos',
] as const;

const PREMIUM_FEATURE_KEYS = [
  'feature3Spaces',
  'featureTableOrder',
  'feature5Admins',
  'featureMultiLang',
  'featureWhatsappSupport',
  'featureAdvancedStats',
] as const;

type SubTab = 'plan' | 'upgrade';

export function SubscriptionManager({ tenant }: SubscriptionManagerProps) {
  const t = useTranslations('admin');
  const locale = useLocale();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<SubTab>('plan');
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(
    (tenant.billing_interval as BillingInterval) || 'monthly',
  );
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const currentPlan = tenant.subscription_plan as PricingPlan;

  // Use centralized plan limits from features.ts
  const planLimits = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.essentiel;
  const limits = {
    admins: planLimits.maxAdmins,
    venues: planLimits.maxVenues,
  };

  const handleUpgrade = async (plan: PricingPlan, interval: BillingInterval) => {
    try {
      setIsLoading(plan);

      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan,
          billingInterval: interval,
          tenantId: tenant.id,
          email: tenant.email,
        }),
      });

      const { url, error } = await response.json();

      if (error) {
        throw new Error(error);
      }

      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      logger.error('Erreur lors de la création de la session', error);
      toast({
        title: t('subscription.paymentError'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-status-success-bg text-status-success';
      case 'trial':
        return 'bg-status-warning-bg text-status-warning';
      case 'past_due':
        return 'bg-status-warning-bg text-status-warning';
      case 'cancelled':
        return 'bg-status-error-bg text-status-error';
      default:
        return 'bg-app-elevated text-app-text-secondary';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return t('subscription.statusActive');
      case 'trial':
        return t('subscription.statusTrial');
      case 'past_due':
        return t('subscription.statusPastDue');
      case 'cancelled':
        return t('subscription.statusCancelled');
      default:
        return status;
    }
  };

  // Pricing calculation
  const getPrice = (plan: PricingPlan) => {
    const baseMonthlyPrice = plan === 'essentiel' ? 39800 : 79800;
    const annualDiscountRate = 0.15;
    if (billingInterval === 'yearly') {
      return Math.round(baseMonthlyPrice * (1 - annualDiscountRate));
    }
    return baseMonthlyPrice;
  };

  const getYearlyTotal = (plan: PricingPlan) => {
    const baseMonthlyPrice = plan === 'essentiel' ? 39800 : 79800;
    const annualDiscountRate = 0.15;
    return Math.round(baseMonthlyPrice * 12 * (1 - annualDiscountRate));
  };

  const tabs = [
    { id: 'plan' as const, label: t('subscription.tabMyPlan') },
    { id: 'upgrade' as const, label: t('subscription.tabChangePlan') },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab pills */}
      <div className="shrink-0 space-y-4">
        <div className="flex items-center gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-3 py-1.5 text-[11px] font-semibold rounded-lg whitespace-nowrap transition-all border',
                activeTab === tab.id
                  ? 'bg-app-text text-app-bg border-app-text shadow-sm'
                  : 'bg-app-card text-app-text-secondary border-app-border/50 hover:border-app-border hover:bg-app-elevated',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4">
        {activeTab === 'plan' ? (
          /* Tab 1: Current plan info */
          <div className="space-y-4">
            {/* Plan status card */}
            <div className="border border-app-border/60 rounded-xl p-6 bg-app-card">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-5 w-5 text-app-text-secondary" />
                <h3 className="text-lg font-semibold text-app-text">
                  {t('subscription.currentSubscription')}
                </h3>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-app-text-secondary">{t('subscription.plan')}</p>
                    <p className="text-2xl font-bold text-app-text capitalize">{currentPlan}</p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                      getStatusBadge(tenant.subscription_status),
                    )}
                  >
                    {getStatusLabel(tenant.subscription_status)}
                  </span>
                </div>

                <div>
                  <p className="text-sm text-app-text-secondary">
                    {t('subscription.billingCycle')}
                  </p>
                  <p className="font-medium text-app-text">
                    {tenant.billing_interval === 'yearly'
                      ? t('subscription.yearly')
                      : t('subscription.monthly')}
                  </p>
                </div>

                {tenant.subscription_current_period_end && (
                  <div>
                    <p className="text-sm text-app-text-secondary">
                      {t('subscription.nextRenewal')}
                    </p>
                    <p className="font-medium text-app-text">
                      {new Date(tenant.subscription_current_period_end).toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Limits card */}
            <div className="border border-app-border/60 rounded-xl p-6 bg-app-card">
              <h3 className="text-lg font-semibold text-app-text mb-4">
                {t('subscription.usageLimits')}
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-app-text-secondary">
                    {t('subscription.administrators')}
                  </span>
                  <span className="font-semibold text-app-text">
                    {limits.admins > 50 ? t('subscription.unlimited') : limits.admins}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-app-text-secondary">
                    {t('subscription.venues')}
                  </span>
                  <span className="font-semibold text-app-text">
                    {limits.venues > 50 ? t('subscription.unlimited') : limits.venues}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Tab 2: Change plan */
          <div className="space-y-4">
            {/* Interval toggle */}
            <div className="flex items-center justify-center">
              <div className="relative inline-flex bg-app-elevated p-1 rounded-full border border-app-border/60">
                <button
                  onClick={() => setBillingInterval('monthly')}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-semibold transition-colors',
                    billingInterval === 'monthly'
                      ? 'bg-app-text text-app-bg'
                      : 'text-app-text-secondary hover:text-app-text',
                  )}
                >
                  {t('subscription.monthly')}
                </button>
                <button
                  onClick={() => setBillingInterval('yearly')}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-1',
                    billingInterval === 'yearly'
                      ? 'bg-app-text text-app-bg'
                      : 'text-app-text-secondary hover:text-app-text',
                  )}
                >
                  {t('subscription.yearly')}{' '}
                  <span className="text-[10px] bg-status-success-bg text-status-success px-1.5 rounded-full">
                    -15%
                  </span>
                </button>
              </div>
            </div>

            {/* Plan comparison cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(['essentiel', 'premium'] as const).map((plan) => {
                const featureKeys =
                  plan === 'essentiel' ? ESSENTIEL_FEATURE_KEYS : PREMIUM_FEATURE_KEYS;
                const isCurrent = currentPlan === plan;
                const price = getPrice(plan);
                const yearlyTotal = getYearlyTotal(plan);
                const PlanIcon = plan === 'premium' ? Crown : Zap;

                return (
                  <div
                    key={plan}
                    className={cn(
                      'border rounded-xl p-6 flex flex-col bg-app-card',
                      isCurrent ? 'border-2 border-lime-400' : 'border border-app-border/60',
                    )}
                  >
                    {/* Plan header */}
                    <div className="mb-6">
                      {isCurrent && (
                        <span className="inline-block text-xs font-medium text-lime-700 bg-lime-50 px-2 py-0.5 rounded-full mb-2">
                          {t('subscription.currentPlan')}
                        </span>
                      )}
                      <div className="flex items-center gap-2">
                        <PlanIcon className="h-5 w-5 text-app-text-secondary" />
                        <h3 className="text-xl font-semibold text-app-text">
                          {plan === 'essentiel'
                            ? t('subscription.essentielName')
                            : t('subscription.premiumName')}
                        </h3>
                      </div>
                      <p className="text-sm text-app-text-secondary mt-1">
                        {plan === 'essentiel'
                          ? t('subscription.essentielDesc')
                          : t('subscription.premiumDesc')}
                      </p>
                    </div>

                    {/* Price */}
                    <div className="mb-6">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-app-text">
                          {price.toLocaleString(locale)}
                        </span>
                        <span className="text-app-text-secondary text-sm font-medium">
                          {t('subscription.perMonth')}
                        </span>
                      </div>
                      {billingInterval === 'yearly' && (
                        <p className="text-xs text-app-text-secondary mt-1">
                          {t('subscription.billedYearly', {
                            total: yearlyTotal.toLocaleString(locale),
                          })}
                        </p>
                      )}
                    </div>

                    {/* Feature checklist */}
                    <div className="space-y-3 flex-grow mb-6">
                      {featureKeys.map((key) => (
                        <div key={key} className="flex items-start gap-3">
                          <Check className="h-4 w-4 shrink-0 mt-0.5 text-app-text" />
                          <span className="text-sm text-app-text">{t(`subscription.${key}`)}</span>
                        </div>
                      ))}
                    </div>

                    {/* CTA button */}
                    <Button
                      onClick={() => handleUpgrade(plan, billingInterval)}
                      disabled={isLoading === plan || isCurrent}
                      className={cn(
                        'w-full h-11 rounded-lg font-semibold text-sm transition-colors',
                        isCurrent
                          ? 'bg-app-elevated text-app-text-muted cursor-not-allowed'
                          : plan === 'premium'
                            ? 'bg-app-text text-app-bg hover:bg-app-text/90'
                            : 'bg-app-card text-app-text border border-app-border/60 hover:bg-app-elevated',
                      )}
                    >
                      {isLoading === plan ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isCurrent ? (
                        t('subscription.currentPlan')
                      ) : plan === 'premium' ? (
                        t('subscription.upgradePremium')
                      ) : (
                        t('subscription.chooseEssentiel')
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
