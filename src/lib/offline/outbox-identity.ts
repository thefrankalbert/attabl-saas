/**
 * Identite du poste au moment de la mise en file (OFF-07).
 *
 * La file d'attente est un singleton global lie a l'APPAREIL, sans notion de
 * session. Le corps mis en file ne porte volontairement ni tenant_id ni identite
 * serveur: tout est derive de la session AU MOMENT DU REJEU. Tant que c'est la
 * meme personne, c'est correct. Ca cesse de l'etre des que la session change
 * entre la mise en file et le rejeu.
 *
 * Scenario: Fatou prend 3 commandes hors ligne, termine son service. Sa session
 * expire. Ibrahim se connecte sur la meme tablette, le reseau revient, le drain
 * part avec SA session: les 3 commandes sont enregistrees avec
 * `server_id = Ibrahim`. Le rapport de performance par serveur et le calcul des
 * pourboires sont faux.
 *
 * Variante plus grave, sur une tablette utilisee par deux etablissements du meme
 * groupe: le tenant derive est celui d'Ibrahim, les menu_item_id de Fatou n'y
 * existent pas, le serveur repond 400 "articles plus disponibles",
 * `classifyStatus` classe en `permanent` et les 3 commandes sont SUPPRIMEES
 * definitivement.
 *
 * Ce module ne fait que retenir qui est aux commandes. Le cloisonnement lui-meme
 * est applique par `drain`, qui ne rejoue que les entrees de la session courante,
 * et par /api/orders/pos qui repond 409 (transitoire, on garde) au lieu de 400
 * (permanent, on detruit) quand le tenant ne correspond pas.
 *
 * Volontairement un module et pas un React context: `submitOrder` est appele
 * depuis du code non-React (rejeu du service worker inclus).
 */

export interface OutboxIdentity {
  userId: string;
  tenantId: string;
}

let current: OutboxIdentity | null = null;

/** Positionne l'identite courante. Appele par le shell admin au montage. */
export function setOutboxIdentity(identity: OutboxIdentity | null): void {
  current = identity;
}

/** Identite courante, ou null si inconnue (SSR, page publique). */
export function getOutboxIdentity(): OutboxIdentity | null {
  return current;
}
