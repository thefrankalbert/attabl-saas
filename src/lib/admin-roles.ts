import type { AdminRole } from '@/types/admin/enums.types';
import type { PermissionCode } from '@/types/permission.types';

export const ONBOARDING_COMPLETE_ROLES = ['owner'] as const;

export const ASSIGNMENT_MANAGER_ROLES = ['owner', 'admin', 'manager'] as const;

/**
 * Garde grossiere "neutre": TOUS les roles du produit. A passer a
 * `getAuthenticatedUserForTenant` quand c'est la permission fine qui doit
 * decider seule (menu.edit, inventory.edit, orders.manage, orders.pay...).
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
 * Meme defaut corrige ensuite sur le catalogue, le stock, les tables, les
 * fournisseurs et le marketing: une liste ['owner','admin','manager'] posee
 * AVANT `menu.edit` ou `inventory.edit` annulait le droit que le proprietaire
 * accordait a un chef dans /settings/permissions (les imports, qui ne portaient
 * que la permission, l'acceptaient, l'action d'a cote le refusait).
 *
 * Encaisser releve de `orders.pay`, pas de cette liste. Rembourser et offrir
 * relevent en plus de ORDER_MONEY_ROLES.
 */
export const ALL_ADMIN_ROLES: AdminRole[] = [
  'owner',
  'admin',
  'manager',
  'cashier',
  'chef',
  'waiter',
];

/**
 * Garde des actions qui SORTENT ou EFFACENT de l'argent: remboursement, offert
 * (comp), ouverture et solde d'un compte maison (ardoise).
 *
 * S'ajoute a `orders.pay` (encaisser), que le caissier detient aussi. Laisser
 * un caissier mettre une note a zero ou rembourser est une surface de fraude:
 * ces actions restent au gerant et au-dessus. Restriction voulue, pas un oubli
 * de la matrice. Le serveur et le chef n'ont ni l'un ni l'autre (decision du
 * proprietaire du 2026-11-09: aucune operation d'argent).
 */
export const ORDER_MONEY_ROLES: AdminRole[] = ['owner', 'admin', 'manager'];

/**
 * Permissions exigees pour ENCAISSER ou deplacer de l'argent sur une commande:
 * paiement, tender, ardoise, annulation. `orders.pay` est le droit d'argent
 * (le serveur et le chef ne l'ont pas par defaut); `orders.manage` reste exige
 * parce que la base n'autorise la modification d'une commande qu'avec lui. Les
 * deux ensemble donnent un refus net cote application au lieu d'une erreur de
 * base au milieu d'un encaissement.
 */
export const ORDER_PAY_PERMISSIONS: readonly PermissionCode[] = ['orders.manage', 'orders.pay'];

export function isRoleAllowed(role: string, allowed: readonly string[]): boolean {
  return allowed.includes(role);
}
