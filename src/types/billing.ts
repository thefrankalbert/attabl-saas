// Types pour les plans et intervalles de facturation
export type SubscriptionPlan = 'starter' | 'pro' | 'business' | 'enterprise';
export type BillingInterval = 'monthly' | 'semiannual' | 'yearly';
export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'paused'
  | 'frozen';
