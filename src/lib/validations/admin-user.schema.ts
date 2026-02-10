import { z } from 'zod';

/**
 * Zod schema for admin user creation.
 * Validates input before creating auth user + admin_users record.
 */

export const createAdminUserSchema = z.object({
  email: z
    .string()
    .email('Adresse email invalide')
    .max(255, "L'email ne doit pas dépasser 255 caractères"),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .max(100, 'Le mot de passe ne doit pas dépasser 100 caractères'),
  full_name: z
    .string()
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .max(100, 'Le nom ne doit pas dépasser 100 caractères'),
  role: z.enum(['owner', 'admin', 'manager', 'cashier', 'chef', 'waiter'], {
    message: 'Le rôle est requis',
  }),
});

export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;
