/**
 * Feature Gating - Centralized plan limits & access control
 *
 * This is the SINGLE SOURCE OF TRUTH for what each plan can do.
 * Used by both server-side checks and client-side SubscriptionContext.
 */

import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

// --- Plan Limits Definition ---

export interface PlanLimits {
  // Quantitative limits
  maxVenues: number;
  maxAdmins: number;
  maxStaff: number;
  maxMenus: number;
  maxItems: number;
  maxCategories: number;
  // Feature flags
  canAccessPOS: boolean;
  canAccessKDS: boolean;
  canAccessTables: boolean;
  canAccessService: boolean;
  canAccessInventory: boolean;
  canAccessRecipes: boolean;
  canAccessSuppliers: boolean;
  canAccessMultiCurrency: boolean;
  canAccessReports: boolean;
  canAccessTeamManagement: boolean;
  canAccessQrCustomization: boolean;
  canAccessTips: boolean;
  canAccessRoomService: boolean;
  canAccessDelivery: boolean;
  canAccessAIAnalytics: boolean;
}

export type FeatureKey = keyof PlanLimits;

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  starter: {
    maxVenues: 1,
    maxAdmins: 1,
    maxStaff: 3,
    maxMenus: 2,
    maxItems: 50,
    maxCategories: 10,
    canAccessPOS: true,
    canAccessKDS: false,
    canAccessTables: false,
    canAccessService: false,
    canAccessInventory: false,
    canAccessRecipes: false,
    canAccessSuppliers: false,
    canAccessMultiCurrency: false,
    canAccessReports: false,
    canAccessTeamManagement: false,
    canAccessQrCustomization: false,
    canAccessTips: false,
    canAccessRoomService: false,
    canAccessDelivery: false,
    canAccessAIAnalytics: false,
  },
  pro: {
    maxVenues: 1,
    maxAdmins: 1,
    maxStaff: 10,
    maxMenus: 10,
    maxItems: 500,
    maxCategories: 50,
    canAccessPOS: true,
    canAccessKDS: true,
    canAccessTables: true,
    canAccessService: true,
    canAccessInventory: true,
    canAccessRecipes: true,
    canAccessSuppliers: true,
    canAccessMultiCurrency: true,
    canAccessReports: true,
    canAccessTeamManagement: true,
    canAccessQrCustomization: true,
    canAccessTips: true,
    canAccessRoomService: false,
    canAccessDelivery: false,
    canAccessAIAnalytics: false,
  },
  business: {
    maxVenues: 10,
    maxAdmins: 99,
    maxStaff: 999,
    maxMenus: 99,
    maxItems: 9999,
    maxCategories: 999,
    canAccessPOS: true,
    canAccessKDS: true,
    canAccessTables: true,
    canAccessService: true,
    canAccessInventory: true,
    canAccessRecipes: true,
    canAccessSuppliers: true,
    canAccessMultiCurrency: true,
    canAccessReports: true,
    canAccessTeamManagement: true,
    canAccessQrCustomization: true,
    canAccessTips: true,
    canAccessRoomService: true,
    canAccessDelivery: true,
    canAccessAIAnalytics: true,
  },
  enterprise: {
    maxVenues: 999,
    maxAdmins: 999,
    maxStaff: 999,
    maxMenus: 99,
    maxItems: 9999,
    maxCategories: 999,
    canAccessPOS: true,
    canAccessKDS: true,
    canAccessTables: true,
    canAccessService: true,
    canAccessInventory: true,
    canAccessRecipes: true,
    canAccessSuppliers: true,
    canAccessMultiCurrency: true,
    canAccessReports: true,
    canAccessTeamManagement: true,
    canAccessQrCustomization: true,
    canAccessTips: true,
    canAccessRoomService: true,
    canAccessDelivery: true,
    canAccessAIAnalytics: true,
  },
};

// --- Human-readable plan names ---

export const PLAN_NAMES: Record<SubscriptionPlan, string> = {
  starter: 'Starter',
  pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
};

// --- Helper Functions ---

/**
 * Check if a trial period is still active
 */
export function isTrialActive(
  status?: SubscriptionStatus | null,
  trialEndsAt?: string | null,
): boolean {
  if (status !== 'trial') return false;
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt) > new Date();
}

/**
 * Get the effective plan (trial users get Pro access)
 */
export function getEffectivePlan(
  plan?: SubscriptionPlan | null,
  status?: SubscriptionStatus | null,
  trialEndsAt?: string | null,
): SubscriptionPlan {
  // During active trial - Pro access
  if (isTrialActive(status, trialEndsAt)) {
    return 'pro';
  }

  // Cancelled/paused - still use their last plan (grace period)
  // past_due - still use their plan (Stripe handles retries)
  // Fallback to 'starter' if plan is missing or not recognized
  return plan && plan in PLAN_LIMITS ? plan : 'starter';
}

/**
 * Get plan limits for a tenant (considering trial status)
 */
export function getPlanLimits(
  plan?: SubscriptionPlan | null,
  status?: SubscriptionStatus | null,
  trialEndsAt?: string | null,
): PlanLimits {
  const effectivePlan = getEffectivePlan(plan, status, trialEndsAt);
  return PLAN_LIMITS[effectivePlan];
}

/**
 * Check if a specific boolean feature is accessible
 */
export function canAccessFeature(
  feature: keyof Pick<
    PlanLimits,
    | 'canAccessPOS'
    | 'canAccessKDS'
    | 'canAccessTables'
    | 'canAccessService'
    | 'canAccessInventory'
    | 'canAccessRecipes'
    | 'canAccessSuppliers'
    | 'canAccessMultiCurrency'
    | 'canAccessReports'
    | 'canAccessTeamManagement'
    | 'canAccessQrCustomization'
    | 'canAccessTips'
    | 'canAccessRoomService'
    | 'canAccessDelivery'
    | 'canAccessAIAnalytics'
  >,
  plan?: SubscriptionPlan | null,
  status?: SubscriptionStatus | null,
  trialEndsAt?: string | null,
): boolean {
  const limits = getPlanLimits(plan, status, trialEndsAt);
  return limits[feature] as boolean;
}

/**
 * Check if a numeric limit has been reached
 */
export function hasReachedLimit(
  limitKey: 'maxVenues' | 'maxAdmins' | 'maxStaff' | 'maxMenus' | 'maxItems' | 'maxCategories',
  currentCount: number,
  plan?: SubscriptionPlan | null,
  status?: SubscriptionStatus | null,
  trialEndsAt?: string | null,
): boolean {
  const limits = getPlanLimits(plan, status, trialEndsAt);
  return currentCount >= limits[limitKey];
}

/**
 * Calculate days remaining in trial
 */
export function getTrialDaysRemaining(trialEndsAt?: string | null): number {
  if (!trialEndsAt) return 0;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Check if subscription is in a valid/usable state
 */
export function isSubscriptionUsable(status?: SubscriptionStatus | null): boolean {
  if (!status) return false;
  return ['trial', 'active', 'past_due'].includes(status);
}
