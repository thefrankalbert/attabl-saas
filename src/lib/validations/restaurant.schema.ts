import { z } from 'zod';

export const ESTABLISHMENT_TYPES = [
  'restaurant',
  'hotel',
  'bar-cafe',
  'boulangerie',
  'dark-kitchen',
  'food-truck',
  'quick-service',
] as const;

// Pas de champ `plan`: un etablissement ajoute demarre en essai (si le compte y
// a encore droit) ou en attente d'abonnement. Une formule payante ne s'obtient
// que par un paiement abouti (webhook Stripe), jamais par le corps de la
// requete. z.object ignore une cle `plan` envoyee par un ancien client.
export const createRestaurantSchema = z.object({
  name: z.string().min(2, 'Minimum 2 caractères').max(100, 'Maximum 100 caractères'),
  type: z.enum(ESTABLISHMENT_TYPES, {
    error: "Type d'établissement invalide",
  }),
  slug: z
    .string()
    .min(2, 'Minimum 2 caractères')
    .max(50, 'Maximum 50 caractères')
    .regex(/^[a-z0-9-]+$/, 'Slug invalide : lettres minuscules, chiffres et tirets uniquement'),
});

export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;
