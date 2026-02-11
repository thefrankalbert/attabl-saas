/**
 * Feature Gating — Centralized plan limits & access control
 *
 * This is the SINGLE SOURCE OF TRUTH for what each plan can do.
 * Used by both server-side checks and client-side SubscriptionContext.
 */

import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

// ─── Plan Limits Definition ─────────────────────────────

export interface PlanLimits {
  // Quantitative limits
  maxAdmins: number;
  maxVenues: number;
  maxMenus: number;
  maxItems: number;
  maxSounds: number;
  // Feature flags
  customSoundUpload: boolean;
  advancedStats: boolean;
  whatsappSupport: boolean;
  tableOrdering: boolean;
  qrCodes: boolean;
  realtimeKDS: boolean;
  customBranding: boolean;
  multiLanguage: boolean;
  // QR Customizer flags
  qrCustomColors: boolean;
  qrLogoEmbed: boolean;
  qrCustomCTA: boolean;
  qrSizeAdjust: boolean;
  qrPremiumTemplates: boolean;
  qrAdvancedExport: boolean;
  qrEnterpriseDesign: boolean;
  // Inventory flags
  inventoryTracking: boolean;
  maxIngredients: number;
  ruptureWorkflow: boolean;
  patronDashboard: boolean;
  stockAlerts: boolean;
  waiterSuggestions: boolean;
}

export type FeatureKey = keyof PlanLimits;

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  essentiel: {
    maxAdmins: 2,
    maxVenues: 1,
    maxMenus: 2,
    maxItems: 100,
    maxSounds: 3,
    customSoundUpload: false,
    advancedStats: false,
    whatsappSupport: false,
    tableOrdering: true,
    qrCodes: true,
    realtimeKDS: true,
    customBranding: true,
    multiLanguage: false,
    qrCustomColors: false,
    qrLogoEmbed: false,
    qrCustomCTA: false,
    qrSizeAdjust: false,
    qrPremiumTemplates: false,
    qrAdvancedExport: false,
    qrEnterpriseDesign: false,
    inventoryTracking: false,
    maxIngredients: 0,
    ruptureWorkflow: false,
    patronDashboard: false,
    stockAlerts: false,
    waiterSuggestions: false,
  },
  premium: {
    maxAdmins: 5,
    maxVenues: 3,
    maxMenus: 10,
    maxItems: 500,
    maxSounds: 10,
    customSoundUpload: true,
    advancedStats: true,
    whatsappSupport: true,
    tableOrdering: true,
    qrCodes: true,
    realtimeKDS: true,
    customBranding: true,
    multiLanguage: true,
    qrCustomColors: true,
    qrLogoEmbed: true,
    qrCustomCTA: true,
    qrSizeAdjust: true,
    qrPremiumTemplates: true,
    qrAdvancedExport: true,
    qrEnterpriseDesign: false,
    inventoryTracking: true,
    maxIngredients: 200,
    ruptureWorkflow: true,
    patronDashboard: true,
    stockAlerts: false,
    waiterSuggestions: false,
  },
  enterprise: {
    maxAdmins: 99,
    maxVenues: 99,
    maxMenus: 99,
    maxItems: 9999,
    maxSounds: 10,
    customSoundUpload: true,
    advancedStats: true,
    whatsappSupport: true,
    tableOrdering: true,
    qrCodes: true,
    realtimeKDS: true,
    customBranding: true,
    multiLanguage: true,
    qrCustomColors: true,
    qrLogoEmbed: true,
    qrCustomCTA: true,
    qrSizeAdjust: true,
    qrPremiumTemplates: true,
    qrAdvancedExport: true,
    qrEnterpriseDesign: true,
    inventoryTracking: true,
    maxIngredients: 9999,
    ruptureWorkflow: true,
    patronDashboard: true,
    stockAlerts: true,
    waiterSuggestions: true,
  },
};

// ─── Human-readable plan names ──────────────────────────

export const PLAN_NAMES: Record<SubscriptionPlan, string> = {
  essentiel: 'Essentiel',
  premium: 'Premium',
  enterprise: 'Enterprise',
};

// ─── Helper Functions ───────────────────────────────────

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
 * Get the effective plan (trial users get Premium access)
 */
export function getEffectivePlan(
  plan?: SubscriptionPlan | null,
  status?: SubscriptionStatus | null,
  trialEndsAt?: string | null,
): SubscriptionPlan {
  // During active trial → Premium access
  if (isTrialActive(status, trialEndsAt)) {
    return 'premium';
  }

  // Cancelled/paused → still use their last plan (grace period)
  // past_due → still use their plan (Stripe handles retries)
  return plan || 'essentiel';
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
    | 'customSoundUpload'
    | 'advancedStats'
    | 'whatsappSupport'
    | 'tableOrdering'
    | 'qrCodes'
    | 'realtimeKDS'
    | 'customBranding'
    | 'multiLanguage'
    | 'qrCustomColors'
    | 'qrLogoEmbed'
    | 'qrCustomCTA'
    | 'qrSizeAdjust'
    | 'qrPremiumTemplates'
    | 'qrAdvancedExport'
    | 'qrEnterpriseDesign'
    | 'inventoryTracking'
    | 'ruptureWorkflow'
    | 'patronDashboard'
    | 'stockAlerts'
    | 'waiterSuggestions'
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
  limitKey: 'maxAdmins' | 'maxVenues' | 'maxMenus' | 'maxItems' | 'maxSounds' | 'maxIngredients',
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
