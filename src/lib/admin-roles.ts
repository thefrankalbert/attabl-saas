import type { PermissionRequirement } from '@/lib/permissions';
import type { PermissionCode } from '@/types/permission.types';

/**
 * Autorite d'argent du lot 1 : rembourser, offrir, supprimer une commande,
 * ouvrir ou solder une ardoise. Les QUATRE droits ensemble, comme la garde de
 * la base `has_tenant_money_permission`. Par defaut : proprietaire et gerant.
 * Donner un seul de ces droits a une personne n'ouvre pas le lot entier. Le
 * lot 3 decoupe par acte.
 */
export const MONEY_PERMISSIONS: readonly PermissionCode[] = [
  'orders.pay',
  'orders.refund',
  'orders.cancel',
  'orders.discount',
];

/** Voir les commandes : qui en prend, qui les prepare, qui les encaisse. */
export const ORDERS_VIEW: PermissionRequirement = {
  anyOf: ['orders.take', 'kitchen.track', 'orders.pay'],
};

/** Faire avancer une commande (note, envoi d'un service, servir) : salle ou cuisine. */
export const ORDERS_ADVANCE: PermissionRequirement = { anyOf: ['orders.take', 'kitchen.track'] };

/** Statuts poses par la cuisine ou le bar : "Suivre en cuisine" (`kitchen.track`). */
const KITCHEN_STATUSES: readonly string[] = ['preparing', 'ready'];

/**
 * Droit exige pour poser un statut sur une commande ou sur une ligne de
 * commande. Une seule regle pour l'action, l'interface et la base (declencheur
 * `garder_statut_cuisine`) :
 *   - `cancelled` : `orders.pay` (decision G.b.2, jusqu'au lot 3) ;
 *   - `preparing`, `ready` : `kitchen.track` (cahier des charges, section 5 :
 *     ni le caissier ni le serveur ne suivent en cuisine) ;
 *   - le reste (`pending`, `delivered`, `served`) : salle ou cuisine. Servir
 *     reste le geste du serveur, et l'ecran de cuisine garde son bouton
 *     "Termine" sur un ticket pret.
 */
export function orderStatusRequirement(status: string): PermissionRequirement {
  if (status === 'cancelled') return 'orders.pay';
  if (KITCHEN_STATUSES.includes(status)) return 'kitchen.track';
  return ORDERS_ADVANCE;
}

/** Voir l'abonnement et les factures : le niveau borne du gerant suffit. */
export const BILLING_READ: PermissionRequirement = { atLeastLimited: 'billing.manage' };

/** Creer un plat ou importer une carte fixe aussi des prix : les deux droits. */
export const MENU_WITH_PRICE: readonly PermissionCode[] = ['menu.edit', 'menu.price'];

/**
 * Postes de service en salle : une commande saisie a la caisse par l'un d'eux
 * lui est affectee d'office (il sert la table).
 */
export const SERVICE_POSTES = ['waiter', 'bartender', 'crew'] as const;
