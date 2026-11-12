import { z } from 'zod';

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

// Mot de passe (audit C-006, decision du proprietaire 2026-11-12): 8 caracteres
// minimum dont au moins un chiffre ou un symbole, et pas un mot de passe connu.
// La liste couvre les plus repandus en francais et en anglais; la protection
// complete est HIBP, active sur le Supabase de production depuis le 2026-06-30.
const COMMON_PASSWORDS = new Set([
  'motdepasse',
  'motdepasse1',
  'motdepasse123',
  'password',
  'password1',
  'password123',
  'azerty',
  'azerty123',
  'azertyuiop',
  'qwerty',
  'qwerty123',
  '12345678',
  '123456789',
  '1234567890',
  '00000000',
  '11111111',
  'abcd1234',
  'bonjour1',
  'bonjour123',
  'soleil123',
  'iloveyou1',
  'admin123',
  'welcome1',
  'attabl123',
  'restaurant1',
]);

export const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .max(100, 'Le mot de passe ne doit pas dépasser 100 caractères')
  .refine(
    (v) => /[0-9]/.test(v) || /[^A-Za-z0-9]/.test(v),
    'Ajoutez au moins un chiffre ou un symbole',
  )
  .refine(
    (v) => !COMMON_PASSWORDS.has(v.toLowerCase()),
    'Ce mot de passe est trop connu, choisissez-en un autre',
  );

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
