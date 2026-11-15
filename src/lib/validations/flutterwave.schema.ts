import { z } from 'zod';

/** Corps de POST /api/billing/flutterwave/checkout: plan et periode, jamais le restaurant (derive de la session). */
export const flutterwaveCheckoutBodySchema = z.object({
  plan: z.enum(['starter', 'pro', 'business'], {
    error: 'Plan invalide. Choisissez starter, pro ou business.',
  }),
  billingInterval: z.enum(['monthly', 'yearly']).optional().default('monthly'),
});

/** Corps de POST /api/billing/flutterwave/confirm: l'identifiant que Flutterwave ajoute a l'URL de retour. */
export const flutterwaveConfirmBodySchema = z.object({
  transactionId: z.coerce.number().int().positive(),
});
