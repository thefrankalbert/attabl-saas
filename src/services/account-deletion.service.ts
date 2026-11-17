import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { ServiceError } from './errors';
import { createAssignmentService } from './assignment.service';

/**
 * Suppression de compte depuis l'application (Apple, guideline 5.1.1(v)).
 *
 * DEUX CHEMINS, PAS UN SEUL:
 *
 *   - le PROPRIETAIRE ferme son restaurant courant: `tenants.deleted_at` est
 *     pose, et la purge de conservation (`retention.service.ts`) anonymise le
 *     restaurant et efface les comptes de ses membres 30 jours plus tard. Ses
 *     AUTRES restaurants ne sont pas touches: seule la ligne du restaurant
 *     courant est mise a jour. N'importe quel proprietaire du restaurant peut le
 *     fermer (decision produit en attente de confirmation, annoncee a l'ecran).
 *   - un MEMBRE DU PERSONNEL supprime son COMPTE: toutes ses appartenances sont
 *     retirees et anonymisees tout de suite, puis son compte d'authentification
 *     est efface en douceur. Ce chemin ne depend d'aucun restaurant: il doit
 *     marcher depuis /unauthorized, seule page qu'atteint un membre d'un
 *     restaurant gele (le proxy renvoie tout vers /subscription, que le
 *     personnel ne peut pas ouvrir).
 *
 * CLIENT SERVICE_ROLE. Lire les identifiants Stripe, poser `tenants.deleted_at`
 * et effacer un compte exigent le service_role. Ce client ignore le RLS:
 * l'autorisation est la verification faite ICI, sur l'identifiant verifie par
 * `auth.getUser()` et le slug pose par le middleware. Rien ne vient du client.
 *
 * ORDRE DU PROPRIETAIRE: Stripe d'abord, la fermeture ensuite. L'ordre inverse
 * peut laisser un restaurant ferme qui continue d'etre facture, le pire etat
 * possible. Dans cet ordre, un echec Stripe laisse tout intact (on refuse), et
 * un echec de la fermeture apres l'annulation laisse un restaurant ouvert sans
 * abonnement: la personne reessaie, Stripe ne liste plus rien de vivant et la
 * fermeture passe. Chaque etape est idempotente, donc reessayer converge.
 */

interface StripeSubscriptionApi {
  subscriptions: {
    list(params: { customer: string; status: 'all'; limit: number }): Promise<{
      data: { id: string; status: string; metadata?: Record<string, string> | null }[];
    }>;
    cancel(subscriptionId: string): Promise<unknown>;
  };
}

interface AccountDeletionDeps {
  /** Client service_role. */
  admin: SupabaseClient;
  stripe: StripeSubscriptionApi;
}

interface CloseRestaurantInput {
  userId: string;
  tenantSlug: string;
  confirmation: string;
}

interface DeleteStaffAccountInput {
  userId: string;
  confirmation: string;
}

interface TenantRow {
  id: string;
  name: string;
  deleted_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

interface MembershipRow {
  id: string;
  tenant_id: string;
  role: string;
  is_active: boolean;
  is_super_admin: boolean | null;
  deleted_at: string | null;
  deleted_by: string | null;
  tenants: { deleted_at: string | null };
}

/** Mots acceptes pour confirmer le chemin du personnel, quelle que soit la langue. */
const STAFF_CONFIRMATION_WORDS = ['supprimer', 'delete'];

/** Statuts Stripe sans plus rien a facturer: rien a annuler. */
const STRIPE_DEAD_STATUSES = ['canceled', 'incomplete_expired'];

function normaliser(valeur: string): string {
  return valeur.trim().replace(/\s+/g, ' ').toLowerCase();
}

function estIntrouvableChezStripe(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'resource_missing'
  );
}

/**
 * Le compte d'authentification doit-il etre garde ? Meme predicat que
 * `closed_tenant_auth_users` (purge de conservation): un super administrateur
 * sur N'IMPORTE quelle ligne, sans regarder l'etat du restaurant ni la
 * suppression de la ligne, n'est jamais efface. (`tenant_id` est NOT NULL avec
 * cle etrangere: la jointure de `lireAppartenances` ne perd aucune ligne.)
 */
function isPlatformAccount(rows: { is_super_admin: boolean | null; role: string }[]): boolean {
  return rows.some((r) => r.is_super_admin === true || r.role === 'super_admin');
}

