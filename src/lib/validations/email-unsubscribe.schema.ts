import { z } from 'zod';

/**
 * Jeton de desabonnement tel qu'il arrive (URL ou corps JSON). Seule sa forme
 * est verifiee ici; son authenticite l'est par readUnsubscribeToken. Une
 * adresse fait au plus 320 caracteres: son jeton tient largement en 512, un
 * jeton plus long est refuse sans aucun calcul.
 */
export const unsubscribeTokenSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/);

/** Corps JSON envoye par la page de desabonnement. */
export const unsubscribeRequestSchema = z
  .object({
    token: unsubscribeTokenSchema,
    action: z.enum(['unsubscribe', 'resubscribe']),
  })
  .strict();

export type UnsubscribeRequest = z.infer<typeof unsubscribeRequestSchema>;
