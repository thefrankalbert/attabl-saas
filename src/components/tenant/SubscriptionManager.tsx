'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import type { SubscriptionPlan, BillingInterval } from '@/types/billing';
import { CurrentPlanPanel } from './subscription/CurrentPlanPanel';
import { BillingIntervalToggle } from './subscription/BillingIntervalToggle';
import { PlanCard } from './subscription/PlanCard';
import { EnterpriseStrip } from './subscription/EnterpriseStrip';
import {
  SELF_SERVICE_PLANS,
  BILLING_INTERVALS,
  type SelfServicePlan,
} from './subscription/pricing-format';

interface Tenant {
  id: string;
  subscription_plan?: string;
  subscription_status?: string;
  subscription_current_period_end: string | null;
  billing_interval: string | null;
  stripe_subscription_id?: string | null;
  email?: string;
}

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

const RECOMMENDED_PLAN: SelfServicePlan = 'pro';

export function SubscriptionManager({ tenant, siteSlug }: { tenant: Tenant; siteSlug: string }) {
  const t = useTranslations('admin');
  const router = useRouter();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(() =>
    BILLING_INTERVALS.includes(tenant.billing_interval as BillingInterval)
      ? (tenant.billing_interval as BillingInterval)
      : 'monthly',
  );
  const [isLoading, setIsLoading] = useState<SelfServicePlan | null>(null);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const hasSubscription = Boolean(tenant.stripe_subscription_id);

  const currentPlan = (tenant.subscription_plan || 'starter') as SubscriptionPlan;
  const currentStatus = tenant.subscription_status || 'trial';

  const handleChangePlan = async (plan: SelfServicePlan) => {
    setIsLoading(plan);
    // Existing subscriber: change plan in place (proration). Otherwise start a checkout.
    if (hasSubscription) {
      try {
        const res = await fetch('/api/update-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan, billingInterval }),
        });
        const data = (await res.json()) as { error?: string };
        if (res.ok) {
          toast.success(t('subscription.planChanged'));
          router.refresh();
        } else {
          toast.error(data.error || t('subscription.planChangeError'));
        }
      } catch (error) {
        logger.error('Failed to change plan', error);
        toast.error(t('subscription.planChangeError'));
      } finally {
        setIsLoading(null);
      }
    } else {
      router.push(`/checkout?plan=${plan}&interval=${billingInterval}`);
    }
  };

  const handleManageBilling = async () => {
    setIsBillingLoading(true);
    try {
      const res = await fetch('/api/billing-portal', { method: 'POST' });
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(t('subscription.planChangeError'));
        setIsBillingLoading(false);
      }
    } catch (error) {
      logger.error('Failed to open billing portal', error);
      toast.error(t('subscription.planChangeError'));
      setIsBillingLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0">
        <CurrentPlanPanel
          plan={currentPlan}
          status={currentStatus}
          periodEnd={tenant.subscription_current_period_end}
          billingInterval={billingInterval}
          hasSubscription={hasSubscription}
          isBillingLoading={isBillingLoading}
          onManageBilling={handleManageBilling}
        />
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto scrollbar-hide">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="shrink-0 text-sm font-semibold text-app-text">
            {t('subscription.changePlan')}
          </h2>
          <BillingIntervalToggle value={billingInterval} onChange={setBillingInterval} />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SELF_SERVICE_PLANS.map((plan) => (
            <PlanCard
              key={plan}
              plan={plan}
              features={PLAN_FEATURES[plan]}
              billingInterval={billingInterval}
              isCurrent={currentPlan === plan}
              isRecommended={plan === RECOMMENDED_PLAN && currentPlan !== plan}
              isLoading={isLoading === plan}
              disabled={isLoading !== null || isBillingLoading}
              onChoose={() => handleChangePlan(plan)}
            />
          ))}
        </div>

        <div className="mt-3 pb-4">
          <EnterpriseStrip supportHref={`/sites/${siteSlug}/admin/support`} />
        </div>
      </div>
    </div>
  );
}
