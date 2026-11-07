import { z } from 'zod';

/**
 * Zod schemas for checkout/billing validation.
 * Used in /api/create-checkout-session route.
 */

/**
 * Simplified checkout body schema - tenantId and email are derived from session.
 * Used in /api/create-checkout-session route.
 */
export const checkoutBodySchema = z.object({
  plan: z.enum(['starter', 'pro', 'business'], {
    error: 'Plan invalide. Choisissez starter, pro ou business.',
  }),
  billingInterval: z.enum(['monthly', 'semiannual', 'yearly']).optional().default('monthly'),
  /**
   * Restaurant a abonner. Designe la cible; l'autorisation est verifiee
   * cote serveur (appartenance active + role) dans `resolveCheckoutTenant`.
   * Sans lui, un proprietaire de plusieurs etablissements se faisait facturer
   * le plus ancien.
   */
  tenantSlug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Identifiant de restaurant invalide')
    .optional(),
});

/**
 * Query params schema for verify-checkout.
 * Used in /api/verify-checkout route.
 */
export const verifyCheckoutQuerySchema = z.object({
  session_id: z.string().min(1, 'Session ID requis'),
});

/**
 * Schema for updating an existing subscription (plan change / migration).
 * The price ID is resolved server-side from plan + interval (single source of truth).
 * Used in /api/update-subscription route.
 */
export const updateSubscriptionSchema = z.object({
  plan: z.enum(['starter', 'pro', 'business'], {
    error: 'Plan invalide. Choisissez starter, pro ou business.',
  }),
  billingInterval: z.enum(['monthly', 'semiannual', 'yearly']).optional().default('monthly'),
});
