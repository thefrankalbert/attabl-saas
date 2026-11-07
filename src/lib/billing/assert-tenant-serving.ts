import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthError } from '@/lib/auth/get-session';
import { logger } from '@/lib/logger';
import { TENANT_LOCK_COLUMNS, tenantLockReason } from './tenant-lock';

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
 * @throws {TenantLockedError} 403 si le restaurant est coupe ou illisible.
 */
export async function assertTenantServing(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<void> {
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

  const reason = tenantLockReason(tenant);
  if (reason) {
    logger.warn('Mutation refusee: restaurant coupe', { tenantId, reason });
    throw new TenantLockedError();
  }
}
