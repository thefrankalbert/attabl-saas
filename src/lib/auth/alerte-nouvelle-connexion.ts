import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { createEmailService } from '@/services/email.service';
import type { NewLoginEmailData } from '@/services/email.types';
import { estAppareilConnu, marquerAppareilConnu } from './appareil-connu';

/**
 * Alerte "nouvelle connexion a votre compte" (audit Q19), appelee apres une
 * connexion REUSSIE (mot de passe ou OAuth), avec le client Supabase qui porte
 * la nouvelle session.
 *
 * Meilleur effort, jamais bloquant: toute erreur est journalisee et la
 * connexion continue. L'e-mail part apres la reponse (`after`), il ne retarde
 * pas la connexion.
 *
 * Plafond: la fonction SQL `reserver_alerte_nouvelle_connexion` rend vrai au
 * plus une fois par heure et par compte, de facon atomique. Elle rend FAUX a
 * la toute premiere connexion d'un compte depuis la mise en service (aucun
 * appareil n'etait encore connu): sans cela, chaque utilisateur existant
 * recevait une alerte a sa premiere connexion apres le deploiement.
 *
 * Un compte cree il y a moins d'une heure n'a encore aucun appareil connu:
 * pas d'alerte (l'inscription vient de se faire sur cet appareil), mais
 * l'appareil est marque.
 */

const COMPTE_RECENT_MS = 60 * 60 * 1000;

export interface ConnexionReussie {
  supabase: SupabaseClient;
  userId: string;
  email: string | undefined;
  compteCreeLe: string | undefined;
  cookieAppareil: string | undefined;
  methode: NewLoginEmailData['methode'];
  /** Origine de la requete, pour le lien de changement de mot de passe. */
  origine: string;
}

function libelleDate(maintenant: Date): string {
  const date = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(maintenant);
  return `${date} (heure GMT)`;
}

/**
 * Rend la nouvelle valeur du cookie d'appareil a poser sur la reponse, ou null
 * s'il n'y a rien a poser (appareil deja connu, ou secret absent).
 */
export async function traiterConnexionReussie(c: ConnexionReussie): Promise<string | null> {
  const maintenant = new Date();
  let cookie: string;
  try {
    if (estAppareilConnu(c.cookieAppareil, c.userId, maintenant.getTime())) return null;
    cookie = marquerAppareilConnu(c.cookieAppareil, c.userId, maintenant.getTime());
  } catch (err) {
    logger.warn('New-login alert: device cookie unavailable', { error: String(err) });
    return null;
  }

  const creeLe = c.compteCreeLe ? Date.parse(c.compteCreeLe) : NaN;
  const compteRecent = Number.isFinite(creeLe) && maintenant.getTime() - creeLe < COMPTE_RECENT_MS;
  if (!c.email || compteRecent) return cookie;

  try {
    const { data: reserve, error } = await c.supabase.rpc('reserver_alerte_nouvelle_connexion');
    if (error) {
      logger.warn('New-login alert: reservation refused', {
        userId: c.userId,
        error: error.message,
      });
      return cookie;
    }
    if (reserve !== true) return cookie;

    const destinataire = c.email;
    const donnees: NewLoginEmailData = {
      dateLabel: libelleDate(maintenant),
      methode: c.methode,
      changePasswordUrl: `${c.origine}/forgot-password`,
    };
    after(async () => {
      const resultat = await createEmailService().sendNewLoginEmail(destinataire, donnees);
      if (!resultat.success) {
        logger.warn('New-login alert: email not sent', {
          userId: c.userId,
          error: resultat.error,
        });
      }
    });
  } catch (err) {
    logger.warn('New-login alert failed', { userId: c.userId, error: String(err) });
  }
  return cookie;
}
