import { createHash } from 'node:crypto';
import { signPayload, verifyPayload } from './signed-payload';

/**
 * "Appareil connu" pour l'alerte de nouvelle connexion (audit Q19).
 *
 * DEFINITION RETENUE: un appareil est connu pour un compte si son navigateur
 * porte un cookie signe par le serveur qui contient la marque de ce compte.
 * Le cookie est pose apres chaque connexion reussie et dure 400 jours (plafond
 * des navigateurs).
 *
 * POURQUOI CE CHOIX. Rien n'est stocke cote serveur sur l'appareil (ni
 * navigateur, ni pays, ni adresse IP): le cookie ne contient qu'une empreinte
 * courte de l'identifiant de compte, et la signature HMAC empeche de fabriquer
 * le cookie d'un autre compte. Un registre d'appareils en base aurait demande de
 * garder un agent utilisateur ou une adresse, donnees personnelles dont l'alerte
 * n'a pas besoin. Le prix assume: vider ses cookies ou changer de navigateur
 * vaut "nouvel appareil" (faux positif sans danger, plafonne a une alerte par
 * heure par la fonction reserver_alerte_nouvelle_connexion).
 *
 * Plusieurs comptes sur un meme navigateur (equipe qui partage une tablette):
 * jusqu'a 5 marques, les plus recentes gardees.
 */

export const APPAREIL_CONNU_COOKIE = 'attabl_appareil';
const APPAREIL_CONNU_TTL_SECONDS = 400 * 24 * 60 * 60;
const LABEL = 'attabl:appareil-connu:v1:';
const COMPTES_MAX = 5;

function marqueDuCompte(userId: string): string {
  return createHash('sha256').update(`appareil:${userId}`).digest('base64url').slice(0, 16);
}

function lireMarques(cookie: string | undefined, maintenant: number): string[] {
  if (!cookie) return [];
  const claims = verifyPayload(LABEL, cookie, maintenant);
  const marques = claims?.m;
  return Array.isArray(marques) ? marques.filter((m): m is string => typeof m === 'string') : [];
}

/** Leve si le secret de signature manque (l'appelant decide). */
export function estAppareilConnu(
  cookie: string | undefined,
  userId: string,
  maintenant: number = Date.now(),
): boolean {
  return lireMarques(cookie, maintenant).includes(marqueDuCompte(userId));
}

/** Nouvelle valeur du cookie, avec ce compte en tete. Leve si le secret manque. */
export function marquerAppareilConnu(
  cookie: string | undefined,
  userId: string,
  maintenant: number = Date.now(),
): string {
  const marque = marqueDuCompte(userId);
  const autres = lireMarques(cookie, maintenant).filter((m) => m !== marque);
  const marques = [marque, ...autres].slice(0, COMPTES_MAX);
  return signPayload(LABEL, { m: marques }, APPAREIL_CONNU_TTL_SECONDS * 1000, maintenant);
}

/** Valeur du cookie d'appareil dans la requete (routes qui recoivent un `Request`). */
export function cookieAppareilDeLaRequete(request: Request): string | undefined {
  for (const morceau of (request.headers.get('cookie') ?? '').split(';')) {
    const [cle, ...reste] = morceau.trim().split('=');
    if (cle === APPAREIL_CONNU_COOKIE) return reste.join('=');
  }
  return undefined;
}

export function optionsCookieAppareil(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: APPAREIL_CONNU_TTL_SECONDS,
  };
}
