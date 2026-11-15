import { timingSafeEqual } from 'node:crypto';

/**
 * Compare l'en-tete `verif-hash` au secret configure, en temps constant.
 * Les longueurs different -> refus immediat (`timingSafeEqual` leve sinon), ce
 * qui ne revele que la longueur, deja publique par construction.
 */
export function isValidWebhookHash(received: string | null, expected: string): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
