/**
 * Stockage d'onglet (sessionStorage) de l'administration.
 *
 * Sur le domaine principal, tous les restaurants sont servis sous
 * `/sites/<slug>/admin`: meme origine, donc meme sessionStorage. Sans le slug
 * dans la cle, le panier de caisse du restaurant A etait relu dans la caisse du
 * restaurant B apres un changement d'etablissement dans le meme onglet.
 * Sur un sous-domaine (`<slug>.attabl.com`), l'origine isole deja.
 */
const BASE_PREFIX = 'attabl:admin:';

/**
 * @param pathname Chemin a utiliser. Un composant passe `usePathname()`: pendant
 *   un rendu, `window.location` peut encore porter l'URL PRECEDENTE (Next ne la
 *   pousse qu'au commit). Hors rendu (gestionnaire d'evenement), l'omettre.
 */
export function adminStoragePrefix(pathname?: string | null): string {
  if (typeof window === 'undefined' && !pathname) return BASE_PREFIX;
  const path = pathname ?? window.location.pathname;
  const slug = path.match(/^\/sites\/([^/]+)\//)?.[1];
  return slug ? `${BASE_PREFIX}${slug}:` : BASE_PREFIX;
}

/**
 * Vide tout le stockage d'onglet de l'administration, tous restaurants
 * confondus. A la deconnexion: sur un poste partage, le caissier suivant
 * retrouvait le panier et la cle d'idempotence du precedent.
 */
export function clearAdminSessionStorage(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(BASE_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    /* stockage indisponible: rien a vider */
  }
}
