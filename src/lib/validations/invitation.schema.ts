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

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  full_name: z.string().min(2, 'Le nom doit contenir au moins 2 caracteres').max(100).optional(),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caracteres')
    .max(100)
    .optional(),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
