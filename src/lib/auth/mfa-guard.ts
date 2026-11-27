import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { redirectToMfa } from '@/lib/auth/redirect-to-main';
import { currentAssuranceLevel, decideMfaGate, hasVerifiedFactor } from '@/lib/auth/mfa-assurance';

/**
 * Garde de double authentification des pages et layouts serveur.
 *
 * `user` DOIT venir d'un `auth.getUser()` deja fait par l'appelant (facteurs
 * lus cote serveur). Un compte avec facteur et session aal1 est envoye sur
 * /auth/mfa; avec `requireEnrollment` (super administrateur), un compte SANS
 * facteur y est envoye aussi, pour l'activer. Le niveau n'est lu (un appel de
 * plus) que si le compte a un facteur.
 */
export async function enforceMfa(
  supabase: Pick<SupabaseClient, 'auth'>,
  user: Pick<User, 'factors'>,
  options: { next: string; requireEnrollment: boolean },
): Promise<void> {
  const hasFactor = hasVerifiedFactor(user);
  const level = hasFactor ? await currentAssuranceLevel(supabase) : null;
  const decision = decideMfaGate({
    hasFactor,
    level,
    requireEnrollment: options.requireEnrollment,
  });
  if (decision !== 'ok') redirectToMfa(options.next);
}

/**
 * Vrai si la session vaut une session renforcee: facteur verifie ET aal2.
 * Pour les operations "mode dieu" (actions et routes du super administrateur).
 */
export async function hasStrongSession(
  supabase: Pick<SupabaseClient, 'auth'>,
  user: Pick<User, 'factors'>,
): Promise<boolean> {
  if (!hasVerifiedFactor(user)) return false;
  return (await currentAssuranceLevel(supabase)) === 'aal2';
}
