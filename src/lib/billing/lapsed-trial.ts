import { logger } from '@/lib/logger';
import { getTenantBillingIds, type TenantBillingIds } from './tenant-billing-ids';
import { isTrialLapsed, type TenantLockRow } from './tenant-lock';

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
  loadBillingIds: (
    tenantId: string,
  ) => Promise<Pick<TenantBillingIds, 'stripe_subscription_id'> | null> = getTenantBillingIds,
  now: number = Date.now(),
): Promise<boolean> {
  if (!isTrialLapsed(row, now)) return false;
  try {
    const billing = await loadBillingIds(tenantId);
    return isTrialLapsed({ ...row, stripe_subscription_id: billing?.stripe_subscription_id }, now);
  } catch (err) {
    logger.warn('Billing ids unreadable, expired trial treated as lapsed', { err, tenantId });
    return true;
  }
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
