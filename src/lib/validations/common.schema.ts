import { z } from 'zod';
import { passwordIssueMessage } from './password-rules';

// Telephone saisi a la main: chiffres, espaces, +, tirets, points, parentheses,
// au moins 6 chiffres. La chaine vide reste permise (champ facultatif efface).
export const phoneSchema = z
  .string()
  .trim()
  .max(20, 'Le téléphone ne doit pas dépasser 20 caractères')
  .refine(
    (v) => v === '' || (/^\(?\+?[0-9 ().-]+$/.test(v) && (v.match(/\d/g)?.length ?? 0) >= 6),
    'Numéro de téléphone invalide',
  );

export {
  isPasswordTooLong,
  missingPasswordRules,
  parsePasswordIssue,
  passwordIssueMessage,
  PASSWORD_RULES,
  PASSWORD_SYMBOLS,
  type PasswordIssue,
  type PasswordRule,
} from './password-rules';

export const passwordSchema = z.string().superRefine((value, ctx) => {
  const message = passwordIssueMessage(value);
  if (message) ctx.addIssue({ code: 'custom', message });
});

export const routeUuidSchema = z.string().uuid('Identifiant invalide');

export function parseRouteUuid(
  id: string,
): { ok: true; id: string } | { ok: false; error: string } {
  const result = routeUuidSchema.safeParse(id);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'Identifiant invalide';
    return { ok: false, error: message };
  }
  return { ok: true, id: result.data };
}
