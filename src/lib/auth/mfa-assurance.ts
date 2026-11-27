import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Niveau d'assurance de la session (double authentification).
 *
 * POURQUOI PAS `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` SANS
 * ARGUMENT: la bibliotheque lit alors la session du COOKIE et y prend la liste
 * des facteurs (`session.user.factors`). Ce cookie appartient au navigateur:
 * un attaquant qui connait le mot de passe peut en retirer les facteurs et
 * obtenir `nextLevel = 'aal1'`, donc sauter la double authentification.
 *
 * Ici, chaque information vient d'une source verifiee par le serveur Auth:
 *   - les facteurs viennent de `auth.getUser()` (lecture fraiche cote serveur);
 *   - le niveau courant vient de la revendication `aal` du jeton, lue par
 *     `auth.getClaims()`, qui verifie la signature (ou appelle getUser pour
 *     une cle symetrique) avant de rendre les revendications.
 */
export type AssuranceLevel = 'aal1' | 'aal2';

type FactorCarrier = Pick<User, 'factors'>;

/** Vrai si le compte a au moins un facteur VERIFIE (application d'authentification). */
export function hasVerifiedFactor(user: FactorCarrier | null | undefined): boolean {
  return (user?.factors ?? []).some((f) => f.status === 'verified');
}

/**
 * Niveau `aal` du jeton de la session courante, verifie. `null` si la lecture
 * echoue: l'appelant doit alors traiter la session comme NON renforcee.
 */
export async function currentAssuranceLevel(
  supabase: Pick<SupabaseClient, 'auth'>,
): Promise<AssuranceLevel | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data) return null;
    const aal: unknown = data.claims.aal;
    return aal === 'aal1' || aal === 'aal2' ? aal : null;
  } catch {
    return null;
  }
}

/** Refus d'une operation authentifiee faite sans le code (session aal1). */
export const MFA_REQUIRED_MESSAGE = 'Double authentification requise';
/** Code stable du refus, pour les routes et pages qui le traduisent. */
export const MFA_REQUIRED_CODE = 'MFA_REQUIRED';

/**
 * LA regle des operations authentifiees (routes d'API, Server Actions): un
 * compte qui a un facteur verifie n'agit qu'en session aal2. Un compte sans
 * facteur n'est pas concerne (vrai sans appel de plus). ECHEC FERME: niveau
 * illisible pour un compte avec facteur -> faux.
 *
 * `user` DOIT venir d'un `auth.getUser()` deja fait par l'appelant. Seules
 * exceptions, listees dans src/__tests__/mfa-entrypoints.test.ts: les actions
 * de /auth/mfa (atteindre aal2) et la deconnexion (sortir).
 */
export async function isMfaSatisfied(
  supabase: Pick<SupabaseClient, 'auth'>,
  user: FactorCarrier,
): Promise<boolean> {
  if (!hasVerifiedFactor(user)) return true;
  return (await currentAssuranceLevel(supabase)) === 'aal2';
}

/**
 * Ce que doit faire une page protegee pour ce compte.
 *   - `ok`: rien a faire;
 *   - `challenge`: un facteur existe mais la session n'est pas aal2 -> /auth/mfa;
 *   - `enroll`: aucun facteur alors que la page l'exige (super admin) -> /auth/mfa.
 */
export type MfaGateDecision = 'ok' | 'challenge' | 'enroll';

export function decideMfaGate(input: {
  hasFactor: boolean;
  level: AssuranceLevel | null;
  requireEnrollment: boolean;
}): MfaGateDecision {
  if (input.hasFactor) return input.level === 'aal2' ? 'ok' : 'challenge';
  return input.requireEnrollment ? 'enroll' : 'ok';
}

/**
 * Ce que montre la page /auth/mfa. Construite pour ne JAMAIS renvoyer vers une
 * page qui la renverrait ici:
 *   - pas de session -> connexion (page publique);
 *   - facteur + aal2 -> destination (les gardes laissent passer aal2);
 *   - facteur + aal1 -> formulaire de code (pas de redirection);
 *   - aucun facteur + compte qui doit en avoir un -> activation (pas de redirection);
 *   - aucun facteur sinon -> destination (les gardes ne demandent rien sans facteur).
 */
export type MfaPageDecision = 'login' | 'continue' | 'challenge' | 'enroll';

export function decideMfaPage(input: {
  signedIn: boolean;
  hasFactor: boolean;
  level: AssuranceLevel | null;
  mustEnroll: boolean;
}): MfaPageDecision {
  if (!input.signedIn) return 'login';
  if (input.hasFactor) return input.level === 'aal2' ? 'continue' : 'challenge';
  return input.mustEnroll ? 'enroll' : 'continue';
}
