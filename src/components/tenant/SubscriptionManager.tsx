'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { billingCapabilities } from '@/lib/billing/provider';
import { logger } from '@/lib/logger';
import type { SubscriptionPlan, BillingInterval } from '@/types/billing';
import { getTrialDaysRemaining, PLAN_NAMES } from '@/lib/plans/features';
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
  trial_ends_at?: string | null;
  subscription_current_period_end: string | null;
  billing_interval: string | null;
  stripe_subscription_id?: string | null;
  email?: string;
}

// Listes cumulatives: chaque plan ne liste que ce qu'il ajoute au precedent.
const PLAN_FEATURES: Record<SelfServicePlan, string[]> = {
  starter: [
    'feature1Space',
    'featureUnlimitedMenu',
    'featureBasicPOS',
    'featureHdPhotos',
    'featureEmailSupport',
  ],
  pro: [
    'featureFullPOS',
    'featureKDS',
    'featureInventory',
    'featureTableOrder',
    'featureAdvancedStats',
  ],
  business: [
    'feature10Spaces',
    'featureRoomService',
    'featureDelivery',
    'featureAIAnalytics',
    'featureUnlimitedStaff',
  ],
};

const INCLUDES_PLAN: Record<SelfServicePlan, SelfServicePlan | null> = {
  starter: null,
  pro: 'starter',
  business: 'pro',
};

const RECOMMENDED_PLAN: SelfServicePlan = 'pro';

/** Rang d'un plan: on ne recommande jamais un plan inferieur a l'actuel. */
function planRank(plan: string): number {
  const index = (SELF_SERVICE_PLANS as string[]).indexOf(plan);
  return index === -1 ? (plan === 'enterprise' ? SELF_SERVICE_PLANS.length : -1) : index;
}

export function SubscriptionManager({
  tenant,
  siteSlug,
  mobileMoney = false,
}: {
  tenant: Tenant;
  siteSlug: string;
  /** Paiement par mobile money ou carte (Flutterwave) propose: devise XOF/XAF et cles configurees. */
  mobileMoney?: boolean;
}) {
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
  // Un abonnement Stripe en cours garde son circuit (changement de plan, portail).
  const payByMobileMoney = mobileMoney && !hasSubscription;

  const currentPlan = (tenant.subscription_plan || 'starter') as SubscriptionPlan;
  const currentStatus = tenant.subscription_status || 'trial';

  const handleMobileMoney = async (plan: SelfServicePlan) => {
    setIsLoading(plan);
    try {
      const res = await fetch('/api/billing/flutterwave/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billingInterval }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      // 409: refus voulu et lisible (ex: changement d'offre possible a l'echeance).
      toast.error(
        res.status === 409 && data.error ? data.error : t('subscription.mobileMoneyError'),
      );
    } catch (error) {
      logger.error('Failed to start mobile money payment', error);
      toast.error(t('subscription.mobileMoneyError'));
    }
    setIsLoading(null);
  };

  const handleChangePlan = async (plan: SelfServicePlan) => {
    if (payByMobileMoney) {
      await handleMobileMoney(plan);
      return;
    }
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
      // `tenant` nomme le restaurant a abonner: sans lui, un proprietaire de
      // plusieurs etablissements se faisait facturer le plus ancien.
      router.push(
        `/checkout?plan=${plan}&interval=${billingInterval}&tenant=${encodeURIComponent(siteSlug)}`,
      );
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
          periodEnd={
            currentStatus === 'trial'
              ? (tenant.trial_ends_at ?? null)
              : tenant.subscription_current_period_end
          }
          trialDaysLeft={
            currentStatus === 'trial' && tenant.trial_ends_at
              ? getTrialDaysRemaining(tenant.trial_ends_at)
              : null
          }
          billingInterval={billingInterval}
          hasSubscription={hasSubscription}
          canOpenPortal={billingCapabilities().hostedPortal}
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
        {payByMobileMoney && (
          <p className="mb-4 text-xs text-app-text-muted">{t('subscription.mobileMoneyHint')}</p>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SELF_SERVICE_PLANS.map((plan) => (
            <PlanCard
              key={plan}
              plan={plan}
              features={PLAN_FEATURES[plan]}
              includesPlan={INCLUDES_PLAN[plan]}
              billingInterval={billingInterval}
              isCurrent={currentPlan === plan}
              isRecommended={plan === RECOMMENDED_PLAN && planRank(plan) > planRank(currentPlan)}
              isLoading={isLoading === plan}
              disabled={isLoading !== null || isBillingLoading}
              onChoose={() => handleChangePlan(plan)}
              ctaLabel={
                payByMobileMoney
                  ? t(
                      currentPlan === plan && currentStatus === 'active'
                        ? 'subscription.renewMobileMoney'
                        : 'subscription.payMobileMoney',
                    )
                  : !hasSubscription && currentPlan === plan
                    ? t('subscription.subscribeTo', { plan: PLAN_NAMES[plan] })
                    : undefined
              }
              // Sans abonnement (essai, gele, resilie), la formule actuelle se paie aussi.
              repayable={!hasSubscription}
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
