import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { verifierEndpointPush } from '@/lib/push/endpoints-autorises';

/**
 * Envoi des notifications push aux appareils d'un restaurant.
 *
 * POURQUOI CE SERVICE EXISTE. Tout le circuit des notifications push etait
 * deja la - et il ne servait a rien. Mesure du 2026-11-08: le navigateur
 * s'abonnait, la route ecrivait l'abonnement en base, le service worker savait
 * afficher la notification, et PERSONNE, nulle part, n'envoyait jamais ce
 * `push`. Un restaurateur pouvait activer les notifications, voir le bouton
 * passer a "activees", et ne jamais en recevoir une seule.
 *
 * CE QUE CA CHANGE EN SALLE. La notification dans l'application n'est visible
 * que si quelqu'un regarde l'ecran, application ouverte. Une tablette en veille
 * au comptoir ne montre rien. Le push reveille l'appareil.
 *
 * TROIS GARDES QUI NE SONT PAS DECORATIVES. Ce service est le premier code qui
 * LIT `push_subscriptions` et qui appelle les URL qui y sont stockees. Il arme
 * donc des defauts qui, tant que rien n'envoyait, ne produisaient rien:
 *
 *   1. APPARTENANCE. La policy RLS d'ecriture ne contraint que `user_id`, pas
 *      `tenant_id` (mesure en production le 2026-11-08). N'importe quel
 *      titulaire de compte pouvait donc inscrire son telephone sous le
 *      `tenant_id` d'un autre restaurant et recevoir ses commandes - table,
 *      articles, montant, soit son chiffre d'affaires en direct. On ne contacte
 *      donc QUE les membres vivants du restaurant, avec les criteres de la
 *      garde unifiee (`is_active`, pas de `deleted_at`). Cela ferme aussi le
 *      cas de l'employe retire: rien ne supprime ses abonnements, et son
 *      telephone personnel continuerait sinon de recevoir chaque commande.
 *   2. DESTINATION. L'`endpoint` est une URL que nous appelons nous-memes.
 *      Liste fermee de services de push (voir `endpoints-autorises.ts`).
 *   3. PLAFOND. Une commande declenche une requete sortante par appareil. Sans
 *      plafond ni concurrence bornee, un compte pouvait inscrire des centaines
 *      de lignes et faire payer autant de requetes a chaque commande.
 *
 * CE SERVICE EXIGE LE CLIENT service_role. La RLS n'autorise un utilisateur
 * qu'a lire SES propres abonnements; un envoi doit lire ceux de tous les
 * appareils du restaurant, et il part d'un contexte client (une commande
 * passee par un convive), donc hors session admin.
 */

/** Ce que le service worker sait afficher (voir `src/app/sw.ts`). */
interface ChargePush {
  /** Titre. Jamais une donnee personnelle d'un convive, jamais son texte brut. */
  titre: string;
  /** Corps. Meme regle. */
  corps: string;
  /**
   * Regroupement. Deux notifications de meme `tag` se REMPLACENT, et sans
   * `renotify` la seconde ne fait aucun bruit: un tag commun a toutes les
   * commandes ferait disparaitre la premiere en silence. Donner un tag PAR
   * evenement (par commande, par ingredient).
   */
  tag: string;
  /** Chemin dans l'espace admin, ex: /admin/orders. */
  url: string;
  /**
   * Identifiant du restaurant dans l'URL. Le service worker en a besoin: selon
   * que le personnel s'est connecte sur `attabl.com` ou sur
   * `<slug>.attabl.com`, la meme page admin n'a pas le meme chemin.
   */
  slug: string;
}

interface ResultatEnvoiPush {
  envoyees: number;
  /** Abonnements REELLEMENT supprimes parce que l'appareil ne les reconnait plus. */
  expirees: number;
  echecs: number;
  /** Abonnements ignores: destination hors de la liste des services de push. */
  refuses: number;
}

export interface ServicePush {
  envoyerAuxAppareilsDuTenant(tenantId: string, charge: ChargePush): Promise<ResultatEnvoiPush>;
}

const RESULTAT_VIDE: ResultatEnvoiPush = { envoyees: 0, expirees: 0, echecs: 0, refuses: 0 };

/** Contact joignable si nos envois posent probleme: exigence du protocole VAPID. */
const SUJET_VAPID = 'mailto:contact@attabl.com';

