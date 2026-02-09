import { z } from 'zod';

/**
 * Zod schemas for checkout/billing validation.
 * Used in /api/create-checkout-session route.
 */

export const createCheckoutSchema = z.object({
  plan: z.enum(['essentiel', 'premium'], {
    error: 'Plan invalide. Choisissez essentiel ou premium.',
  }),
  billingInterval: z.enum(['monthly', 'yearly']).optional().default('monthly'),
  tenantId: z.string().uuid('Tenant ID invalide'),
  email: z.string().email('Email invalide'),
});

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
