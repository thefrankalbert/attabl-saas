/**
 * Delai maximal d'une requete de lecture de l'admin (stock, fournisseurs).
 *
 * Sans lui, une requete qui ne repond jamais laissait l'ecran sur "Chargement..."
 * sans message: TanStack ne voit une erreur qu'a la fin du delai du navigateur.
 *  *
 * 20 secondes, pas moins: les restaurants travaillent souvent sur un reseau
 * mobile lent, et couper trop tot afficherait une erreur la ou il suffisait
 * d'attendre. Avec une seule reprise (`retry: 1`), l'etat d'erreur et son
 * bouton "Reessayer" apparaissent en moins d'une minute au pire.
 */
const QUERY_TIMEOUT_MS = 20_000;

/** Signal d'annulation au bout de QUERY_TIMEOUT_MS; undefined si le navigateur ne sait pas faire. */
export function queryTimeoutSignal(): AbortSignal | undefined {
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
    return undefined;
  }
  return AbortSignal.timeout(QUERY_TIMEOUT_MS);
}
