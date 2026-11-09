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
 * LA DIVERGENCE AVEC LE PROXY EST FERMEE, et par la base plutot que par une
 * seconde liste de statuts. `isTenantAccessLocked` dans `src/proxy.ts` ne lit
 * litteralement que `frozen`, `is_active = false` et `suspended_at` - mais
 * `is_active` suit desormais le statut A CHAQUE ECRITURE
 * (`isActiveUnlessLocked`, qui delegue a `isSubscriptionUsable`), et la
 * contrainte `tenants_abonnement_inutilisable_implique_inactif` (migration
 * 20261107140000) l'impose en base pour TOUS les statuts non entitlants. Un
 * restaurant `cancelled` ou `paused` porte donc `is_active = false`, et le
 * proxy le refuse par ce verrou-la. Mesure en production le 2026-11-07: zero
 * ligne ouvrable sans abonnement utilisable. `src/proxy.ts` n'a pas eu besoin
 * d'etre touche, ce qui est preferable: c'est un fichier protege.
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
 *
 * L'ESSAI EXPIRE EST UN QUATRIEME VERROU (audit du 2026-11-09). Seul le cron
 * `freeze-expired-trials` le posait, une fois par jour (02:00): entre
 * `trial_ends_at` et son passage, jusqu'a 24 h de service gratuit - commande
 * convive acceptee, aucune banniere. La regle est maintenant jugee ICI, au
 * moment ou l'essai expire, avec EXACTEMENT la condition du cron: statut
 * `trial`, `trial_ends_at` passe, et aucun `stripe_subscription_id`. Cette
 * derniere clause n'est pas decorative: le checkout ouvre un essai Stripe de
 * `ceil(jours restants)`, qui finit donc jusqu'a 24 h APRES `trial_ends_at`.
 * Sans elle, on couperait un client qui vient de souscrire.
 *
 * `stripe_subscription_id` n'est PAS lisible par `authenticated` (droits par
 * colonne, voir supabase/tests/rls/tenants_column_grants.test.sql): toute
 * lecture de `TENANT_LOCK_COLUMNS` passe donc par le client service_role. Un
 * client `authenticated` recevrait 42501, et la garde, qui echoue fermee,
 * couperait tout le monde.
 */

/** Les colonnes a lire pour pouvoir juger. A coller dans le `.select()`. */
export const TENANT_LOCK_COLUMNS =
  'is_active, suspended_at, subscription_status, trial_ends_at, stripe_subscription_id' as const;

export interface TenantLockRow {
  is_active?: boolean | null;
  suspended_at?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  stripe_subscription_id?: string | null;
}

/**
 * L'essai est-il expire sans abonnement ? La condition du cron
 * `freeze-expired-trials`, mot pour mot: ce que le cron gelera a 02:00 est
 * coupe des maintenant.
 *
 * Une colonne `stripe_subscription_id` absente de la ligne compte comme "pas
 * d'abonnement": un `.select()` qui l'oublie doit refuser, pas ouvrir.
 */
export function isTrialLapsed(tenant: TenantLockRow, now: number = Date.now()): boolean {
  if (tenant.subscription_status !== 'trial' || !tenant.trial_ends_at) return false;
  if (tenant.stripe_subscription_id) return false;
  return new Date(tenant.trial_ends_at).getTime() < now;
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
export function tenantLockReason(
  tenant: TenantLockRow,
  now: number = Date.now(),
): TenantLockReason | null {
  if (!tenant.is_active) return 'inactive';
  if (tenant.suspended_at) return 'suspended';
  if (!isSubscriptionUsable(tenant.subscription_status as SubscriptionStatus | null)) {
    return 'subscription';
  }
  if (isTrialLapsed(tenant, now)) return 'subscription';
  return null;
}

/** Le restaurant peut-il servir ? Raccourci pour les appelants sans besoin de cause. */
export function isTenantServing(tenant: TenantLockRow, now: number = Date.now()): boolean {
  return tenantLockReason(tenant, now) === null;
}
