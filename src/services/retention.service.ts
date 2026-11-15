import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { RETENTION } from '@/lib/legal/retention';

/**
 * Effacement des donnees personnelles passe un delai annonce.
 *
 * POURQUOI CE SERVICE EXISTE. La politique de confidentialite comptait six
 * sections et AUCUNE ne parlait de duree de conservation. Rien, nulle part,
 * n'effacait quoi que ce soit: le nom, le telephone et l'adresse de livraison
 * d'un client de restaurant restaient en base indefiniment. C'est le standard du
 * marche (30 a 90 jours), c'est ce que la loi camerounaise 2024/017 et la loi
 * burkinabe 001-2021 attendent, et c'est aussi ce qu'exige l'hebergement des
 * donnees en Irlande.
 *
 * ON ANONYMISE, ON NE SUPPRIME PAS LA COMMANDE. C'est la distinction qui compte,
 * et se tromper couterait cher dans les deux sens:
 *
 *   - supprimer la commande detruirait une piece comptable, que le droit
 *     commercial impose de garder des annees;
 *   - la garder telle quelle conserve l'identite d'un convive qui n'a jamais
 *     rien signe avec ATTABL et n'a aucune relation en cours avec le
 *     restaurant.
 *
 * Donc on vide les trois colonnes qui identifient une personne, et on garde le
 * numero, les montants, la TVA et les dates. La comptabilite reste complete,
 * l'identite disparait.
 *
 * CE SERVICE EST VOLONTAIREMENT INTER-TENANT, et c'est la seule exception a la
 * regle "chaque methode qui touche une table multi-tenant recoit et filtre un
 * tenant_id" (.claude/rules/05). Une obligation legale de duree de conservation
 * ne s'applique pas restaurant par restaurant: elle s'applique a toute la base.
 * Filtrer par tenant obligerait a parcourir la liste des restaurants depuis un
 * cron, et un restaurant oublie - supprime, suspendu, cree entre deux passages -
 * garderait ses donnees pour toujours. Comme `platform-admin.service.ts`, ce
 * service exige donc le client service_role et n'est appele que par le cron.
 */

/**
 * Le delai annonce. 90 jours est le haut de la fourchette du marche: assez long
 * pour qu'un restaurateur retrouve un client sur une reclamation ou un litige de
 * paiement, assez court pour ne pas garder un annuaire de convives.
 *
 * TOUTES LES DUREES VIVENT DANS `@/lib/legal/retention`, lue aussi par la
 * politique de confidentialite: duree annoncee et duree appliquee ne peuvent
 * donc pas diverger.
 */
export const RETENTION_JOURS = RETENTION.guestDataDays;

/** Les colonnes d'une commande qui identifient une personne. */
const COLONNES_PERSONNELLES = ['customer_name', 'customer_phone', 'delivery_address'] as const;

export interface ResultatPurge {
  commandesAnonymisees: number;
  sessionsSupprimees: number;
  invitationsSupprimees: number;
  abonnementsPushSupprimes: number;
  journauxAuditSupprimes: number;
  restaurantsAnonymises: number;
}

function dateLimite(maintenant: Date, jours: number = RETENTION_JOURS): string {
  const limite = new Date(maintenant);
  limite.setUTCDate(limite.getUTCDate() - jours);
  return limite.toISOString();
}

/** Adresse de remplacement d'un compte d'authentification anonymise. */
function adresseAnonyme(userId: string): string {
  return `anonymise-${userId}@anonymise.invalid`;
}

