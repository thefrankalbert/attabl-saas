import { z } from 'zod';

const INVITABLE_ROLES = ['admin', 'manager', 'cashier', 'chef', 'waiter'] as const;

export const createInvitationSchema = z.object({
  email: z
    .string()
    .email('Adresse email invalide')
    .max(255, "L'email ne doit pas depasser 255 caracteres"),
  role: z.enum(INVITABLE_ROLES, {
    error: 'Role invalide (owner ne peut pas etre invite)',
  }),
  custom_permissions: z.record(z.string(), z.boolean()).optional(),
});

// Accept = create the account: full_name + password are REQUIRED. Keeping them
// optional let an empty mount-time call slip through to acceptInvitation() with
// no password, hitting auth.admin.createUser and wasting a rate-limit slot.
// Lightweight on-mount checks now use GET /api/invitations/validate instead.
export const acceptInvitationSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, 'Token invalide'),
  full_name: z.string().min(2, 'Le nom doit contenir au moins 2 caracteres').max(100),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caracteres').max(100),
});

// Token-only validation for the read-only on-mount check (no account creation).
export const validateInvitationSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, 'Token invalide'),
});
