/**
 * Regle pure, partagee par la caisse d'abonnement (checkout-tenant.ts) et le
 * changement de formule (/api/update-subscription, audit B15). Sortie de
 * checkout-tenant.ts pour ne pas tirer le client service_role dans une route
 * qui n'en a pas besoin.
 */
export type RefusDEtat = { ok: false; status: 404 | 409; error: string };

/**
 * Refus si un paiement n'ouvrirait rien. UNE seule definition pour les deux
 * branches, comme `refusDeRole`.
 *   - restaurant ferme (`deleted_at`): la branche sans cible ne le filtrait pas,
 *     et un restaurant ferme redevenait abonnable;
 *   - restaurant suspendu par la plateforme (`suspended_at`): le webhook ne leve
 *     pas cette suspension, l'argent serait pris pour un acces qui reste ferme.
 *     Meme regle que la voie Flutterwave (flutterwave-billing.service.ts).
 */
export function refusDEtat(
  tenant: { suspended_at: string | null; deleted_at: string | null } | null,
  allowSuspended: boolean,
): RefusDEtat | null {
  if (!tenant || tenant.deleted_at) {
    return { ok: false, status: 404, error: 'Restaurant non trouve' };
  }
  if (tenant.suspended_at && !allowSuspended) {
    return {
      ok: false,
      status: 409,
      error: 'Ce restaurant est suspendu. Contactez le support ATTABL pour le reactiver.',
    };
  }
  return null;
}
