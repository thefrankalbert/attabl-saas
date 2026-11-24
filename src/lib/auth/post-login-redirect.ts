/**
 * Ou envoyer l'utilisateur apres connexion quand la page de connexion porte un
 * `?redirect=` (pose par le proxy ou par la page de paiement).
 *
 * Le parametre vient de l'URL, donc de n'importe qui: il n'est suivi que s'il
 * designe une page INTERNE et coherente avec la destination par defaut du
 * compte. Tout le reste retombe sur cette destination par defaut.
 *
 *   - `/checkout?...` : toujours suivi (la page revalide plan et session);
 *   - un chemin SOUS la destination par defaut (`/sites/<slug>/admin/orders`
 *     quand le compte arrive sur `/sites/<slug>/admin`) : suivi;
 *   - la forme sous-domaine `/admin/orders` : ramenee sous la destination par
 *     defaut, car la connexion se fait sur le domaine principal;
 *   - un compte renvoye a `/onboarding` y reste: il doit finir son parcours.
 */
const BASE = 'http://interne.invalid';
const MAX_LENGTH = 512;

function parseInternalPath(requested: string | null | undefined): URL | null {
  if (!requested || requested.length > MAX_LENGTH) return null;
  // Un seul `/` en tete: `//hote` et `/\hote` sortent du site.
  if (!requested.startsWith('/') || requested.startsWith('//') || requested.includes('\\')) {
    return null;
  }
  // Caracteres de controle (retour chariot, tabulation): refuses.
  if (/[\u0000-\u001f\u007f]/.test(requested)) return null;
  try {
    const url = new URL(requested, BASE);
    return url.origin === BASE ? url : null;
  } catch {
    return null;
  }
}

function isUnder(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

export function resolvePostLoginRedirect(
  defaultDestination: string,
  requested: string | null | undefined,
): string {
  const url = parseInternalPath(requested);
  if (!url) return defaultDestination;
  if (isUnder(defaultDestination, '/onboarding')) return defaultDestination;

  const target = `${url.pathname}${url.search}`;
  if (url.pathname === '/checkout') return target;
  if (isUnder(url.pathname, defaultDestination)) return target;

  // Forme sous-domaine (`/admin/...`), hors consoles plateforme.
  const tenantAdmin = /^\/sites\/[^/]+\/admin$/.test(defaultDestination);
  if (
    tenantAdmin &&
    isUnder(url.pathname, '/admin') &&
    !isUnder(url.pathname, '/admin/tenants') &&
    !isUnder(url.pathname, '/admin/platform')
  ) {
    return `${defaultDestination}${url.pathname.slice('/admin'.length)}${url.search}`;
  }

  return defaultDestination;
}
