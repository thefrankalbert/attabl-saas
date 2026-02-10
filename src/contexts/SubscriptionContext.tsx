'use client';

import { createContext, useContext, useMemo, ReactNode } from 'react';
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

// ─── Types ──────────────────────────────────────────────

interface SubscriptionContextType {
  /** The stored plan (essentiel, premium, enterprise) */
  plan: SubscriptionPlan;
  /** The effective plan considering trial status */
  effectivePlan: SubscriptionPlan;
  /** Subscription status */
  status: SubscriptionStatus | null;
  /** Computed limits based on effective plan */
  limits: PlanLimits;
  /** Check if a boolean feature is available */
  canAccess: (feature: FeatureKey) => boolean;
  /** Check if a numeric limit is reached */
  isLimitReached: (limitKey: 'maxAdmins' | 'maxVenues' | 'maxItems' | 'maxSounds', currentCount: number) => boolean;
  /** Whether the tenant is in active trial */
  isInTrial: boolean;
  /** Days remaining in trial (0 if not in trial) */
  daysRemaining: number;
  /** Whether subscription is in a usable state */
  isUsable: boolean;
  /** Human-readable plan name */
  planName: string;
  /** Human-readable effective plan name */
  effectivePlanName: string;
}

// ─── Context ────────────────────────────────────────────

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

// ─── Provider ───────────────────────────────────────────

interface SubscriptionProviderProps {
  children: ReactNode;
  tenant: Pick<Tenant, 'subscription_plan' | 'subscription_status' | 'trial_ends_at'> | null;
}

export function SubscriptionProvider({ children, tenant }: SubscriptionProviderProps) {
  const value = useMemo<SubscriptionContextType>(() => {
    const plan = (tenant?.subscription_plan || 'essentiel') as SubscriptionPlan;
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
        // For numeric limits, canAccess returns true (they have the feature, just capped)
        return true;
      },
      isLimitReached: (
        limitKey: 'maxAdmins' | 'maxVenues' | 'maxItems' | 'maxSounds',
        currentCount: number,
      ) => {
        return currentCount >= limits[limitKey];
      },
      isInTrial: inTrial,
      daysRemaining,
      isUsable: isSubscriptionUsable(status),
      planName: PLAN_NAMES[plan],
      effectivePlanName: PLAN_NAMES[effectivePlan],
    };
  }, [tenant?.subscription_plan, tenant?.subscription_status, tenant?.trial_ends_at]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────

export function useSubscription(): SubscriptionContextType {
  const context = useContext(SubscriptionContext);
  if (!context) {
    // Provide safe defaults when used outside provider (e.g., client-facing pages)
    return {
      plan: 'essentiel',
      effectivePlan: 'essentiel',
      status: null,
      limits: getPlanLimits('essentiel'),
      canAccess: () => true,
      isLimitReached: () => false,
      isInTrial: false,
      daysRemaining: 0,
      isUsable: true,
      planName: 'Essentiel',
      effectivePlanName: 'Essentiel',
    };
  }
  return context;
}
