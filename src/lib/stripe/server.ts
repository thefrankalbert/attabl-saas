import Stripe from 'stripe';

// Client Stripe côté serveur
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Prix des plans (Price IDs Stripe)
export const STRIPE_PRICES = {
  essentiel: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_ESSENTIEL!,
    yearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_ESSENTIEL_YEARLY!,
  },
  premium: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM!,
    yearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_YEARLY!,
  },
};

// Montants en FCFA (pour affichage client) - Alignés avec landing page
export const PLAN_AMOUNTS = {
  essentiel: {
    monthly: 39800,
    yearly: 33830, // Par mois (405,960 FCFA/an) - 15% de réduction
  },
  premium: {
    monthly: 79800,
    yearly: 67830, // Par mois (813,960 FCFA/an) - 15% de réduction
  },
};

// Montants annuels totaux en FCFA
export const PLAN_AMOUNTS_YEARLY_TOTAL = {
  essentiel: 405960, // 33,830 × 12
  premium: 813960,   // 67,830 × 12
};

// Helper pour obtenir le Price ID correct
export function getStripePriceId(
  plan: 'essentiel' | 'premium',
  interval: 'monthly' | 'yearly'
): string {
  return STRIPE_PRICES[plan][interval];
}

// Helper pour obtenir le montant en FCFA
export function getPlanAmount(
  plan: 'essentiel' | 'premium',
  interval: 'monthly' | 'yearly'
): number {
  return PLAN_AMOUNTS[plan][interval];
}
