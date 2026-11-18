import { z } from 'zod';

/**
 * Confirmation tapee avant une suppression de compte: le nom du restaurant
 * (proprietaire) ou l'adresse e-mail du compte (personnel). La comparaison
 * elle-meme est faite par le service, contre la valeur lue en base.
 */
export const accountDeletionSchema = z.object({
  confirmation: z
    .string()
    .trim()
    .min(1, 'Confirmation requise')
    .max(254, 'Confirmation trop longue'),
});
