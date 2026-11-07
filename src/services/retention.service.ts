import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

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
 * CETTE VALEUR EST AUSSI DU TEXTE PUBLIC. Si elle change ici, la section
 * "Duree de conservation" de la politique de confidentialite doit changer avec
 * elle - une duree annoncee et une duree appliquee qui divergent sont pires que
 * pas de duree du tout.
 */
export const RETENTION_JOURS = 90;

/** Les colonnes d'une commande qui identifient une personne. */
const COLONNES_PERSONNELLES = ['customer_name', 'customer_phone', 'delivery_address'] as const;

export interface ResultatPurge {
  commandesAnonymisees: number;
  sessionsSupprimees: number;
}

function dateLimite(maintenant: Date): string {
  const limite = new Date(maintenant);
  limite.setUTCDate(limite.getUTCDate() - RETENTION_JOURS);
  return limite.toISOString();
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

      const { data, error } = await supabase
        .from('orders')
        .update(vide)
        .lt('created_at', limite)
        .or(COLONNES_PERSONNELLES.map((c) => `${c}.not.is.null`).join(','))
        .select('id');

      if (error) {
        logger.error('Anonymisation des commandes anciennes impossible', error);
        throw error;
      }
      return data?.length ?? 0;
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
     * Les deux purges, et un compte rendu. Une erreur sur l'une ne doit pas
     * empecher l'autre: ce sont deux obligations distinctes, et echouer les deux
     * parce que l'une a echoue ne protege personne.
     */
    async executer(maintenant = new Date()): Promise<ResultatPurge> {
      let commandesAnonymisees = 0;
      let sessionsSupprimees = 0;
      const echecs: unknown[] = [];

      try {
        commandesAnonymisees = await this.anonymiserCommandesAnciennes(maintenant);
      } catch (erreur) {
        echecs.push(erreur);
      }
      try {
        sessionsSupprimees = await this.purgerSessionsAnciennes(maintenant);
      } catch (erreur) {
        echecs.push(erreur);
      }

      logger.info('Purge des donnees personnelles', {
        retentionJours: RETENTION_JOURS,
        commandesAnonymisees,
        sessionsSupprimees,
        echecs: echecs.length,
      });

      return { commandesAnonymisees, sessionsSupprimees };
    },
  };
}
