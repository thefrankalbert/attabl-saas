import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Charge utile signee (HMAC-SHA256), avec date d'expiration.
 *
 * Sert aux jetons que le serveur emet et relit lui-meme (changement d'adresse,
 * marqueur de reinitialisation). La cle est le secret serveur existant, combinee
 * a une ETIQUETTE propre a chaque usage: un jeton d'un usage ne vaut rien pour un
 * autre. Leve si le secret manque (l'appelant decide du message d'erreur).
 */

function secretKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Missing signing secret');
  return key;
}

function sign(label: string, encodedPayload: string): Buffer {
  return createHmac('sha256', secretKey()).update(`${label}${encodedPayload}`).digest();
}

export function signPayload(
  label: string,
  claims: Record<string, unknown>,
  ttlMs: number,
  now: number = Date.now(),
): string {
  const encoded = Buffer.from(JSON.stringify({ ...claims, exp: now + ttlMs })).toString(
    'base64url',
  );
  return `${encoded}.${sign(label, encoded).toString('base64url')}`;
}

/** Renvoie les revendications (sans `exp`) si signature et date sont bonnes, sinon null. */
export function verifyPayload(
  label: string,
  token: string,
  now: number = Date.now(),
): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;

  const expected = sign(label, encoded);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const { exp, ...claims } = payload as Record<string, unknown>;
  if (typeof exp !== 'number' || exp < now) return null;
  return claims;
}