/**
 * Codes qui signifient "cet abonnement n'existe plus": appareil reinitialise,
 * navigateur desinstalle, permission revoquee. Il faut SUPPRIMER la ligne.
 * Un 401/403 (cles changees) ou un 500 n'en fait PAS partie: supprimer
 * desabonnerait tout le monde a cause d'une rotation de cles ou d'un incident
 * chez Google, et personne ne s'en apercevrait.
 */
const CODES_ABONNEMENT_MORT = [404, 410];

/** Au-dela, on n'envoie pas: une commande ne doit pas declencher 500 requetes. */
const MAX_APPAREILS = 100;
/** Requetes sortantes simultanees. */
const TAILLE_LOT = 10;
/** web-push n'arme aucun delai de garde: une socket qui pend tiendrait la fonction. */
const DELAI_RESEAU_MS = 10_000;
/** Une alerte de service ne vaut plus rien le lendemain. */
const DUREE_DE_VIE_S = 1_800;

interface ClesVapid {
  publique: string;
  privee: string;
}

/** Longueurs imposees par le protocole, une fois decodees. */
const OCTETS_CLE_PUBLIQUE = 65;
const OCTETS_CLE_PRIVEE = 32;

function longueurDecodee(valeur: string): number {
  try {
    return Buffer.from(valeur, 'base64url').length;
  } catch {
    return -1;
  }
}

/**
 * Lit et VALIDE les cles. La validation compte: `setVapidDetails` leve
 * synchroniquement si une cle est mal formee (base64 avec `=`, cles inversees,
 * valeur tronquee au copier-coller). Sans ce controle, le service levait -
 * alors que sa documentation promettait le contraire - et le message d'erreur
 * ne disait nulle part que le FORMAT des cles etait en cause.
 */
function lireClesVapid(): ClesVapid | null {
  // La cle publique est publique par construction: le navigateur l'envoie au
  // service de push. La privee, non.
  const publique = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privee = process.env.VAPID_PRIVATE_KEY;
  if (!publique || !privee) return null;

  if (publique.includes('=') || privee.includes('=')) {
    logger.error('Cles VAPID invalides: elles doivent etre en base64 URL-safe, sans caractere "="');
    return null;
  }
  const lPub = longueurDecodee(publique);
  const lPriv = longueurDecodee(privee);
  if (lPub !== OCTETS_CLE_PUBLIQUE || lPriv !== OCTETS_CLE_PRIVEE) {
    logger.error('Cles VAPID invalides: longueur inattendue une fois decodees', {
      octetsPublique: lPub,
      octetsPubliqueAttendus: OCTETS_CLE_PUBLIQUE,
      octetsPrivee: lPriv,
      octetsPriveeAttendus: OCTETS_CLE_PRIVEE,
      indice: 'cles inversees, valeur tronquee, ou mauvais format',
    });
    return null;
  }
  return { publique, privee };
}

