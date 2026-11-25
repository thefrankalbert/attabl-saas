import { z } from 'zod';

/**
 * Jeton de desinscription tel qu'il arrive dans l'URL: `<charge>.<signature>`,
 * deux blocs base64url. La signature est verifiee ensuite (HMAC); ce schema ne
 * fait que borner la forme et la longueur avant tout traitement.
 */
export const unsubscribeTokenSchema = z
  .string()
  .min(20)
  .max(1000)
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

export const unsubscribeQuerySchema = z.object({ token: unsubscribeTokenSchema });

/** Corps impose par la RFC 8058 pour la desinscription en un clic. */
export const unsubscribeOneClickBodySchema = z.object({
  'List-Unsubscribe': z.literal('One-Click'),
});
