import { signPayload, verifyPayload } from './signed-payload';

/**
 * Jeton d'une etape du changement d'adresse d'un membre (A-09).
 *
 * Le changement exige l'accord des DEUX adresses, en chaine: l'adresse ACTUELLE
 * approuve d'abord (etape `current`), puis un second lien part vers la NOUVELLE
 * adresse (etape `new`) dont l'approbation applique le changement.
 *
 * Le jeton est signe (HMAC-SHA256) et lie:
 *  - au compte, a l'adresse actuelle et a la nouvelle adresse (devient inutilisable
 *    des que l'adresse a change);
 *  - au restaurant demandeur et a la ligne admin_users du demandeur, relus
 *    a la confirmation (le demandeur peut avoir perdu ses droits entre-temps);
 *  - a un nonce stocke cote serveur (app_metadata du compte): une nouvelle
 *    demande remplace le nonce et rend toutes les precedentes caduques.
 * Il expire en 24 h.
 */

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const LABEL = 'attabl:email-change:v2:';

export type EmailChangeStep = 'current' | 'new';

export interface EmailChangeClaims {
  userId: string;
  fromEmail: string;
  toEmail: string;
  tenantId: string;
  requesterId: string;
  nonce: string;
  step: EmailChangeStep;
}

export function signEmailChangeToken(claims: EmailChangeClaims, now: number = Date.now()): string {
  return signPayload(
    LABEL,
    {
      ...claims,
      fromEmail: claims.fromEmail.trim().toLowerCase(),
      toEmail: claims.toEmail.trim().toLowerCase(),
    },
    TOKEN_TTL_MS,
    now,
  );
}

function isClaims(v: Record<string, unknown>): v is Record<string, unknown> & EmailChangeClaims {
  return (
    typeof v.userId === 'string' &&
    typeof v.fromEmail === 'string' &&
    typeof v.toEmail === 'string' &&
    typeof v.tenantId === 'string' &&
    typeof v.requesterId === 'string' &&
    typeof v.nonce === 'string' &&
    (v.step === 'current' || v.step === 'new')
  );
}

/** Renvoie les revendications si la signature et la date sont bonnes, sinon null. */
export function verifyEmailChangeToken(
  token: string,
  now: number = Date.now(),
): EmailChangeClaims | null {
  const claims = verifyPayload(LABEL, token, now);
  if (!claims || !isClaims(claims)) return null;
  return {
    userId: claims.userId,
    fromEmail: claims.fromEmail,
    toEmail: claims.toEmail,
    tenantId: claims.tenantId,
    requesterId: claims.requesterId,
    nonce: claims.nonce,
    step: claims.step,
  };
}