interface LigneAbonnement {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function parLots<T>(elements: T[], taille: number, travail: (e: T) => Promise<void>) {
  for (let i = 0; i < elements.length; i += taille) {
    await Promise.all(elements.slice(i, i + taille).map(travail));
  }
}

export function createPushService(supabase: SupabaseClient): ServicePush {
  return {
    /**
     * Envoie une notification aux appareils des membres vivants d'un restaurant.
     *
     * Ne leve jamais - garantie tenue par le code, pas seulement annoncee:
     * l'appelant est toujours un effet de bord d'une action metier (une
     * commande, une alerte de stock) qui doit reussir sans lui.
     */
    async envoyerAuxAppareilsDuTenant(
      tenantId: string,
      charge: ChargePush,
    ): Promise<ResultatEnvoiPush> {
      try {
        const cles = lireClesVapid();
        if (!cles) {
          logger.warn('Push non configure ou cles invalides: aucun envoi', { tenantId });
          return RESULTAT_VIDE;
        }

        // 1. Les membres VIVANTS du restaurant. Memes criteres que la garde
        //    unifiee des pages admin (`resolve-admin-permission.ts`): un membre
        //    desactive ou supprime en douceur n'est plus destinataire.
        const { data: membres, error: erreurMembres } = await supabase
          .from('admin_users')
          .select('user_id')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .is('deleted_at', null);

        if (erreurMembres) {
          logger.error('Lecture des membres du restaurant impossible', erreurMembres, { tenantId });
          return RESULTAT_VIDE;
        }
        const idsMembres = [...new Set((membres ?? []).map((m) => m.user_id as string))];
        if (idsMembres.length === 0) return RESULTAT_VIDE;

        // 2. Leurs appareils, et seulement ceux de CE restaurant.
        const { data, error } = await supabase
          .from('push_subscriptions')
          .select('id, endpoint, p256dh, auth')
          .eq('tenant_id', tenantId)
          .in('user_id', idsMembres)
          .limit(MAX_APPAREILS);

        if (error) {
          logger.error('Lecture des abonnements push impossible', error, { tenantId });
          return RESULTAT_VIDE;
        }

        const toutes = (data ?? []) as LigneAbonnement[];
        if (toutes.length === 0) return RESULTAT_VIDE;
        if (toutes.length === MAX_APPAREILS) {
          logger.warn('Plafond d appareils push atteint: certains n ont pas ete contactes', {
            tenantId,
            plafond: MAX_APPAREILS,
          });
        }

        // 3. Destinations: seuls les services de push connus sont appeles.
        const abonnements: LigneAbonnement[] = [];
        let refuses = 0;
        for (const abonnement of toutes) {
          const verdict = verifierEndpointPush(abonnement.endpoint);
          if (verdict.autorise) {
            abonnements.push(abonnement);
            continue;
          }
          refuses += 1;
          // On ne supprime PAS: c'est notre regle, pas un refus du service de
          // push. L'hote est journalise, seul moyen de reperer un hote
          // legitime qui manquerait a la liste.
          logger.warn('Abonnement push ignore: destination non autorisee', {
            tenantId,
            raison: verdict.raison,
            hote: verdict.hote,
          });
        }
        if (abonnements.length === 0) return { ...RESULTAT_VIDE, refuses };

        const webpush = await import('web-push');
        webpush.setVapidDetails(SUJET_VAPID, cles.publique, cles.privee);

        // Le service worker lit ces noms-la, en anglais. Ne pas les traduire.
        const corpsChiffre = JSON.stringify({
          title: charge.titre,
          body: charge.corps,
          tag: charge.tag,
          url: charge.url,
          slug: charge.slug,
        });

        // @types/web-push est en retard sur la bibliotheque: `timeout`, `TTL` et
        // `urgency` sont bien geres (web-push-lib.js), mais absents des types.
        const options = {
          timeout: DELAI_RESEAU_MS,
          TTL: DUREE_DE_VIE_S,
          urgency: 'high',
        } as unknown as Parameters<typeof webpush.sendNotification>[2];

        const expirees: string[] = [];
        let envoyees = 0;
        let echecs = 0;

        await parLots(abonnements, TAILLE_LOT, async (abonnement) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: abonnement.endpoint,
                keys: { p256dh: abonnement.p256dh, auth: abonnement.auth },
              },
              corpsChiffre,
              options,
            );
            envoyees += 1;
          } catch (erreur) {
            const code = (erreur as { statusCode?: number }).statusCode;
            if (code !== undefined && CODES_ABONNEMENT_MORT.includes(code)) {
              expirees.push(abonnement.id);
              return;
            }
            echecs += 1;
            // Pas l'endpoint dans le journal: c'est un identifiant d'appareil.
            logger.warn('Envoi push refuse par le service de push', { tenantId, code });
          }
        });

        // 4. Nettoyage. On ne compte comme "expiree" que ce qui a VRAIMENT ete
        //    supprime: annoncer des suppressions qui n'ont pas eu lieu rendrait
        //    le compte rendu faux, et PostgREST ne leve rien sur un DELETE qui
        //    ne touche aucune ligne.
        let supprimees = 0;
        if (expirees.length > 0) {
          const { count, error: erreurSuppression } = await supabase
            .from('push_subscriptions')
            .delete({ count: 'exact' })
            .eq('tenant_id', tenantId)
            .in('id', expirees);

          if (erreurSuppression) {
            logger.error('Nettoyage des abonnements push expires impossible', erreurSuppression, {
              tenantId,
              aSupprimer: expirees.length,
            });
          } else {
            supprimees = count ?? 0;
            if (supprimees !== expirees.length) {
              logger.warn('Abonnements push expires partiellement nettoyes', {
                tenantId,
                attendus: expirees.length,
                supprimes: supprimees,
              });
            }
          }
        }

        logger.info('Envoi push', { tenantId, envoyees, expirees: supprimees, echecs, refuses });
        return { envoyees, expirees: supprimees, echecs, refuses };
      } catch (erreur) {
        // Filet de securite: aucune action metier ne doit tomber a cause d'une
        // notification, meme sur une panne imprevue de la bibliotheque.
        logger.error('Envoi push interrompu par une erreur inattendue', erreur, { tenantId });
        return RESULTAT_VIDE;
      }
    },
  };
}
