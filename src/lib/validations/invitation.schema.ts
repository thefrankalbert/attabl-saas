import { z } from 'zod';

const INVITABLE_ROLES = ['admin', 'manager', 'cashier', 'chef', 'waiter'] as const;

export const createInvitationSchema = z.object({
  // trim + lowercase: l'adresse est la cle de resolution du compte existant a
  // l'acceptation (.eq() est sensible a la casse en Postgres) ET la cle du
  // garde anti-doublon des invitations pending, qui se contournait en changeant
  // simplement la casse.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Adresse email invalide')
    .max(255, "L'email ne doit pas depasser 255 caracteres"),
  role: z.enum(INVITABLE_ROLES, {
    error: 'Role invalide (owner ne peut pas etre invite)',
  }),
  custom_permissions: z.record(z.string(), z.boolean()).optional(),
});

// Accept: deux parcours derriere le meme jeton.
//  - nouvel employe (aucun compte): full_name + password sont indispensables,
//    et c'est acceptInvitation() qui les exige (ServiceError VALIDATION);
//  - titulaire d'un compte existant: ces deux champs sont IGNORES par le
//    service, qui exige a la place la session du titulaire. Les rendre
//    obligatoires ici forcait a saisir un mot de passe sans effet - un
//    mensonge d'interface - et rendait impossible l'adhesion par simple
//    session. Ils sont donc optionnels, bornes quand ils sont fournis.
// Le risque d'origine (appel vide au montage de la page qui brulait un jeton
// de rate-limit) est couvert autrement: la page utilise maintenant
// GET /api/invitations/validate pour sa verification au montage.
export const acceptInvitationSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, 'Token invalide'),
  full_name: z.string().min(2, 'Le nom doit contenir au moins 2 caracteres').max(100).optional(),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caracteres')
    .max(100)
    .optional(),
});

// Token-only validation for the read-only on-mount check (no account creation).
export const validateInvitationSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, 'Token invalide'),
});
