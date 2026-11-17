/**
 * Catalogue de prix ATTABL - importable depuis un composant client ET serveur.
 *
 * Ce fichier vivait dans `lib/stripe/`, et c'etait une erreur de rangement: il
 * n'importe pas le SDK Stripe et ne contient rien de propre a Stripe. Ce sont
 * TES prix. Range ici, les quatre composants d'affichage qui l'importent ne
 * dependent plus, meme nominalement, d'un prestataire de paiement.
 *
 * Le client Stripe et la cle secrete restent dans `lib/stripe/server.ts`
 * (server-only).
 *
 * Montants en XAF. XOF/XAF sont des devises sans decimale: ces nombres sont
 * donc des unites entieres, pas des centimes.
 */
import type { SubscriptionPlan, BillingInterval } from '@/types/billing';

// Montant mensuel AFFICHE (l'annuel montre l'equivalent par mois)
export const PLAN_AMOUNTS: Record<
  Exclude<SubscriptionPlan, 'enterprise'>,
  Record<BillingInterval, number>
> = {
  starter: { monthly: 39000, yearly: 33000 },
  pro: { monthly: 79000, yearly: 67000 },
  business: { monthly: 149000, yearly: 127000 },
};

// Montant TOTAL reellement facture pour la periode
export const PLAN_TOTALS: Record<
  Exclude<SubscriptionPlan, 'enterprise'>,
  Record<BillingInterval, number>
> = {
  starter: { monthly: 39000, yearly: 396000 },
  pro: { monthly: 79000, yearly: 804000 },
  business: { monthly: 149000, yearly: 1524000 },
};
