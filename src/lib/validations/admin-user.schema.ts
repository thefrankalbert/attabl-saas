import { z } from 'zod';
import { permissionOverridesSchema, postesSchema } from './invitation.schema';

/**
 * Schema for changing a member's email (actionUpdateUserEmail).
 * Remplace un test regex artisanal: toute entree utilisateur passe par Zod.
 */
export const updateUserEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Adresse email invalide')
    .max(255, "L'email ne doit pas depasser 255 caracteres"),
});

/**
 * Schema for updating an existing admin user.
 * Used in admin server actions.
 */
export const updateAdminUserSchema = z.object({
  postes: postesSchema.optional(),
  full_name: z.string().min(2).max(100).optional(),
  is_active: z.boolean().optional(),
  // Reglage par personne : `null` efface tout reglage (le membre retombe sur
  // ses postes). Cles validees contre le catalogue, valeurs booleennes.
  permission_overrides: permissionOverridesSchema.nullable().optional(),
});
