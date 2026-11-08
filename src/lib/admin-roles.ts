import type { AdminRole } from '@/types/admin/enums.types';

export const ONBOARDING_COMPLETE_ROLES = ['owner'] as const;

export const ASSIGNMENT_MANAGER_ROLES = ['owner', 'admin', 'manager'] as const;

/**
 * Garde grossiere des actions de commande: TOUS les roles du produit.
 *
 * POURQUOI CETTE CONSTANTE EXISTE. Onze actions de commande portaient la liste
 * ecrite a la main `['owner', 'admin', 'manager', 'server']`. Le role 'server'
 * N'EXISTE PAS: l'enum du produit nomme le serveur `waiter` (voir AdminRole).
 * La liste etait donc fausse de deux facons a la fois:
 *
 *   - 'server' ne correspondait a aucun role, donc ne laissait entrer personne;
 *   - et surtout la garde grossiere passe AVANT la permission fine dans
 *     `getAuthenticatedUserForTenant`, si bien que `cashier` et `chef` - qui
 *     detiennent pourtant `orders.manage` par defaut - etaient refuses en 403
 *     avant meme que leur permission soit consultee. La caisse ne pouvait pas
 *     faire avancer une commande.
 *
 * La permission fine `orders.manage` EST la regle: elle est resolue en trois
 * niveaux (surcharge individuelle -> surcharge de role du tenant -> matrice par
 * defaut), donc elle sait des choses que cette liste ne peut pas savoir, comme
 * une surcharge de tenant qui accorde `orders.manage` a un serveur. Une liste
 * grossiere plus etroite que la matrice ANNULE ces surcharges en silence.
 * Lister les six roles rend la garde grossiere volontairement inoffensive et
 * laisse `orders.manage` decider seule.
 *
 * A ne pas utiliser pour une action qui engage de l'argent: voir
 * ORDER_MONEY_ROLES.
 */
export const ORDER_STAFF_ROLES: AdminRole[] = [
  'owner',
  'admin',
  'manager',
  'cashier',
  'chef',
  'waiter',
];

/**
 * Garde des actions de commande qui ENGAGENT DE L'ARGENT: remboursement, offert
 * (comp), ouverture et solde d'un compte maison.
 *
 * Deliberement PLUS ETROITE que `orders.manage`, que `cashier` et `chef`
 * detiennent aussi. Laisser un caissier annuler une note a zero ou rembourser
 * est une surface de fraude: ces actions restent au gerant et au-dessus. Cette
 * restriction est voulue, ce n'est pas un oubli de la matrice.
 */
export const ORDER_MONEY_ROLES: AdminRole[] = ['owner', 'admin', 'manager'];

export function isRoleAllowed(role: string, allowed: readonly string[]): boolean {
  return allowed.includes(role);
}
