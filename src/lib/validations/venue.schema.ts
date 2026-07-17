import { z } from 'zod';

/**
 * Validation d'un espace de restauration (table `venues`).
 * "Espace" cote UI ; `venue` cote DB/code.
 */
export const venueNameSchema = z
  .string()
  .trim()
  .min(1, 'Le nom de l espace est requis.')
  .max(60, 'Le nom ne peut pas depasser 60 caracteres.');

export const createVenueSchema = z.object({
  name: venueNameSchema,
});

export const renameVenueSchema = z.object({
  id: z.string().uuid('Identifiant invalide.'),
  name: venueNameSchema,
});

export const deactivateVenueSchema = z.object({
  id: z.string().uuid('Identifiant invalide.'),
});

export type CreateVenueInput = z.infer<typeof createVenueSchema>;
export type RenameVenueInput = z.infer<typeof renameVenueSchema>;
export type DeactivateVenueInput = z.infer<typeof deactivateVenueSchema>;