export function createRetentionService(supabase: SupabaseClient) {
  return {
    /**
     * Vide les colonnes personnelles des commandes passe le delai.
     *
     * Le filtre `or` ne retient que les lignes qui portent ENCORE une donnee:
     * sans lui, chaque execution reecrirait toutes les commandes anciennes, ce
     * qui gonflerait la table pour rien et rendrait le compte rendu faux (il
     * annoncerait des centaines d'anonymisations chaque nuit).
     */
    async anonymiserCommandesAnciennes(maintenant = new Date()): Promise<number> {
      const limite = dateLimite(maintenant);
      const vide = Object.fromEntries(COLONNES_PERSONNELLES.map((c) => [c, null]));

      // `count`, not `.select('id')`: PostgREST rejects an `or` filter combined
      // with returning the updated rows (42703, measured 2026-11-08 on
      // PostgREST v14.3), so the nightly anonymisation ALWAYS failed.
      const { count, error } = await supabase
        .from('orders')
        .update(vide, { count: 'exact' })
        .lt('created_at', limite)
        .or(COLONNES_PERSONNELLES.map((c) => `${c}.not.is.null`).join(','));

      if (error) {
        logger.error('Anonymisation des commandes anciennes impossible', error);
        throw error;
      }
      return count ?? 0;
    },

    /**
     * Supprime les sessions passe le delai: elles portent une adresse IP, donc
     * une donnee personnelle, et n'ont aucune valeur comptable.
     */
    async purgerSessionsAnciennes(maintenant = new Date()): Promise<number> {
      const limite = dateLimite(maintenant);

      // `count: 'exact'` et non un simple delete: PostgREST ne leve AUCUNE
      // erreur quand un DELETE ne touche rien, donc sans le compte on
      // enregistrerait des suppressions fantomes dans le journal.
      const { count, error } = await supabase
        .from('user_sessions')
        .delete({ count: 'exact' })
        .lt('created_at', limite);

      if (error) {
        logger.error('Purge des sessions anciennes impossible', error);
        throw error;
      }
      return count ?? 0;
    },

    /**
     * Supprime les invitations expirees ou annulees, 30 jours apres leur date
     * d'expiration. Une invitation acceptee n'est jamais touchee ici: elle
     * documente l'arrivee d'un membre. Une invitation annulee dont l'expiration
     * est lointaine reste jusqu'a son expiration + 30 jours (aucune date
     * d'annulation n'est enregistree).
     */
    async purgerInvitationsPerimees(maintenant = new Date()): Promise<number> {
      const limite = dateLimite(maintenant, RETENTION.invitationsAfterExpiryDays);

      const { count, error } = await supabase
        .from('invitations')
        .delete({ count: 'exact' })
        .neq('status', 'accepted')
        .lt('expires_at', limite);

      if (error) {
        logger.error('Purge des invitations perimees impossible', error);
        throw error;
      }
      return count ?? 0;
    },

    /**
     * Supprime les abonnements push d'appareils ni renouveles ni joints depuis
     * 180 jours (`last_used_at`, rafraichi a chaque abonnement et envoi reussi).
     */
    async purgerAbonnementsPushInactifs(maintenant = new Date()): Promise<number> {
      const limite = dateLimite(maintenant, RETENTION.pushInactiveDays);

      const { count, error } = await supabase
        .from('push_subscriptions')
        .delete({ count: 'exact' })
        .lt('last_used_at', limite);

      if (error) {
        logger.error('Purge des abonnements push inactifs impossible', error);
        throw error;
      }
      return count ?? 0;
    },

    /**
     * Supprime les journaux d'audit de plus de 12 mois (restaurants et
     * plateforme). Ils portent l'adresse e-mail de l'acteur. Le registre des
     * paiements, les commandes et les evenements Stripe sont d'autres tables et
     * ne sont JAMAIS purges: ce sont des pieces comptables.
     */
    async purgerJournauxAudit(maintenant = new Date()): Promise<number> {
      const limite = dateLimite(maintenant, RETENTION.auditLogDays);
      let total = 0;

      for (const table of ['audit_log', 'platform_audit_log'] as const) {
        const { count, error } = await supabase
          .from(table)
          .delete({ count: 'exact' })
          .lt('created_at', limite);

        if (error) {
          logger.error('Purge des journaux d audit impossible', error, { table });
          throw error;
        }
        total += count ?? 0;
      }
      return total;
    },

    /**
     * Anonymise les restaurants clos depuis plus de 30 jours.
     *
     * Deux etapes, dans CET ordre, sur la MEME date limite:
     *   1. effacer l'adresse des comptes d'authentification concernes (membres
     *      sans autre appartenance vivante). Si cette etape echoue, on jette
     *      AVANT l'etape 2: le restaurant n'est pas marque anonymise et la nuit
     *      suivante reessaie (l'etape 1 est idempotente);
     *   2. anonymiser la base en une transaction (fonction SQL).
     * Les commandes, paiements et factures ne sont pas touches.
     */
    async anonymiserRestaurantsFermes(maintenant = new Date()): Promise<number> {
      const limite = dateLimite(maintenant, RETENTION.closedTenantAnonymizeDays);

      const { data, error } = await supabase.rpc('closed_tenant_auth_users', {
        p_cutoff: limite,
      });
      if (error) {
        logger.error('Lecture des comptes de restaurants clos impossible', error);
        throw error;
      }

      const comptes = (data ?? []) as { auth_user_id: string }[];
      for (const { auth_user_id: userId } of comptes) {
        const { error: erreurAuth } = await supabase.auth.admin.updateUserById(userId, {
          email: adresseAnonyme(userId),
          user_metadata: {},
        });
        if (erreurAuth) {
          logger.error('Anonymisation du compte d authentification impossible', erreurAuth, {
            userId,
          });
          throw erreurAuth;
        }
      }

      const { data: nombre, error: erreurBase } = await supabase.rpc('anonymize_closed_tenants', {
        p_cutoff: limite,
      });
      if (erreurBase) {
        logger.error('Anonymisation des restaurants clos impossible', erreurBase);
        throw erreurBase;
      }
      return typeof nombre === 'number' ? nombre : 0;
    },

    /**
     * Toutes les purges, et un compte rendu. Une erreur sur l'une ne doit pas
     * empecher l'autre: ce sont deux obligations distinctes, et echouer les deux
     * parce que l'une a echoue ne protege personne.
     */
    async executer(maintenant = new Date()): Promise<ResultatPurge> {
      const resultat: ResultatPurge = {
        commandesAnonymisees: 0,
        sessionsSupprimees: 0,
        invitationsSupprimees: 0,
        abonnementsPushSupprimes: 0,
        journauxAuditSupprimes: 0,
        restaurantsAnonymises: 0,
      };
      let echecs = 0;

      const etapes: [keyof ResultatPurge, (m: Date) => Promise<number>][] = [
        ['commandesAnonymisees', (m) => this.anonymiserCommandesAnciennes(m)],
        ['sessionsSupprimees', (m) => this.purgerSessionsAnciennes(m)],
        ['invitationsSupprimees', (m) => this.purgerInvitationsPerimees(m)],
        ['abonnementsPushSupprimes', (m) => this.purgerAbonnementsPushInactifs(m)],
        ['journauxAuditSupprimes', (m) => this.purgerJournauxAudit(m)],
        ['restaurantsAnonymises', (m) => this.anonymiserRestaurantsFermes(m)],
      ];

      for (const [cle, etape] of etapes) {
        try {
          resultat[cle] = await etape(maintenant);
        } catch {
          // Deja journalise par l'etape: une obligation qui echoue n'en emporte
          // pas une autre.
          echecs += 1;
        }
      }

      logger.info('Purge des donnees personnelles', {
        retentionJours: RETENTION_JOURS,
        ...resultat,
        echecs,
      });

      return resultat;
    },
  };
}
