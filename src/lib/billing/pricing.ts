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

// Montant mensuel AFFICHE (le semestriel et l'annuel montrent l'equivalent par mois)
export const PLAN_AMOUNTS: Record<
  Exclude<SubscriptionPlan, 'enterprise'>,
  Record<BillingInterval, number>
> = {
  starter: { monthly: 39000, semiannual: 33150, yearly: 31200 },
  pro: { monthly: 79000, semiannual: 67150, yearly: 63200 },
  business: { monthly: 149000, semiannual: 126650, yearly: 119200 },
};

// Montant TOTAL reellement facture pour la periode
export const PLAN_TOTALS: Record<
  Exclude<SubscriptionPlan, 'enterprise'>,
  Record<BillingInterval, number>
> = {
  starter: { monthly: 39000, semiannual: 198900, yearly: 374400 },
  pro: { monthly: 79000, semiannual: 402900, yearly: 758400 },
  business: { monthly: 149000, semiannual: 759900, yearly: 1430400 },
};
