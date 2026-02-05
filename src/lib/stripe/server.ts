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

// Montants en FCFA (pour affichage client)
export const PLAN_AMOUNTS = {
  essentiel: {
    monthly: 75000,
    yearly: 60000, // Par mois (720k/an)
  },
  premium: {
    monthly: 150000,
    yearly: 120000, // Par mois (1.44M/an)
  },
};

// Conversion FCFA → USD (pour Stripe)
// 1 USD ≈ 600 FCFA
export const PLAN_AMOUNTS_USD = {
  essentiel: {
    monthly: 125, // 75k FCFA
    yearly: 100, // 60k FCFA/mois
  },
  premium: {
    monthly: 250, // 150k FCFA
    yearly: 200, // 120k FCFA/mois
  },
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
