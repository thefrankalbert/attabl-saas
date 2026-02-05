// Types pour les plans et intervalles de facturation
export type SubscriptionPlan = 'essentiel' | 'premium' | 'enterprise';
export type BillingInterval = 'monthly' | 'yearly';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'paused';

// Type pour les requêtes de création de checkout
export interface CreateCheckoutRequest {
    plan: Exclude<SubscriptionPlan, 'enterprise'>; // Enterprise n'est pas disponible en self-service
    billingInterval?: BillingInterval;
    tenantId: string;
    email: string;
}

// Type pour les réponses de checkout
export interface CreateCheckoutResponse {
    sessionId: string;
    url: string;
}
