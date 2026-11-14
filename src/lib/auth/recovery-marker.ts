import { signPayload, verifyPayload } from './signed-payload';

/**
 * Marqueur de session de reinitialisation (A-06).
 *
 * Pose en cookie httpOnly par /auth/callback UNIQUEMENT apres la verification
 * d'un jeton de recuperation. Le changement de mot de passe par la page de
 * reinitialisation n'est accepte que si ce marqueur existe, correspond a la
 * session courante, et n'a pas expire: une session ordinaire (connexion par mot
 * de passe, OAuth) ne suffit plus a changer le mot de passe par ce chemin.
 */

export const RECOVERY_MARKER_COOKIE = 'attabl_recovery';
export const RECOVERY_MARKER_TTL_SECONDS = 15 * 60;
const LABEL = 'attabl:recovery-marker:v1:';

export function signRecoveryMarker(userId: string, now: number = Date.now()): string {
  return signPayload(LABEL, { userId }, RECOVERY_MARKER_TTL_SECONDS * 1000, now);
}

/** Renvoie l'identifiant du compte du marqueur, ou null s'il est invalide ou expire. */
export function verifyRecoveryMarker(token: string, now: number = Date.now()): string | null {
  let claims: Record<string, unknown> | null;
  try {
    claims = verifyPayload(LABEL, token, now);
  } catch {
    return null;
  }
  return claims && typeof claims.userId === 'string' ? claims.userId : null;
}
