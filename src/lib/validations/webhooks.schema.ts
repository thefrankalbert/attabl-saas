import { z } from 'zod';

/**
 * Evenement de webhook Resend (format Standard Webhooks). Seuls les champs lus
 * sont decrits; le reste du corps est ignore. `to` est borne: un evenement
 * concerne un e-mail, et un e-mail d'ATTABL a peu de destinataires.
 */
export const resendWebhookEventSchema = z.object({
  type: z.string().min(1).max(100),
  data: z
    .object({
      to: z.array(z.string().max(320)).max(50).optional(),
      bounce: z
        .object({
          type: z.string().max(50).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type ResendWebhookEvent = z.infer<typeof resendWebhookEventSchema>;
