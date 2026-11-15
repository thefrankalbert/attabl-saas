/**
 * Durees de conservation des donnees personnelles. UNE SEULE source.
 *
 * Ces valeurs sont lues par deux endroits qui ne doivent jamais diverger:
 *   - le service de purge (`src/services/retention.service.ts`), qui les applique;
 *   - la politique de confidentialite (`/privacy`), qui les annonce.
 * Une duree annoncee et une duree appliquee qui different sont pires que pas de
 * duree du tout. Modifier une valeur ici change donc le texte public en meme
 * temps, sans autre edition.
 *
 * Valeurs par defaut choisies le 2026-11-15, a valider par le proprietaire.
 *
 * Ce qui n'est JAMAIS purge: les commandes (sans l'identite du convive), les
 * montants, le registre des paiements `payments` et les evenements Stripe. Ce
 * sont des pieces comptables que le droit commercial impose de garder des annees.
 */
export const RETENTION = {
  /** Nom, telephone et adresse de livraison d'un convive, apres la commande. */
  guestDataDays: 90,
  /** Sessions de connexion (elles portent une adresse IP). */
  sessionsDays: 90,
  /** Invitations expirees ou annulees, apres leur date d'expiration. */
  invitationsAfterExpiryDays: 30,
  /** Abonnements push d'un appareil jamais joint ni renouvele. */
  pushInactiveDays: 180,
  /** Journaux d'audit (restaurant et plateforme): 12 mois. */
  auditLogDays: 365,
  /** Donnees personnelles d'un restaurant clos, apres sa suppression. */
  closedTenantAnonymizeDays: 30,
  /**
   * Messages du formulaire de contact. Le formulaire n'enregistre RIEN en base:
   * le message arrive par e-mail. Cette duree est une regle de tri manuel de la
   * messagerie, pas une purge automatique.
   */
  contactMailDays: 365,
} as const;

/** Nombre de mois annonces pour une duree en jours (12 mois pour 365 jours). */
export function daysToMonths(days: number): number {
  return Math.round(days / 30.4375);
}
