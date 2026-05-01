'use client';

import { createContext, useContext, useMemo, useState, useCallback, ReactNode } from 'react';
import type { Tenant } from '@/types/admin.types';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import {
  PlanLimits,
  FeatureKey,
  getPlanLimits,
  getEffectivePlan,
  isTrialActive,
  getTrialDaysRemaining,
  isSubscriptionUsable,
  PLAN_NAMES,
} from '@/lib/plans/features';
import { UpgradePromptModal } from '@/components/tenant/UpgradePromptModal';

// --- Types ---

export type GatedFeature = 'kds' | 'inventory' | 'recipes' | 'reports';

interface SubscriptionContextType {
  plan: SubscriptionPlan;
  effectivePlan: SubscriptionPlan;
  status: SubscriptionStatus | null;
  limits: PlanLimits;
  canAccess: (feature: FeatureKey) => boolean;
  isLimitReached: (
    limitKey: 'maxAdmins' | 'maxVenues' | 'maxMenus' | 'maxItems' | 'maxStaff' | 'maxCategories',
    currentCount: number,
  ) => boolean;
  isInTrial: boolean;
  daysRemaining: number;
  isFrozen: boolean;
  isPastDue: boolean;
  isUsable: boolean;
  planName: string;
  effectivePlanName: string;
  showUpgradeModal: (feature: GatedFeature) => void;
  hideUpgradeModal: () => void;
}

// --- Context ---

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

// --- Provider ---

interface SubscriptionProviderProps {
  children: ReactNode;
  tenant: Pick<Tenant, 'subscription_plan' | 'subscription_status' | 'trial_ends_at'> | null;
  tenantSlug?: string;
}

export function SubscriptionProvider({ children, tenant, tenantSlug }: SubscriptionProviderProps) {
  const [upgradeFeature, setUpgradeFeature] = useState<GatedFeature | null>(null);

  const showUpgradeModal = useCallback((feature: GatedFeature) => setUpgradeFeature(feature), []);
  const hideUpgradeModal = useCallback(() => setUpgradeFeature(null), []);

  const value = useMemo<SubscriptionContextType>(() => {
    const plan = (tenant?.subscription_plan || 'starter') as SubscriptionPlan;
    const status = (tenant?.subscription_status || null) as SubscriptionStatus | null;
    const trialEndsAt = tenant?.trial_ends_at || null;

    const effectivePlan = getEffectivePlan(plan, status, trialEndsAt);
    const limits = getPlanLimits(plan, status, trialEndsAt);
    const inTrial = isTrialActive(status, trialEndsAt);
    const daysRemaining = getTrialDaysRemaining(trialEndsAt);

    return {
      plan,
      effectivePlan,
      status,
      limits,
      canAccess: (feature: FeatureKey) => {
        const val = limits[feature];
        if (typeof val === 'boolean') return val;
        return true;
      },
      isLimitReached: (
        limitKey:
          | 'maxAdmins'
          | 'maxVenues'
          | 'maxMenus'
          | 'maxItems'
          | 'maxStaff'
          | 'maxCategories',
        currentCount: number,
      ) => {
        const limit = limits[limitKey];
        if (limit === -1) return false;
        return currentCount >= limit;
      },
      isInTrial: inTrial,
      daysRemaining,
      isFrozen: status === 'frozen',
      isPastDue: status === 'past_due',
      isUsable: isSubscriptionUsable(status),
      planName: PLAN_NAMES[plan],
      effectivePlanName: PLAN_NAMES[effectivePlan],
      showUpgradeModal,
      hideUpgradeModal,
    };
  }, [
    tenant?.subscription_plan,
    tenant?.subscription_status,
    tenant?.trial_ends_at,
    showUpgradeModal,
    hideUpgradeModal,
  ]);

  const checkoutUrl = tenantSlug ? `/sites/${tenantSlug}/admin/subscription` : '/pricing';

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
      {upgradeFeature && (
        <UpgradePromptModal
          feature={upgradeFeature}
          checkoutUrl={checkoutUrl}
          onClose={hideUpgradeModal}
        />
      )}
    </SubscriptionContext.Provider>
  );
}

// --- Hook ---

export function useSubscription(): SubscriptionContextType {
  const context = useContext(SubscriptionContext);
  if (!context) {
    return {
      plan: 'starter',
      effectivePlan: 'starter',
      status: null,
      limits: getPlanLimits('starter'),
      canAccess: () => true,
      isLimitReached: () => false,
      isInTrial: false,
      daysRemaining: 0,
      isFrozen: false,
      isPastDue: false,
      isUsable: true,
      planName: 'Starter',
      effectivePlanName: 'Starter',
      showUpgradeModal: () => {},
      hideUpgradeModal: () => {},
    };
  }
  return context;
}
