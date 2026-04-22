'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Crown, Zap, Building2, Check, Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { PLAN_LIMITS, PLAN_NAMES } from '@/lib/plans/features';
import { PLAN_AMOUNTS } from '@/lib/stripe/pricing';
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

interface SubscriptionManagerProps {
  tenant: Tenant;
}

type SelfServicePlan = Exclude<SubscriptionPlan, 'enterprise'>;

const STARTER_FEATURE_KEYS = [
  'feature1Space',
  'featureUnlimitedMenu',
  'featureBasicPOS',
  'featureEmailSupport',
  'featureHdPhotos',
] as const;

const PRO_FEATURE_KEYS = [
  'feature1Space',
  'featureTableOrder',
  'featureFullPOS',
  'featureKDS',
  'featureInventory',
  'featureAdvancedStats',
] as const;

const BUSINESS_FEATURE_KEYS = [
  'feature10Spaces',
  'featureAllProFeatures',
  'featureRoomService',
  'featureDelivery',
  'featureAIAnalytics',
  'featureUnlimitedStaff',
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

  const currentPlan = (tenant.subscription_plan || 'starter') as SubscriptionPlan;

  // Use centralized plan limits from features.ts
  const planLimits = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.starter;
  const limits = {
    admins: planLimits.maxAdmins,
    venues: planLimits.maxVenues,
  };

  const handleUpgrade = async (plan: SelfServicePlan, interval: BillingInterval) => {
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
      logger.error('Erreur lors de la creation de la session', error);
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
      case 'frozen':
        return 'bg-status-error-bg text-status-error';
      default:
        return 'text-sm';
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
      case 'frozen':
        return t('subscription.statusFrozen');
      default:
        return status;
    }
  };

  const getPrice = (plan: SelfServicePlan) => {
    return PLAN_AMOUNTS[plan][billingInterval];
  };

  const tabs = [
    { id: 'plan' as const, label: t('subscription.tabMyPlan') },
    { id: 'upgrade' as const, label: t('subscription.tabChangePlan') },
  ];

  const PLAN_ICON_MAP: Record<SelfServicePlan, typeof Zap> = {
    starter: Zap,
    pro: Crown,
    business: Building2,
  };

  const PLAN_FEATURES_MAP: Record<SelfServicePlan, readonly string[]> = {
    starter: STARTER_FEATURE_KEYS,
    pro: PRO_FEATURE_KEYS,
    business: BUSINESS_FEATURE_KEYS,
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab pills */}
      <div className="shrink-0 space-y-4">
        <div className="flex items-center gap-1.5">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant="outline"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-3 py-1.5 text-[11px] font-bold rounded-lg whitespace-nowrap h-auto',
                activeTab === tab.id
                  ? 'bg-app-text text-white border-app-text shadow-sm'
                  : 'bg-white border-app-border hover:bg-app-elevated',
              )}
              style={
                activeTab !== tab.id
                  ? { color: 'rgb(115, 115, 115)', borderColor: 'rgba(238,238,238,0.5)' }
                  : undefined
              }
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4">
        {activeTab === 'plan' ? (
          /* Tab 1: Current plan info */
          <div className="space-y-4">
            {/* Plan status card */}
            <div
              className="rounded-[10px] p-6 bg-white"
              style={{ border: '1px solid rgba(238,238,238,0.6)' }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-5 w-5" style={{ color: 'rgb(115, 115, 115)' }} />
                <h3 className="text-lg font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
                  {t('subscription.currentSubscription')}
                </h3>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm" style={{ color: 'rgb(115, 115, 115)' }}>
                      {t('subscription.plan')}
                    </p>
                    <p className="text-2xl font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
                      {PLAN_NAMES[currentPlan] || currentPlan}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-normal',
                      getStatusBadge(tenant.subscription_status || 'active'),
                    )}
                  >
                    {getStatusLabel(tenant.subscription_status || 'active')}
                  </span>
                </div>

                <div>
                  <p className="text-sm" style={{ color: 'rgb(115, 115, 115)' }}>
                    {t('subscription.billingCycle')}
                  </p>
                  <p className="font-normal" style={{ color: 'rgb(26, 26, 26)' }}>
                    {tenant.billing_interval === 'yearly'
                      ? t('subscription.yearly')
                      : t('subscription.monthly')}
                  </p>
                </div>

                {tenant.subscription_current_period_end && (
                  <div>
                    <p className="text-sm" style={{ color: 'rgb(115, 115, 115)' }}>
                      {t('subscription.nextRenewal')}
                    </p>
                    <p className="font-normal" style={{ color: 'rgb(26, 26, 26)' }}>
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
            <div
              className="rounded-[10px] p-6 bg-white"
              style={{ border: '1px solid rgba(238,238,238,0.6)' }}
            >
              <h3 className="text-lg font-bold mb-4" style={{ color: 'rgb(26, 26, 26)' }}>
                {t('subscription.usageLimits')}
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: 'rgb(115, 115, 115)' }}>
                    {t('subscription.administrators')}
                  </span>
                  <span className="font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
                    {limits.admins > 50 ? t('subscription.unlimited') : limits.admins}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: 'rgb(115, 115, 115)' }}>
                    {t('subscription.venues')}
                  </span>
                  <span className="font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
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
              <div
                className="relative inline-flex p-1 rounded-full"
                style={{
                  backgroundColor: 'rgb(246, 246, 246)',
                  border: '1px solid rgba(238,238,238,0.6)',
                }}
              >
                <Button
                  variant="ghost"
                  onClick={() => setBillingInterval('monthly')}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-bold h-auto',
                    billingInterval === 'monthly' ? 'bg-app-text text-white' : '',
                  )}
                  style={
                    billingInterval !== 'monthly' ? { color: 'rgb(115, 115, 115)' } : undefined
                  }
                >
                  {t('subscription.monthly')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setBillingInterval('yearly')}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-bold flex items-center gap-1 h-auto',
                    billingInterval === 'yearly' ? 'bg-app-text text-white' : '',
                  )}
                  style={billingInterval !== 'yearly' ? { color: 'rgb(115, 115, 115)' } : undefined}
                >
                  {t('subscription.yearly')}{' '}
                  <span className="text-[10px] bg-status-success-bg text-status-success px-1.5 rounded-full">
                    -20%
                  </span>
                </Button>
              </div>
            </div>

            {/* Plan comparison cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(['starter', 'pro', 'business'] as const).map((plan) => {
                const featureKeys = PLAN_FEATURES_MAP[plan];
                const isCurrent = currentPlan === plan;
                const price = getPrice(plan);
                const PlanIcon = PLAN_ICON_MAP[plan];

                return (
                  <div
                    key={plan}
                    className={cn(
                      'border rounded-[10px] p-6 flex flex-col bg-white',
                      isCurrent ? 'border-2 border-lime-400' : '',
                    )}
                    style={!isCurrent ? { border: '1px solid rgba(238,238,238,0.6)' } : undefined}
                  >
                    {/* Plan header */}
                    <div className="mb-6">
                      {isCurrent && (
                        <span className="inline-block text-xs font-normal text-lime-700 bg-lime-50 px-2 py-0.5 rounded-full mb-2">
                          {t('subscription.currentPlan')}
                        </span>
                      )}
                      <div className="flex items-center gap-2">
                        <PlanIcon className="h-5 w-5" style={{ color: 'rgb(115, 115, 115)' }} />
                        <h3 className="text-xl font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
                          {PLAN_NAMES[plan]}
                        </h3>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="mb-6">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold" style={{ color: 'rgb(26, 26, 26)' }}>
                          {price.toLocaleString(locale)}
                        </span>
                        <span
                          className="text-sm font-normal"
                          style={{ color: 'rgb(115, 115, 115)' }}
                        >
                          {t('subscription.perMonth')}
                        </span>
                      </div>
                    </div>

                    {/* Feature checklist */}
                    <div className="space-y-3 flex-grow mb-6">
                      {featureKeys.map((key) => (
                        <div key={key} className="flex items-start gap-3">
                          <Check
                            className="h-4 w-4 shrink-0 mt-0.5"
                            style={{ color: 'rgb(26, 26, 26)' }}
                          />
                          <span className="text-sm" style={{ color: 'rgb(26, 26, 26)' }}>
                            {t(`subscription.${key}`)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* CTA button */}
                    <Button
                      onClick={() => handleUpgrade(plan, billingInterval)}
                      disabled={isLoading === plan || isCurrent}
                      className={cn(
                        'w-full h-11 rounded-lg font-bold text-sm transition-colors',
                        isCurrent
                          ? 'cursor-not-allowed'
                          : plan === 'pro'
                            ? 'bg-app-text text-white hover:bg-app-text/90'
                            : 'bg-white hover:bg-app-elevated',
                      )}
                      style={
                        isCurrent
                          ? { backgroundColor: 'rgb(246, 246, 246)', color: 'rgb(176, 176, 176)' }
                          : plan !== 'pro'
                            ? {
                                color: 'rgb(26, 26, 26)',
                                border: '1px solid rgba(238,238,238,0.6)',
                              }
                            : undefined
                      }
                    >
                      {isLoading === plan ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
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
        )}
      </div>
    </div>
  );
}
