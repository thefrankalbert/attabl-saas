import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

/**
 * Envoi des notifications push aux appareils d'un restaurant.
 *
 * POURQUOI CE SERVICE EXISTE. Tout le circuit des notifications push etait
 * deja la - et il ne servait a rien. Mesure du 2026-11-08:
 *
 *   - `usePushSubscription` demande la permission et enregistre l'appareil;
 *   - `POST /api/push-subscriptions` ecrit l'abonnement en base;
 *   - le service worker (`src/app/sw.ts`) ecoute l'evenement `push` et affiche
 *     la notification;
 *   - et PERSONNE, nulle part, n'envoyait jamais ce `push`. Aucun appel a un
 *     service d'envoi, aucune dependance Web Push, aucune lecture de la table
 *     `push_subscriptions` en dehors de la route qui l'ecrit.
 *
 * Donc un restaurateur pouvait activer les notifications dans ses reglages,
 * voir le bouton passer a "activees", et ne jamais recevoir une seule alerte.
 * Pire que pas de fonctionnalite: une promesse qui ment.
 *
 * CE QUE CA CHANGE EN SALLE. La notification dans l'application existait deja
 * (table `notifications`, lue en temps reel par le centre de notifications),
 * mais elle n'est visible que si quelqu'un regarde l'ecran, application
 * ouverte. Une tablette en veille au comptoir ne montre rien. Le push, lui,
 * reveille l'appareil: c'est la difference entre une commande vue tout de
 * suite et une commande vue au prochain passage en cuisine.
 *
 * SANS CLES VAPID, CE SERVICE NE FAIT RIEN ET NE CASSE RIEN. Le protocole Web
 * Push exige une paire de cles (VAPID) qui identifie le serveur aupres de
 * Google, Apple et Mozilla. Si elles sont absentes de l'environnement, les
 * methodes rendent un compte rendu a zero au lieu de lever: une commande ne
 * doit jamais echouer parce qu'une notification n'a pas pu partir.
 *
 * CE SERVICE EXIGE LE CLIENT service_role. La RLS de `push_subscriptions`
 * n'autorise un utilisateur qu'a lire SES propres abonnements (migration
 * 20260731000300, qui a ferme une fuite ou n'importe qui pouvait lire les
 * identifiants Web Push de tous les restaurants). Un envoi doit lire ceux de
 * TOUS les appareils d'un restaurant, et il part depuis un contexte client
 * (une commande passee par un convive), donc hors session admin.
 */

/** Ce que le service worker sait afficher (voir `src/app/sw.ts`). */
export interface ChargePush {
  /** Titre de la notification. Jamais de donnee personnelle d'un convive. */
  titre: string;
  /** Corps du message. Jamais de donnee personnelle d'un convive. */
  corps: string;
  /**
   * Regroupement. Deux notifications de meme `tag` se remplacent au lieu de
   * s'empiler - sans lui, un service de midi laisse quarante notifications
   * dans la barre.
   */
  tag?: string;
  /** Chemin a ouvrir au clic, dans l'origine du restaurant (ex: /admin/orders). */
  url?: string;
}

export interface ResultatEnvoiPush {
  envoyees: number;
  /** Abonnements supprimes parce que l'appareil ne les reconnait plus. */
  expirees: number;
  echecs: number;
}

const RESULTAT_VIDE: ResultatEnvoiPush = { envoyees: 0, expirees: 0, echecs: 0 };

/**
 * Le "sujet" VAPID: un contact que le service de push (Google, Apple, Mozilla)
 * peut joindre si nos envois posent probleme. C'est une exigence du protocole.
 */
const SUJET_VAPID = 'mailto:contact@attabl.com';

/**
 * Codes qui signifient "cet abonnement n'existe plus": appareil reinitialise,
 * navigateur desinstalle, permission revoquee. Il faut SUPPRIMER la ligne, pas
 * la reessayer: sinon la table ne fait que grossir et chaque commande paie une
 * requete reseau pour un appareil mort.
 */
const CODES_ABONNEMENT_MORT = [404, 410];

interface ClesVapid {
  publique: string;
  privee: string;
}

function lireClesVapid(): ClesVapid | null {
  // La cle publique est la meme que celle du navigateur: elle est publique par
  // construction (le navigateur l'envoie au service de push). La privee, non.
  const publique = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privee = process.env.VAPID_PRIVATE_KEY;
  if (!publique || !privee) return null;
  return { publique, privee };
}

interface LigneAbonnement {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function createPushService(supabase: SupabaseClient) {
  return {
    /**
     * Envoie une notification a tous les appareils enregistres d'un restaurant.
     *
     * Ne leve jamais: l'appelant est toujours un effet de bord d'une action
     * metier (une commande, une alerte de stock) qui doit reussir sans lui.
     */
    async envoyerAuxAppareilsDuTenant(
      tenantId: string,
      charge: ChargePush,
    ): Promise<ResultatEnvoiPush> {
      const cles = lireClesVapid();
      if (!cles) {
        logger.warn('Push non configure: VAPID_PRIVATE_KEY ou cle publique absente', { tenantId });
        return RESULTAT_VIDE;
      }

      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('tenant_id', tenantId);

      if (error) {
        logger.error('Lecture des abonnements push impossible', error, { tenantId });
        return RESULTAT_VIDE;
      }

      const abonnements = (data ?? []) as LigneAbonnement[];
      if (abonnements.length === 0) return RESULTAT_VIDE;

      // Charge en differe: inutile de monter la bibliotheque de chiffrement
      // quand personne n'est abonne ou que les cles manquent.
      const webpush = await import('web-push');
      webpush.setVapidDetails(SUJET_VAPID, cles.publique, cles.privee);

      // Le service worker lit ces noms-la, en anglais. Ne pas les traduire ici.
      const corpsChiffre = JSON.stringify({
        title: charge.titre,
        body: charge.corps,
        tag: charge.tag,
        url: charge.url,
      });

      const expirees: string[] = [];
      let envoyees = 0;
      let echecs = 0;

      await Promise.all(
        abonnements.map(async (abonnement) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: abonnement.endpoint,
                keys: { p256dh: abonnement.p256dh, auth: abonnement.auth },
              },
              corpsChiffre,
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
        }),
      );

      if (expirees.length > 0) {
        // `count: 'exact'`: PostgREST ne leve aucune erreur quand un DELETE ne
        // touche rien, donc sans le compte on enregistrerait des suppressions
        // fantomes. Le filtre tenant reste pose malgre les identifiants.
        const { count, error: erreurSuppression } = await supabase
          .from('push_subscriptions')
          .delete({ count: 'exact' })
          .eq('tenant_id', tenantId)
          .in('id', expirees);

        if (erreurSuppression) {
          logger.error('Nettoyage des abonnements push expires impossible', erreurSuppression, {
            tenantId,
          });
        } else if ((count ?? 0) !== expirees.length) {
          logger.warn('Abonnements push expires partiellement nettoyes', {
            tenantId,
            attendus: expirees.length,
            supprimes: count ?? 0,
          });
        }
      }

      logger.info('Envoi push', {
        tenantId,
        envoyees,
        expirees: expirees.length,
        echecs,
      });

      return { envoyees, expirees: expirees.length, echecs };
    },
  };
}
