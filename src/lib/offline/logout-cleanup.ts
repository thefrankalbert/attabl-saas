/**
 * Nettoyage a la deconnexion (OFF-03).
 *
 * Avant ce module, rien n'etait purge quand un utilisateur se deconnectait. Le
 * commentaire du service worker affirmait pourtant que "the app's TanStack
 * persist is cleared by the logout flow itself": c'etait faux. Recherche
 * exhaustive: aucune occurrence de `attabl-query-cache` ou `attabl-offline` hors
 * de leurs fichiers de definition, aucun `indexedDB.deleteDatabase`, aucun
 * `queryClient.clear()`. `/api/auth/signout` fait un signOut puis une redirection
 * 302, sans aucun code cote client.
 *
 * Consequence sur une tablette partagee: fin de service, le gerant se deconnecte
 * et range la tablette. Le lendemain un serveur ouvre l'application AVANT de se
 * connecter, et la rehydratation TanStack repeuple les ecrans avec le chiffre
 * d'affaires, les commandes et les noms de clients de la veille.
 *
 * LA DISTINCTION ESSENTIELLE ENTRE LES DEUX BASES:
 *
 *   - `attabl-query-cache` (TanStack persist) = cache de LECTURE. Il ne contient
 *     rien qui ne puisse etre re-lu depuis le serveur. On peut le supprimer sans
 *     risque, et il faut le supprimer.
 *
 *   - `attabl-offline` (outbox) = ecritures EN ATTENTE, c'est-a-dire des commandes
 *     deja encaissees mais pas encore parties. Les purger ferait perdre de
 *     l'argent reel. On ne les supprime JAMAIS: on draine d'abord, et si la file
 *     n'est pas vide on BLOQUE la deconnexion avec un message explicite.
 */

export const QUERY_CACHE_DB = 'attabl-query-cache';

export interface LogoutCleanupDeps {
  /** Nombre d'ecritures encore en file. */
  countPending: () => Promise<number>;
  /**
   * Tente de vider la file, et rend le nombre d'ecritures DEFINITIVEMENT perdues
   * au passage (refus serveur, ou expiration au-dela de MAX_AGE_MS).
   *
   * Ce retour n'est pas decoratif. Le drain SUPPRIME les entrees expirees. Jeter
   * son resultat rendait la perte totalement silencieuse: 4 commandes encaissees
   * samedi soir, deconnexion dimanche midi, le drain les efface, le compteur
   * retombe a zero, l'ecran est parfaitement normal et l'argent a disparu sans
   * que personne ne sache qu'il a existe.
   */
  drain: () => Promise<{ lost: number }>;
  /** Supprime la base de cache de lecture. */
  deleteQueryCache: () => Promise<void>;
  /** Etat reseau au moment de la deconnexion. */
  isOnline: () => boolean;
}

export interface LogoutCleanupResult {
  /** true = ne pas deconnecter, des ecritures seraient perdues. */
  blocked: boolean;
  /** Nombre d'ecritures encore en attente. */
  pending: number;
  /**
   * Ecritures definitivement perdues pendant la tentative (refus serveur ou
   * expiration). On bloque aussi la deconnexion dans ce cas: c'est la SEULE
   * occasion de le dire a l'operateur, l'entree n'existe deja plus.
   */
  lost: number;
}

export interface PrepareLogoutOptions {
  /**
   * Deconnexion assumee malgre des ecritures en attente.
   *
   * Sans cette porte de sortie, une panne reseau en fin de service
   * IMMOBILISERAIT la tablette: la file ne peut pas se vider, donc le serveur
   * sortant ne peut jamais se deconnecter, donc le suivant ne peut pas prendre
   * son service. Un blocage total pendant le coup de feu est un defaut plus
   * grave que celui qu'on cherche a eviter.
   *
   * Ce que le forcage NE fait PAS: supprimer la file. Les ecritures restent en
   * base locale, marquees au nom de leur auteur (OFF-07), et repartiront quand
   * cette personne se reconnectera sur cette tablette. L'interface DOIT le dire
   * mot pour mot avant de proposer ce bouton: c'est la difference entre un choix
   * informe et une perte silencieuse.
   */
  force?: boolean;
}

/**
 * A appeler AVANT de soumettre la deconnexion.
 *
 * Draine la file si le reseau est la, puis:
 *   - file vide     -> purge le cache de lecture, autorise la deconnexion;
 *   - file non vide -> ne supprime RIEN et bloque, en renvoyant le nombre
 *     d'ecritures en attente pour que l'interface puisse le dire a l'operateur;
 *   - file non vide + `force` -> purge le cache de lecture, laisse la file
 *     intacte, et autorise la deconnexion.
 */
export async function prepareLogout(
  deps: LogoutCleanupDeps,
  options: PrepareLogoutOptions = {},
): Promise<LogoutCleanupResult> {
  let pending = await deps.countPending();
  let lost = 0;

  // Hors ligne, drainer ne servirait a rien: on ne consomme pas le budget de
  // tentatives de la file pour une simple deconnexion.
  if (pending > 0 && deps.isOnline()) {
    const result = await deps.drain();
    lost = result.lost;
    pending = await deps.countPending();
  }

  if ((pending > 0 || lost > 0) && !options.force) {
    // On ne purge RIEN et on ne deconnecte pas: soit il reste des commandes a
    // envoyer, soit certaines viennent d'etre perdues et l'operateur doit
    // l'apprendre maintenant, pas decouvrir un trou en caisse en fin de service.
    return { blocked: true, pending, lost };
  }

  // Le cache de LECTURE part dans tous les cas, y compris en forcage: c'est lui
  // qui exposerait le chiffre d'affaires et les clients au suivant. La file, non.
  await deps.deleteQueryCache();
  return { blocked: false, pending, lost };
}

/** Supprime la base de cache de lecture. Resout meme si la suppression est bloquee. */
export function deleteQueryCacheDb(): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve();

  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(QUERY_CACHE_DB);
    // `onblocked` se declenche quand un autre onglet garde la base ouverte. On
    // resout quand meme: bloquer la deconnexion pour un cache de lecture serait
    // pire que de laisser la suppression se terminer plus tard.
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
