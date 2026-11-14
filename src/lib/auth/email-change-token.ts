import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Jeton de confirmation d'un changement d'adresse (A-09).
 *
 * Un administrateur qui change l'adresse d'un membre ne doit pas reecrire
 * l'identite du compte auth sur sa seule parole: la nouvelle adresse doit
 * prouver qu'elle recoit le courrier. Le jeton est signe (HMAC-SHA256) et lie
 * au compte, a l'adresse ACTUELLE et a la nouvelle adresse:
 *  - lie a l'adresse actuelle, il devient inutilisable des que l'adresse a
 *    change (usage unique de fait, aucune table a tenir);
 *  - il expire en 24 h;
 *  - la signature emploie une cle derivee du secret serveur existant, avec une
 *    etiquette propre a cet usage: un jeton de ce type ne vaut rien ailleurs.
 */

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const DOMAIN_LABEL = 'attabl:email-change:v1:';

export interface EmailChangeClaims {
  userId: string;
  fromEmail: string;
  toEmail: string;
}

interface SignedPayload extends EmailChangeClaims {
  exp: number;
}

function secretKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Missing signing secret for email change token');
  return key;
}

function sign(encodedPayload: string): Buffer {
  return createHmac('sha256', secretKey()).update(`${DOMAIN_LABEL}${encodedPayload}`).digest();
}

export function signEmailChangeToken(claims: EmailChangeClaims, now: number = Date.now()): string {
  const payload: SignedPayload = {
    userId: claims.userId,
    fromEmail: claims.fromEmail.trim().toLowerCase(),
    toEmail: claims.toEmail.trim().toLowerCase(),
    exp: now + TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded).toString('base64url')}`;
}

function isSignedPayload(value: unknown): value is SignedPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.userId === 'string' &&
    typeof v.fromEmail === 'string' &&
    typeof v.toEmail === 'string' &&
    typeof v.exp === 'number'
  );
}

/** Renvoie les revendications si la signature et la date sont bonnes, sinon null. */
export function verifyEmailChangeToken(
  token: string,
  now: number = Date.now(),
): EmailChangeClaims | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;

  const expected = sign(encoded);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isSignedPayload(payload) || payload.exp < now) return null;
  return { userId: payload.userId, fromEmail: payload.fromEmail, toEmail: payload.toEmail };
}
