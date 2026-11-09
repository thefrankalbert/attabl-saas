import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { AuthError } from '@/lib/auth/get-session';
import { logger } from '@/lib/logger';
import {
  TENANT_LOCK_COLUMNS,
  isLockedOnlyByLapsedTrial,
  kitchenMayFinishOrder,
  tenantLockReason,
  type TenantLockRow,
} from './tenant-lock';

/**
 * Refus parce que le restaurant est coupe, et non parce que l'employe manque
 * d'une permission. Sous-classe d'`AuthError`, donc deja attrapee par les
 * `catch (err) { if (err instanceof AuthError) ... }` existants; le type
 * distinct sert aux appelants qui traduisent les erreurs de permission en un
 * message generique et doivent laisser passer celui-ci ("Permissions
 * insuffisantes" serait faux et enverrait le restaurateur chercher un droit
 * manquant au lieu de sa facture).
 */
export class TenantLockedError extends AuthError {
  constructor(message = 'Ce restaurant est temporairement indisponible') {
    super(message, 403);
    this.name = 'TenantLockedError';
  }
}

/**
 * Ce restaurant peut-il encore servir ? Sinon, la mutation est refusee.
 *
 * POURQUOI CETTE FONCTION EXISTE. Une Server Action est un endpoint POST
 * adressable par son Action ID, et surtout: trois composants de l'interface
 * admin appellent les actions d'argent EN DIRECT, sans passer par
 * `/api/orders/mutations` (OrderPaymentPanel -> actionRecordTender et
 * actionRefundOrder, CompOrderDialog -> actionCompOrder). Gater la route ne
 * gate donc pas ces chemins, exactement comme gater la page ne gate pas la
 * mutation (meme lecon que `isFeatureEntitled`).
 *
 * CETTE GARDE RESTE NECESSAIRE MEME DEPUIS QUE LE PROXY COUVRE TOUS LES
 * STATUTS. Le middleware refuse desormais aussi `cancelled` et `paused`, parce
 * que `is_active` suit le statut a chaque ecriture et que la contrainte
 * `tenants_abonnement_inutilisable_implique_inactif` l'impose en base. Mais un
 * middleware garde des REQUETES DE PAGE: il ne voit pas un POST d'Action ID
 * emis par un onglet deja ouvert, ni un appel reconstruit a la main. La regle
 * ne change pas: gater la route ne gate pas l'action, gater la page ne gate pas
 * la mutation. C'est cette fonction qui garde la mutation.
 *
 * ELLE ECHOUE FERMEE. Ligne absente, tenant supprime, erreur de lecture: on
 * refuse. Une coupure qui s'ouvre sur une panne de lecture ne coupe rien.
 *
 * A APPELER DANS LES ECRITURES DE SERVICE uniquement (encaisser, rembourser,
 * offrir, solder, changer un statut, annoter), jamais dans les lectures: un
 * restaurant coupe doit continuer a consulter ses donnees et a atteindre sa
 * page d'abonnement pour payer. Couper la lecture, c'est l'empecher de
 * redevenir client.
 *
 * LECTURE EN service_role, et pas avec le client de l'appelant: la regle de
 * l'essai expire lit `stripe_subscription_id`, colonne que `authenticated` ne
 * peut pas lire (42501, donc refus de TOUTES les mutations). La lecture est
 * bornee a la ligne du restaurant dont l'appelant a deja prouve etre membre
 * (`getAuthenticatedUserForTenant` passe avant), et n'en rend que le verdict.
 *
 * @throws {TenantLockedError} 403 si le restaurant est coupe ou illisible.
 */
export async function assertTenantServing(
  tenantId: string,
  supabase: SupabaseClient = createAdminClient(),
): Promise<void> {
  const tenant = await readLockRow(tenantId, supabase);
  const reason = tenantLockReason(tenant);
  if (reason) {
    logger.warn('Mutation refusee: restaurant coupe', { tenantId, reason });
    throw new TenantLockedError();
  }
}

/**
 * `assertTenantServing` pour les gestes de CUISINE sur une commande (statut,
 * statut d'article, envoi d'un plat tenu, annulation), avec la seule exception
 * de la decision produit du 2026-11-09: a la fin d'un essai sans abonnement, la
 * cuisine finit les commandes creees AVANT `trial_ends_at` (`kitchenMayFinishOrder`).
 *
 * A NE PAS appeler pour encaisser, rembourser, offrir, solder ou annoter:
 * ces chemins restent sur `assertTenantServing`, sans exception.
 *
 * La commande est relue ICI, en service_role et bornee a `tenantId`: la date
 * de creation ne vient jamais du client. Commande introuvable, d'un autre
 * restaurant ou lecture en echec: refus, comme le reste de la garde.
 *
 * Rend `true` quand le geste passe AU TITRE de cette exception (restaurant
 * coupe), `false` quand le restaurant sert normalement. L'annulation s'en sert:
 * le stock deduit pendant l'essai doit revenir meme si le plan stocke n'a pas
 * le module stock.
 *
 * @throws {TenantLockedError} 403 si le restaurant est coupe et que l'exception ne s'applique pas.
 */
export async function assertTenantServingForKitchen(
  tenantId: string,
  orderId: string,
  supabase: SupabaseClient = createAdminClient(),
): Promise<boolean> {
  const tenant = await readLockRow(tenantId, supabase);
  const reason = tenantLockReason(tenant);
  if (!reason) return false;

  if (isLockedOnlyByLapsedTrial(tenant)) {
    const { data: order, error } = await supabase
      .from('orders')
      .select('created_at')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!error && order && kitchenMayFinishOrder(tenant, order.created_at as string)) return true;
  }

  logger.warn('Geste cuisine refuse: restaurant coupe', { tenantId, orderId, reason });
  throw new TenantLockedError();
}

/** La ligne de verrou du restaurant, ou un refus (echec ferme). */
async function readLockRow(tenantId: string, supabase: SupabaseClient): Promise<TenantLockRow> {
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select(TENANT_LOCK_COLUMNS)
    .eq('id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !tenant) {
    logger.warn('Mutation refusee: restaurant illisible', { tenantId });
    throw new TenantLockedError();
  }
  return tenant;
}
