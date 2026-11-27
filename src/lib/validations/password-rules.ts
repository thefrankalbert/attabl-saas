/**
 * Regles du mot de passe, SANS zod: ce fichier est charge par les pages de
 * connexion et d'inscription, ou importer common.schema faisait venir zod entier
 * (34 Ko compresses) pour une seule regle (budget Lighthouse depasse le
 * 2026-11-24). common.schema les reexporte et s'en sert pour passwordSchema.
 */

// Mot de passe: memes regles que la politique Auth de la production (reglee le
// 2026-06-28: 12 caracteres minimum, minuscule, majuscule, chiffre et symbole),
// pour que le site refuse lui-meme ce que Supabase refuserait. Seul le controle
// des mots de passe pirates (HIBP, actif depuis le 2026-06-30) reste cote
// Supabase: il ne se verifie pas ici (voir signup.service, refus weak_password).
// La liste locale ecarte en plus les plus repandus en francais et en anglais.
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

/** Longueur minimale de la politique Auth de la production. */
const PASSWORD_MIN_LENGTH = 12;

/**
 * Plafond de GoTrue: 72 OCTETS (limite de bcrypt, supabase/auth
 * `internal/api/password.go:32`, refus `validation_failed`). GoTrue ne le teste
 * qu'APRES l'existence de l'adresse: au-dela, une adresse neuve recevait un
 * refus a part (contre-audit 4). Le site refuse donc lui-meme, a l'identique
 * pour toutes les adresses.
 */
const PASSWORD_MAX_BYTES = 72;

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Au-dela du plafond de GoTrue (72 octets): l'interface l'annonce avant l'envoi. */
export function isPasswordTooLong(value: string): boolean {
  return utf8Bytes(value) > PASSWORD_MAX_BYTES;
}

/**
 * Symboles reconnus par Supabase Auth pour l'exigence
 * `lower_upper_letters_digits_symbols`, recopies EXACTEMENT. Source: depot
 * supabase/cli, `apps/cli/src/command-internal/password-requirements.ts:14`
 * (commit afc7d472), litteral envoye a GoTrue, decoupe sur `:` par
 * `PasswordRequiredCharacters.Decode` (supabase/auth `internal/conf/configuration.go:302`,
 * `\:` = deux-points litteral) puis teste par `strings.ContainsAny`
 * (`internal/api/password.go:47`). Une espace ou une lettre accentuee n'en est
 * pas un.
 */
export const PASSWORD_SYMBOLS = '!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~';

/** Regles du mot de passe, dans l'ordre ou l'interface les annonce. */
export const PASSWORD_RULES = ['length', 'lower', 'upper', 'digit', 'symbol'] as const;
export type PasswordRule = (typeof PASSWORD_RULES)[number];

const RULE_TESTS: Record<PasswordRule, (v: string) => boolean> = {
  // GoTrue compte les caracteres (runes), pas les unites UTF-16.
  length: (v) => [...v].length >= PASSWORD_MIN_LENGTH,
  lower: (v) => /[a-z]/.test(v),
  upper: (v) => /[A-Z]/.test(v),
  digit: (v) => /[0-9]/.test(v),
  symbol: (v) => [...v].some((c) => PASSWORD_SYMBOLS.includes(c)),
};

/** Toutes les regles que le mot de passe ne respecte pas encore (liste vide = conforme). */
export function missingPasswordRules(value: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !RULE_TESTS[rule](value));
}

/**
 * Messages du schema: des CODES, traduits par l'interface (fr-FR, en-US).
 * `PASSWORD_RULES:length,upper` nomme TOUTES les regles manquantes d'un coup.
 */
const PASSWORD_RULES_ISSUE = 'PASSWORD_RULES:';
const PASSWORD_TOO_LONG = 'PASSWORD_TOO_LONG';
const PASSWORD_TOO_COMMON = 'PASSWORD_TOO_COMMON';

export type PasswordIssue =
  { kind: 'rules'; missing: PasswordRule[] } | { kind: 'tooLong' } | { kind: 'tooCommon' };

/** Lit un message du schema; `null` si ce n'est pas un code de mot de passe. */
export function parsePasswordIssue(message: string | null | undefined): PasswordIssue | null {
  if (!message) return null;
  if (message === PASSWORD_TOO_LONG) return { kind: 'tooLong' };
  if (message === PASSWORD_TOO_COMMON) return { kind: 'tooCommon' };
  if (!message.startsWith(PASSWORD_RULES_ISSUE)) return null;
  const missing = message
    .slice(PASSWORD_RULES_ISSUE.length)
    .split(',')
    .filter((r): r is PasswordRule => (PASSWORD_RULES as readonly string[]).includes(r));
  return missing.length ? { kind: 'rules', missing } : null;
}

/** Code du premier probleme du mot de passe, ou `null` s'il est conforme. */
export function passwordIssueMessage(value: string): string | null {
  if (isPasswordTooLong(value)) return PASSWORD_TOO_LONG;
  const missing = missingPasswordRules(value);
  if (missing.length) return `${PASSWORD_RULES_ISSUE}${missing.join(',')}`;
  if (COMMON_PASSWORDS.has(value.toLowerCase())) return PASSWORD_TOO_COMMON;
  return null;
}
