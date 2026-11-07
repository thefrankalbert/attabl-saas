import { isSubscriptionUsable } from '@/lib/plans/features';
import type { SubscriptionStatus } from '@/types/billing';

/**
 * L'acces d'un restaurant est-il coupe ? UNE seule definition.
 *
 * POURQUOI CE FICHIER EXISTE (audit du 2026-11-06)
 *
 * La regle etait ecrite quatre fois, et deux de ces copies ne disaient pas la
 * meme chose. Surtout, la CAISSE n'en portait aucune: `/api/orders/pos` lisait
 * bien `subscription_status`, mais seulement pour choisir les fonctionnalites
 * du plan - et un restaurant gele retombe sur `starter`, dont `canAccessPOS`
 * vaut `true`. Un restaurant gele, suspendu ou desactive continuait donc
 * d'encaisser: commande creee, `payment_status` passe a `paid`, ligne ecrite
 * dans `payments`, session de table soldee. Le canal CONVIVE etait pourtant
 * coupe correctement depuis F6/CTR7-1. C'etait le canal du PERSONNEL - celui
 * qui porte l'argent - qui ne l'etait pas.
 *
 * Le verrou du middleware ne pouvait pas rattraper ce trou: il ne garde que les
 * PAGES (`resolveAdminGate`), jamais `/api/*`.
 *
 * LES TROIS VERROUS SONT INDEPENDANTS, et c'est voulu:
 *   - `is_active`     : recalcule par le webhook Stripe a chaque evenement.
 *   - `suspended_at`  : decision du super-admin, que le webhook ne touche pas.
 *   - l'abonnement    : le cron de gel laissait `is_active = true`.
 * Aucun des trois ne se deduit des deux autres - une ligne peut porter
 * `is_active = true` ET `subscription_status = 'frozen'` (c'est ce que
 * `unsuspendTenant` produisait avant la contrainte du 2026-11-05).
 *
 * `deleted_at` reste un FILTRE DE REQUETE (`.is('deleted_at', null)`), pas une
 * raison rendue ici: un restaurant supprime doit repondre 404, pas 403.
 *
 * DIVERGENCE CONNUE, NON CORRIGEE ICI: `isTenantAccessLocked` dans
 * `src/proxy.ts` ne refuse que le statut `frozen`, la ou cette definition
 * refuse tout statut non utilisable (`cancelled`, `pending`, `paused`,
 * `unpaid`). Le proxy est donc plus permissif pour les PAGES du tableau de
 * bord, et `src/proxy.ts` est un fichier protege: l'aligner demande une
 * decision explicite.
 *
 * CETTE DIVERGENCE A COUTE CHER A SOUS-ESTIMER. Une premiere version de ce
 * commentaire affirmait "ce n'est pas une fuite d'argent, tous les chemins
 * d'ecriture passent par ce fichier". C'ETAIT FAUX: trois composants de
 * l'interface admin appellent les Server Actions d'argent EN DIRECT, sans
 * passer par `/api/orders/mutations` (OrderPaymentPanel -> actionRecordTender
 * et actionRefundOrder, CompOrderDialog -> actionCompOrder). Pour les cinq
 * statuts que le proxy laisse passer, l'argent bougeait donc encore. Ferme par
 * `assertTenantServing` (voir `assert-tenant-serving.ts`), appele dans les
 * ecritures de service des Server Actions.
 *
 * LA LECON, pour la prochaine garde: gater la route ne gate pas l'action, et
 * gater la page ne gate pas la mutation. Avant d'ecrire qu'un chemin est
 * couvert, chercher qui appelle la fonction, pas qui appelle la route.
 */

/** Les colonnes a lire pour pouvoir juger. A coller dans le `.select()`. */
export const TENANT_LOCK_COLUMNS = 'is_active, suspended_at, subscription_status' as const;

export interface TenantLockRow {
  is_active?: boolean | null;
  suspended_at?: string | null;
  subscription_status?: string | null;
}

/** Pourquoi l'acces est coupe. Chaque cause a sa propre reponse HTTP. */
export type TenantLockReason = 'inactive' | 'suspended' | 'subscription';

/**
 * La cause de la coupure, ou `null` si le restaurant peut servir.
 *
 * La ligne est OBLIGATOIRE: un appelant qui n'a pas trouve le restaurant doit
 * repondre 404 lui-meme. Accepter `null` ici ferait passer un restaurant
 * introuvable pour un restaurant qui sert - exactement le genre de verrou qui
 * s'ouvre en silence.
 *
 * L'ordre des tests est celui que `validateTenant` appliquait: il fixe la
 * reponse renvoyee quand plusieurs verrous sont poses en meme temps (le cas
 * courant), donc le changer changerait des codes HTTP observables.
 */
export function tenantLockReason(tenant: TenantLockRow): TenantLockReason | null {
  if (!tenant.is_active) return 'inactive';
  if (tenant.suspended_at) return 'suspended';
  if (!isSubscriptionUsable(tenant.subscription_status as SubscriptionStatus | null)) {
    return 'subscription';
  }
  return null;
}

/** Le restaurant peut-il servir ? Raccourci pour les appelants sans besoin de cause. */
export function isTenantServing(tenant: TenantLockRow): boolean {
  return tenantLockReason(tenant) === null;
}