export function createAccountDeletionService({ admin, stripe }: AccountDeletionDeps) {
  async function lireRestaurant(tenantSlug: string): Promise<TenantRow> {
    // `deleted_at` n'est PAS filtre: un restaurant deja ferme doit etre trouve
    // pour qu'une seconde demande reponde "deja fait" au lieu d'une erreur.
    const { data, error } = await admin
      .from('tenants')
      .select('id, name, deleted_at, stripe_customer_id, stripe_subscription_id')
      .eq('slug', tenantSlug)
      .maybeSingle<TenantRow>();
    if (error) throw new ServiceError('Lecture du restaurant impossible', 'INTERNAL', error);
    if (!data) throw new ServiceError('Restaurant introuvable', 'NOT_FOUND');
    return data;
  }

  /** Toutes les lignes du compte, avec l'etat de leur restaurant. */
  async function lireAppartenances(userId: string): Promise<MembershipRow[]> {
    const { data, error } = await admin
      .from('admin_users')
      .select(
        'id, tenant_id, role, is_active, is_super_admin, deleted_at, deleted_by, tenants!inner(deleted_at)',
      )
      .eq('user_id', userId);
    if (error) throw new ServiceError('Lecture du compte impossible', 'INTERNAL', error);
    return (data ?? []) as unknown as MembershipRow[];
  }

  function echecStripe(err: unknown, tenantId: string): ServiceError {
    logger.error('Suppression de compte: annulation Stripe impossible, rien ferme', err, {
      tenantId,
    });
    return new ServiceError(
      "Impossible d'arreter l'abonnement pour le moment. Rien n'a ete supprime, reessayez.",
      'INTERNAL',
    );
  }

  /**
   * Annule TOUT abonnement encore vivant du client Stripe du restaurant, pas
   * seulement l'identifiant stocke: un second abonnement (double caisse,
   * identifiant perime) continuerait sinon a facturer un restaurant ferme.
   *
   * Defense en profondeur: un abonnement dont `metadata.tenant_id` (pose par
   * la caisse) designe un AUTRE restaurant n'est jamais annule, meme s'il est
   * rattache au meme client Stripe ou a l'identifiant stocke.
   */
  async function arreterFacturationStripe(tenant: TenantRow): Promise<void> {
    const ids = new Set<string>();
    const etrangers = new Set<string>();
    if (tenant.stripe_subscription_id) ids.add(tenant.stripe_subscription_id);

    if (tenant.stripe_customer_id) {
      try {
        const { data } = await stripe.subscriptions.list({
          customer: tenant.stripe_customer_id,
          status: 'all',
          limit: 100,
        });
        for (const sub of data) {
          const proprietaire = sub.metadata?.tenant_id;
          if (proprietaire && proprietaire !== tenant.id) {
            etrangers.add(sub.id);
          } else if (!STRIPE_DEAD_STATUSES.includes(sub.status)) {
            ids.add(sub.id);
          }
        }
      } catch (err) {
        // Client inconnu chez Stripe: il n'a aucun abonnement a annuler.
        if (!estIntrouvableChezStripe(err)) throw echecStripe(err, tenant.id);
      }
    }

    for (const id of ids) {
      if (etrangers.has(id)) {
        logger.warn('Suppression de compte: abonnement d un autre restaurant ignore', {
          tenantId: tenant.id,
          subscriptionId: id,
        });
        continue;
      }
      try {
        await stripe.subscriptions.cancel(id);
      } catch (err) {
        // "Introuvable" = deja annule (reponse mesuree de Stripe, voir
        // stripe-webhook/double-abonnement.ts): c'est l'etat recherche.
        if (!estIntrouvableChezStripe(err)) throw echecStripe(err, tenant.id);
      }
    }
  }

  return {
    /**
     * Ferme le restaurant courant de son proprietaire.
     * @returns `alreadyClosed` quand le restaurant etait deja ferme (idempotent).
     */
    async closeOwnerRestaurant(input: CloseRestaurantInput): Promise<{ alreadyClosed: boolean }> {
      const tenant = await lireRestaurant(input.tenantSlug);
      const { data: membre, error } = await admin
        .from('admin_users')
        .select('id, role')
        .eq('user_id', input.userId)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .is('deleted_at', null)
        .maybeSingle<{ id: string; role: string }>();
      if (error) throw new ServiceError('Lecture du compte impossible', 'INTERNAL', error);
      if (!membre) {
        throw new ServiceError('Acces non autorise pour ce restaurant', 'UNAUTHORIZED');
      }
      if (membre.role !== 'owner') {
        throw new ServiceError('Seul un proprietaire peut fermer le restaurant', 'UNAUTHORIZED');
      }
      if (tenant.deleted_at) return { alreadyClosed: true };

      if (normaliser(input.confirmation) !== normaliser(tenant.name)) {
        throw new ServiceError('Le nom saisi ne correspond pas au restaurant', 'VALIDATION');
      }

      await arreterFacturationStripe(tenant);

      // Uniquement CETTE ligne: les autres restaurants du groupe restent ouverts.
      const { error: erreurFermeture } = await admin
        .from('tenants')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: input.userId,
          is_active: false,
        })
        .eq('id', tenant.id)
        .is('deleted_at', null);
      if (erreurFermeture) {
        logger.error('Suppression de compte: fermeture du restaurant impossible', erreurFermeture, {
          tenantId: tenant.id,
        });
        throw new ServiceError(
          'Fermeture du restaurant impossible, reessayez.',
          'INTERNAL',
          erreurFermeture,
        );
      }

      logger.info('Restaurant ferme par un proprietaire', {
        tenantId: tenant.id,
        userId: input.userId,
      });
      return { alreadyClosed: false };
    },

    /**
     * Supprime le compte d'un membre du personnel, dans tous les restaurants.
     * Refuse un compte plateforme et le proprietaire d'un restaurant ouvert
     * (lui ferme d'abord son restaurant).
     *
     * Lecture inter-restaurants VOLONTAIRE, comme `member-session.service.ts`:
     * elle porte sur le compte (`user_id` verifie), pas sur les donnees d'un
     * restaurant.
     */
    async deleteStaffAccount(input: DeleteStaffAccountInput): Promise<void> {
      if (!STAFF_CONFIRMATION_WORDS.includes(normaliser(input.confirmation))) {
        throw new ServiceError('Tapez le mot demande pour confirmer', 'VALIDATION');
      }

      const lignes = await lireAppartenances(input.userId);
      if (isPlatformAccount(lignes)) {
        throw new ServiceError('Un compte plateforme ne se supprime pas ici', 'UNAUTHORIZED');
      }
      const proprietaireActif = lignes.some(
        (l) => l.role === 'owner' && !l.deleted_at && l.tenants.deleted_at === null,
      );
      if (proprietaireActif) {
        throw new ServiceError(
          "Vous etes proprietaire d'un restaurant ouvert: fermez-le d'abord",
          'CONFLICT',
        );
      }

      // Retrait ET anonymisation de chaque ligne, meme forme que la purge de
      // conservation, sauf `ban_reason`: ce n'est pas une donnee de contact et
      // il garde la trace d'un bannissement. Une ligne deja retiree (renvoi,
      // essai precedent) garde sa date et son auteur d'origine.
      const maintenant = new Date().toISOString();
      for (const ligne of lignes) {
        const { error } = await admin
          .from('admin_users')
          .update({
            email: `anonymise-${ligne.id}@anonymise.invalid`,
            full_name: null,
            phone: null,
            is_active: false,
            deleted_at: ligne.deleted_at ?? maintenant,
            deleted_by: ligne.deleted_by ?? input.userId,
          })
          .eq('id', ligne.id)
          .eq('user_id', input.userId);
        if (error) throw new ServiceError('Suppression du compte impossible', 'INTERNAL', error);
        // Ses tables ne restent pas attribuees a un compte qui n'existe plus.
        await createAssignmentService(admin).releaseAllForServer(ligne.tenant_id, ligne.id);
      }

      const { error: erreurSessions } = await admin.rpc('revoke_user_sessions', {
        p_user_id: input.userId,
      });
      if (erreurSessions) {
        // L'effacement du compte qui suit coupe de toute facon la reconnexion.
        logger.warn('Suppression de compte: revocation des sessions refusee', {
          userId: input.userId,
          error: erreurSessions.message,
        });
      }

      // Effacement en douceur, comme la purge de conservation.
      const { error: erreurAuth } = await admin.auth.admin.deleteUser(input.userId, true);
      if (erreurAuth) {
        logger.error('Suppression de compte: effacement du compte impossible', erreurAuth, {
          userId: input.userId,
        });
        throw new ServiceError('Suppression du compte impossible, reessayez.', 'INTERNAL');
      }
    },
  };
}
