import { logger } from '@/lib/logger';
import { getTenantBillingIds, type TenantBillingIds } from './tenant-billing-ids';
import { isLockedOnlyByLapsedTrial, isTrialLapsed, type TenantLockRow } from './tenant-lock';
import {
  menuVisibleDaysLeft,
  storefrontAccess,
  type StorefrontAccess,
  type StorefrontAccessRow,
} from './storefront-access';

type LoadBillingIds = (
  tenantId: string,
) => Promise<Pick<TenantBillingIds, 'stripe_subscription_id'> | null>;

/**
 * L'essai expire, juge sur une ligne LUE PAR LE CLIENT DE SESSION (cache
 * `getTenant`/`getCachedTenant`), donc sans `stripe_subscription_id`: cette
 * colonne n'est lisible qu'en service_role.
 *
 * Le predicat reste `isTrialLapsed` (tenant-lock.ts), une seule definition,
 * appele deux fois:
 *   1. sur la ligne sans identifiant Stripe - le cas le plus large, gratuit.
 *      Un essai en cours, un restaurant abonne: aucune lecture de plus.
 *   2. seulement si (1) dit "expire", sur la meme ligne completee par
 *      `stripe_subscription_id` lu en service_role, comme `validateTenant` et
 *      `assertTenantServing`. Un client qui vient de souscrire n'est pas coupe.
 *
 * Une lecture en ECHEC compte comme "expire": c'est ce que font les gardes
 * serveur (elles refusent un restaurant illisible). Montrer l'inverse a
 * l'ecran annoncerait un service que la commande refusera.
 *
 * CONTRAT de `loadBillingIds` (par defaut `getTenantBillingIds`): lecture
 * service_role sans controle d'acces. L'appelant passe un `tenantId` qu'il a
 * resolu lui-meme cote serveur (membre verifie, ou slug injecte par le proxy),
 * jamais une valeur venue du client.
 */
export async function isTrialLapsedForTenant(
  tenantId: string,
  row: Pick<TenantLockRow, 'subscription_status' | 'trial_ends_at'>,
  loadBillingIds: LoadBillingIds = getTenantBillingIds,
  now: number = Date.now(),
): Promise<boolean> {
  return isTrialLapsed(await withBillingIdsIfLapsed(tenantId, row, loadBillingIds, now), now);
}

/**
 * La ligne completee par `stripe_subscription_id` (service_role), lu SEULEMENT
 * si elle dit "essai expire". Une lecture en echec ou un restaurant introuvable
 * donne `null`: compte comme "pas d'abonnement", comme les gardes serveur.
 */
async function withBillingIdsIfLapsed<R extends TenantLockRow>(
  tenantId: string,
  row: R,
  loadBillingIds: LoadBillingIds,
  now: number,
): Promise<R> {
  if (!isTrialLapsed(row, now)) return row;
  try {
    const billing = await loadBillingIds(tenantId);
    return { ...row, stripe_subscription_id: billing?.stripe_subscription_id ?? null };
  } catch (err) {
    logger.warn('Billing ids unreadable, expired trial treated as lapsed', { err, tenantId });
    return { ...row, stripe_subscription_id: null };
  }
}

/**
 * `storefrontAccess` (storefront-access.ts) sur une ligne lue sans
 * `stripe_subscription_id`: meme lecture service_role que
 * `isTrialLapsedForTenant`, dans le seul cas ou elle change la reponse.
 * Meme contrat d'appel: `tenantId` resolu cote serveur, jamais venu du client.
 */
export async function storefrontAccessForTenant(
  tenantId: string,
  row: StorefrontAccessRow,
  loadBillingIds: LoadBillingIds = getTenantBillingIds,
  now: number = Date.now(),
): Promise<StorefrontAccess> {
  return storefrontAccess(await withBillingIdsIfLapsed(tenantId, row, loadBillingIds, now), now);
}

/**
 * Jours pendant lesquels la carte reste visible, pour le bandeau admin: un
 * nombre seulement quand la vitrine est en lecture seule (fin d'essai, dans
 * les 7 jours), sinon `null` - un restaurant qui sert n'a pas de delai, et un
 * verrou d'une autre cause (suspension, litige, impaye...) n'a pas de grace.
 * Meme contrat d'appel que `storefrontAccessForTenant`.
 */
export async function menuVisibleDaysLeftForTenant(
  tenantId: string,
  row: StorefrontAccessRow,
  loadBillingIds?: LoadBillingIds,
  now: number = Date.now(),
): Promise<number | null> {
  if (!row.trial_ends_at) return null;
  const access = await storefrontAccessForTenant(tenantId, row, loadBillingIds, now);
  return access === 'read_only' ? menuVisibleDaysLeft(row.trial_ends_at, now) : null;
}

/**
 * Le statut a MONTRER dans l'admin: `frozen` pour un essai expire que le cron
 * de 02:00 n'a pas encore gele (c'est l'etat qu'il ecrira), sinon le statut
 * stocke. `frozen` declenche `FrozenBanner` et `LockedSubscriptionRedirect`.
 */
export async function resolveDisplayedSubscriptionStatus<S extends string | null | undefined>(
  tenantId: string,
  row: { subscription_status: S; trial_ends_at?: string | null },
  loadBillingIds?: Parameters<typeof isTrialLapsedForTenant>[2],
  now?: number,
): Promise<S | 'frozen'> {
  const lapsed = await isTrialLapsedForTenant(tenantId, row, loadBillingIds, now);
  return lapsed ? 'frozen' : row.subscription_status;
}

/**
 * La cuisine reste-t-elle ouverte pour FINIR les commandes d'avant la fin de
 * l'essai ? `isLockedOnlyByLapsedTrial` (tenant-lock.ts) sur une ligne lue sans
 * `stripe_subscription_id`, completee comme `isTrialLapsedForTenant`.
 * Decision produit du 2026-11-09. Ouvre seulement la PAGE cuisine: chaque geste
 * est ensuite juge commande par commande par `assertTenantServingForKitchen`.
 * Meme contrat d'appel que `isTrialLapsedForTenant`.
 */
export async function kitchenMayFinishForTenant(
  tenantId: string,
  row: TenantLockRow,
  loadBillingIds: LoadBillingIds = getTenantBillingIds,
  now: number = Date.now(),
): Promise<boolean> {
  return isLockedOnlyByLapsedTrial(
    await withBillingIdsIfLapsed(tenantId, row, loadBillingIds, now),
    now,
  );
}
