'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { logger } from '@/lib/logger';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { loadStripe } from '@stripe/stripe-js';
import type { PricingPlan, BillingInterval } from '@/components/shared/PricingCard';
import { PLAN_LIMITS } from '@/lib/plans/features';
import { cn } from '@/lib/utils';

// Initialiser Stripe
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

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

export function SubscriptionManager({ tenant }: SubscriptionManagerProps) {
  const t = useTranslations('admin');
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(
    (tenant.billing_interval as BillingInterval) || 'monthly',
  );
  const [isLoading, setIsLoading] = useState<string | null>(null);

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
      alert(t('subscription.paymentError'));
    } finally {
      setIsLoading(null);
    }
  };

  const currentPlan = tenant.subscription_plan as PricingPlan;

  // Use centralized plan limits from features.ts
  const planLimits = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.essentiel;
  const limits = {
    admins: planLimits.maxAdmins,
    venues: planLimits.maxVenues,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'trial':
        return 'bg-blue-100 text-blue-800';
      case 'past_due':
        return 'bg-orange-100 text-orange-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-neutral-100 text-neutral-800';
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

  return (
    <div className="space-y-8">
      {/* Current subscription status cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current plan status */}
        <div className="border border-neutral-100 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">
            {t('subscription.currentSubscription')}
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-neutral-500">{t('subscription.plan')}</p>
                <p className="text-2xl font-bold text-neutral-900 capitalize">{currentPlan}</p>
              </div>
              <Badge className={getStatusBadge(tenant.subscription_status)}>
                {getStatusLabel(tenant.subscription_status)}
              </Badge>
            </div>

            <div>
              <p className="text-sm text-neutral-500">{t('subscription.billingCycle')}</p>
              <p className="font-medium text-neutral-900">
                {tenant.billing_interval === 'yearly'
                  ? t('subscription.yearly')
                  : t('subscription.monthly')}
              </p>
            </div>

            {tenant.subscription_current_period_end && (
              <div>
                <p className="text-sm text-neutral-500">{t('subscription.nextRenewal')}</p>
                <p className="font-medium text-neutral-900">
                  {new Date(tenant.subscription_current_period_end).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Usage limits */}
        <div className="border border-neutral-100 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">
            {t('subscription.usageLimits')}
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-neutral-500">{t('subscription.administrators')}</span>
                <span className="font-semibold text-neutral-900">
                  {limits.admins > 50 ? t('subscription.unlimited') : limits.admins}
                </span>
              </div>
              <div className="w-full bg-neutral-100 rounded-full h-2">
                <div className="bg-neutral-900 h-2 rounded-full" style={{ width: '40%' }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-neutral-500">{t('subscription.venues')}</span>
                <span className="font-semibold text-neutral-900">
                  {limits.venues > 50 ? t('subscription.unlimited') : limits.venues}
                </span>
              </div>
              <div className="w-full bg-neutral-100 rounded-full h-2">
                <div className="bg-neutral-900 h-2 rounded-full" style={{ width: '20%' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Change plan section */}
      <div>
        <div className="flex flex-col md:flex-row justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-neutral-900">{t('subscription.changePlan')}</h2>

          <div className="relative inline-flex bg-neutral-50 p-1 rounded-full border border-neutral-100 mt-4 md:mt-0">
            <button
              onClick={() => setBillingInterval('monthly')}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-semibold transition-colors',
                billingInterval === 'monthly'
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:text-neutral-700',
              )}
            >
              {t('subscription.monthly')}
            </button>
            <button
              onClick={() => setBillingInterval('yearly')}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-1',
                billingInterval === 'yearly'
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:text-neutral-700',
              )}
            >
              {t('subscription.yearly')}{' '}
              <span className="text-[10px] bg-green-100 text-green-700 px-1.5 rounded-full">
                -15%
              </span>
            </button>
          </div>
        </div>

        {/* Side-by-side plan comparison cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(['essentiel', 'premium'] as const).map((plan) => {
            const featureKeys =
              plan === 'essentiel' ? ESSENTIEL_FEATURE_KEYS : PREMIUM_FEATURE_KEYS;
            const isCurrent = currentPlan === plan;
            const price = getPrice(plan);
            const yearlyTotal = getYearlyTotal(plan);

            return (
              <div
                key={plan}
                className={cn(
                  'border rounded-xl p-6 flex flex-col',
                  isCurrent ? 'border-2 border-lime-400' : 'border border-neutral-100',
                )}
              >
                {/* Plan header */}
                <div className="mb-6">
                  {isCurrent && (
                    <span className="inline-block text-xs font-medium text-lime-700 bg-lime-50 px-2 py-0.5 rounded-full mb-2">
                      {t('subscription.currentPlan')}
                    </span>
                  )}
                  <h3 className="text-xl font-semibold text-neutral-900">
                    {plan === 'essentiel'
                      ? t('subscription.essentielName')
                      : t('subscription.premiumName')}
                  </h3>
                  <p className="text-sm text-neutral-500 mt-1">
                    {plan === 'essentiel'
                      ? t('subscription.essentielDesc')
                      : t('subscription.premiumDesc')}
                  </p>
                </div>

                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-neutral-900">
                      {price.toLocaleString('fr-FR')}
                    </span>
                    <span className="text-neutral-500 text-sm font-medium">
                      {t('subscription.perMonth')}
                    </span>
                  </div>
                  {billingInterval === 'yearly' && (
                    <p className="text-xs text-neutral-500 mt-1">
                      {t('subscription.billedYearly', {
                        total: yearlyTotal.toLocaleString('fr-FR'),
                      })}
                    </p>
                  )}
                </div>

                {/* Feature checklist */}
                <div className="space-y-3 flex-grow mb-6">
                  {featureKeys.map((key) => (
                    <div key={key} className="flex items-start gap-3">
                      <Check className="h-4 w-4 shrink-0 mt-0.5 text-neutral-900" />
                      <span className="text-sm text-neutral-900">{t(`subscription.${key}`)}</span>
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
                      ? 'bg-neutral-100 text-neutral-500 cursor-not-allowed'
                      : plan === 'premium'
                        ? 'bg-neutral-900 text-white hover:bg-neutral-800'
                        : 'bg-white text-neutral-900 border border-neutral-200 hover:bg-neutral-50',
                  )}
                >
                  {isCurrent
                    ? t('subscription.currentPlan')
                    : isLoading === plan
                      ? t('subscription.loading')
                      : plan === 'premium'
                        ? t('subscription.upgradePremium')
                        : t('subscription.chooseEssentiel')}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
