import { z } from 'zod';

/**
 * Formes des reponses de l'API Flutterwave et du corps des webhooks.
 *
 * On ne valide QUE ce dont ATTABL se sert, et on tolere le reste (`loose`):
 * Flutterwave ajoute des champs sans prevenir, et refuser une reponse a cause
 * d'un champ inconnu ferait perdre un paiement reel.
 */

/** POST /v3/payments: le lien de la page de paiement heberge. */
export const paymentLinkResponseSchema = z.looseObject({
  status: z.literal('success'),
  data: z.looseObject({ link: z.url() }),
});

/** GET /v3/transactions/{id}/verify. `status` reste libre: c'est nous qui le jugeons. */
export const verifyTransactionResponseSchema = z.looseObject({
  status: z.string(),
  data: z.looseObject({
    id: z.number().int().positive(),
    tx_ref: z.string().min(1),
    status: z.string(),
    amount: z.number(),
    currency: z.string(),
  }),
});

/**
 * Corps d'un webhook. Seul `data.id` sert: tout le reste est RELU par l'API de
 * verification, jamais cru sur parole (le corps du webhook n'est qu'un signal).
 */
export const webhookPayloadSchema = z.looseObject({
  event: z.string().optional(),
  data: z.looseObject({ id: z.number().int().positive() }),
});

/**
 * GET /v3/transactions (liste): chaque element porte `id` en CHAINE dans les
 * exemples de la documentation (pas en nombre comme la verification): on le convertit.
 */
export const listTransactionsResponseSchema = z.looseObject({
  status: z.string(),
  data: z.array(
    z.looseObject({
      id: z.coerce.number().int().positive(),
      tx_ref: z.string().min(1),
      status: z.string(),
      amount: z.number(),
      currency: z.string(),
    }),
  ),
});

export type VerifiedTransaction = z.infer<typeof verifyTransactionResponseSchema>['data'];
