/**
 * Ce qu'ATTABL attend d'un prestataire d'encaissement, exprime dans SES termes.
 *
 * POURQUOI CE FICHIER EXISTE. Stripe n'ouvre pas de compte marchand au Burkina
 * Faso (verifie le 2026-11-05: l'Afrique s'arrete a l'Afrique du Sud en direct,
 * et a GH/KE/NG/ZA/CI via Paystack). Un prestataire local - Flutterwave,
 * Ligdicash, PayDunya, CinetPay - devra donc encaisser a cote de Stripe, pas a
 * sa place: Stripe reste le rail carte et international.
 *
 * LE FAIT QUI COMMANDE CETTE INTERFACE. Le mobile money n'a PAS de prelevement
 * automatique: le client approuve CHAQUE paiement sur son telephone. Il n'existe
 * sur Orange Money ni Moov aucun mandat pre-autorise equivalent a une carte
 * enregistree. Deux consequences, et c'est pour elles que cette interface ne
 * copie pas la forme de l'API Stripe:
 *
 *   1. `autoRenew` est une CAPACITE, pas une evidence. Sans elle, c'est ATTABL
 *      qui porte l'horloge: a chaque echeance on demande le paiement, et on gele
 *      si la periode n'est pas reglee. Les colonnes necessaires existent deja
 *      (`subscription_current_period_end`, `past_due_since`, `freeze_reason`) et
 *      le cron `freeze-expired-trials` fait deja ce geste.
 *   2. `hostedPortal` est une CAPACITE. Stripe heberge une page de gestion
 *      d'abonnement; un agregateur mobile money, non. L'interface le dit, pour
 *      que l'application cesse de proposer un bouton qui ne menerait nulle part,
 *      au lieu de le decouvrir en production.
 *
 * CE QUI N'EST PAS ICI, VOLONTAIREMENT. Les six routes d'encaissement
 * (create-checkout-session, create-embedded-checkout, verify-checkout,
 * billing-portal, update-subscription, invoices) ne passent PAS encore par cette
 * interface. Une interface qui n'a qu'une seule implementation est une
 * supposition: c'est la DEUXIEME implementation qui dira si celle-ci a la bonne
 * forme. Reecrire six chemins d'argent sur une supposition, c'est prendre un
 * risque sur la seule partie du produit qui ne doit jamais casser. On les
 * basculera quand le prestataire sera choisi et son API connue.
 *
 * CE QUI EST DEJA PRET, ET MESURE. L'entitlement (`lib/plans/features.ts`) ne
 * contient aucune dependance a Stripe: il derive tout de `subscription_status`,
 * `subscription_plan` et `trial_ends_at`. Autrement dit, "qui a droit a quoi" ne
 * change pas d'un prestataire a l'autre. Seule la collecte d'argent change.
 */

/** Prestataires d'encaissement envisages. `manual` = activation a la main. */
export type BillingProviderId = 'stripe' | 'manual';

export interface BillingCapabilities {
  /**
   * Le prestataire sait-il se faire payer tout seul a chaque echeance ?
   * FAUX pour tout mobile money: le client doit approuver chaque paiement.
   * Quand c'est faux, l'horloge de periode est portee par ATTABL.
   */
  autoRenew: boolean;
  /**
   * Le prestataire heberge-t-il une page ou le client gere son abonnement ?
   * Faux pour un agregateur mobile money: c'est a ATTABL d'afficher la page.
   */
  hostedPortal: boolean;
  /**
   * Le prestataire tient-il l'historique des factures ?
   * Faux pour un agregateur: les recus viennent alors de nos propres lignes.
   */
  providerInvoices: boolean;
}

const CAPABILITIES: Record<BillingProviderId, BillingCapabilities> = {
  stripe: { autoRenew: true, hostedPortal: true, providerInvoices: true },
  manual: { autoRenew: false, hostedPortal: false, providerInvoices: false },
};

/**
 * Le prestataire actif. UN SEUL endroit le declare, pour qu'en ajouter un ne
 * demande pas de retrouver des suppositions eparpillees dans l'application.
 */
export const ACTIVE_BILLING_PROVIDER: BillingProviderId = 'stripe';

export function billingCapabilities(
  id: BillingProviderId = ACTIVE_BILLING_PROVIDER,
): BillingCapabilities {
  return CAPABILITIES[id];
}
