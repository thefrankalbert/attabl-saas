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

/** Faire avancer une commande (statut, note, envoi d'un service) : salle ou cuisine. */
export const ORDERS_ADVANCE: PermissionRequirement = { anyOf: ['orders.take', 'kitchen.track'] };

/** Voir l'abonnement et les factures : le niveau borne du gerant suffit. */
export const BILLING_READ: PermissionRequirement = { atLeastLimited: 'billing.manage' };

/** Creer un plat ou importer une carte fixe aussi des prix : les deux droits. */
export const MENU_WITH_PRICE: readonly PermissionCode[] = ['menu.edit', 'menu.price'];

/**
 * Postes de service en salle : une commande saisie a la caisse par l'un d'eux
 * lui est affectee d'office (il sert la table).
 */
export const SERVICE_POSTES = ['waiter', 'bartender', 'crew'] as const;
