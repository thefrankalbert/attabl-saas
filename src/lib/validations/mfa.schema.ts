import { z } from 'zod';

/**
 * Code a 6 chiffres d'une application d'authentification (TOTP, RFC 6238).
 *
 * Les espaces sont retires avant controle: plusieurs applications affichent
 * le code en deux groupes ("123 456") et le copier-coller les garde.
 */
export const mfaCodeSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{6}$/));

/** Verification d'un code: activation (facteur precis) ou connexion. */
export const mfaVerifySchema = z.object({
  code: mfaCodeSchema,
  factorId: z.string().uuid().optional(),
});

/** Desactivation: un code valide est exige. */
export const mfaDisableSchema = z.object({
  code: mfaCodeSchema,
});
