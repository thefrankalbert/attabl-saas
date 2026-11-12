import { z } from 'zod';
import { passwordSchema } from './common.schema';
import { PERMISSION_CODES } from '@/types/permission.types';

const PERMISSION_CODE_SET = new Set<string>(PERMISSION_CODES);

/**
 * Zod schema for admin user creation.
 * Validates input before creating auth user + admin_users record.
 */

export const createAdminUserSchema = z.object({
  // trim + lowercase comme updateUserEmailSchema: admin_users.email sert de cle
  // de resolution du compte a l'acceptation d'une invitation, et .eq() est
  // sensible a la casse en Postgres.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Adresse email invalide')
    .max(255, "L'email ne doit pas dépasser 255 caractères"),
  password: passwordSchema,
  full_name: z
    .string()
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .max(100, 'Le nom ne doit pas dépasser 100 caractères'),
  role: z.enum(['owner', 'admin', 'manager', 'cashier', 'chef', 'waiter'], {
    message: 'Le rôle est requis',
  }),
});

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
  role: z.enum(['owner', 'admin', 'manager', 'cashier', 'chef', 'waiter']).optional(),
  full_name: z.string().min(2).max(100).optional(),
  is_active: z.boolean().optional(),
  // Per-user permission overrides: a partial map of known codes -> boolean.
  // null clears every override so the member falls back to their role's
  // permissions. Keys are validated against the known set; values must be bool.
  custom_permissions: z
    .record(z.string(), z.boolean())
    .refine((perms) => Object.keys(perms).every((k) => PERMISSION_CODE_SET.has(k)), {
      message: 'Code de permission inconnu',
    })
    .nullable()
    .optional(),
});
