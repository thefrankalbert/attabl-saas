import { FREEZE_REASONS } from './freeze-reason';
import { isLockedOnlyByLapsedTrial, tenantLockReason, type TenantLockRow } from './tenant-lock';

/**
 * Que peut voir le convive ? UNE seule definition, reutilisee par la vitrine
 * (layout + pages) et par le bandeau admin.
 *
 * DECISION PRODUIT (proprietaire, 2026-11-09). Un essai qui se termine sans
 * abonnement ne coupe pas la carte d'un coup: pendant 7 jours apres
 * `trial_ends_at`, la vitrine montre la carte en LECTURE SEULE (aucune
 * commande possible). Au-dela, elle est indisponible, comme aujourd'hui.
 *
 * La grace ne vaut QUE pour la fin d'essai:
 *   - essai expire pas encore gele par le cron (`isTrialLapsed`), restaurant
 *     toujours actif;
 *   - ou gel pose par le cron avec la cause `trial_expired`.
 * Une suspension plateforme (`suspended_at`), un gel pour une autre cause
 * (litige, impaye, remboursement...), un restaurant desactive pour une autre
 * raison: AUCUNE grace, la vitrine est fermee tout de suite.
 *
 * La prise de commande, elle, reste refusee des `trial_ends_at` par
 * `tenantLockReason`: la lecture seule ne rouvre rien cote serveur.
 */

/** Duree pendant laquelle la carte reste visible apres la fin de l'essai. */
export const STOREFRONT_GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type StorefrontAccess = 'open' | 'read_only' | 'closed';

export interface StorefrontAccessRow extends TenantLockRow {
  /** Lisible en service_role seulement (cache tenant). Absente = cause inconnue = pas de grace. */
  freeze_reason?: string | null;
}

/** Fin de la lecture seule, en millisecondes. Le seul calcul de date de la regle. */
export function storefrontGraceEndsAt(trialEndsAt: string): number {
  return new Date(trialEndsAt).getTime() + STOREFRONT_GRACE_DAYS * DAY_MS;
}

/** L'acces est-il coupe PAR LA FIN DE L'ESSAI, et rien d'autre ? */
function lockedByTrialEnd(row: StorefrontAccessRow, now: number): boolean {
  if (row.subscription_status === 'frozen') {
    return row.freeze_reason === FREEZE_REASONS.TRIAL_EXPIRED;
  }
  return isLockedOnlyByLapsedTrial(row, now);
}

export function storefrontAccess(
  row: StorefrontAccessRow,
  now: number = Date.now(),
): StorefrontAccess {
  if (row.suspended_at) return 'closed';
  if (tenantLockReason(row, now) === null) return 'open';
  if (!row.trial_ends_at || !lockedByTrialEnd(row, now)) return 'closed';
  return now < storefrontGraceEndsAt(row.trial_ends_at) ? 'read_only' : 'closed';
}

/**
 * Jours de carte visible restants (arrondi au jour superieur), a n'afficher que
 * pour une vitrine en lecture seule (`storefrontAccess` === 'read_only').
 */
export function menuVisibleDaysLeft(trialEndsAt: string, now: number = Date.now()): number {
  return Math.ceil((storefrontGraceEndsAt(trialEndsAt) - now) / DAY_MS);
}
