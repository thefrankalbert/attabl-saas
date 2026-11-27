import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { MfaStep } from '@/components/auth/MfaStep';
import { createClient } from '@/lib/supabase/server';
import { currentAssuranceLevel, decideMfaPage, hasVerifiedFactor } from '@/lib/auth/mfa-assurance';
import { isSuperAdmin } from '@/lib/auth/require-super-admin';
import { resolveMfaNext } from '@/lib/auth/post-login-redirect';

export const dynamic = 'force-dynamic';

interface MfaPageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}

/**
 * Double authentification apres le mot de passe ou le retour OAuth (K6.13).
 *
 * Tout se decide ici, cote serveur, depuis `auth.getUser()` (facteurs) et le
 * niveau verifie du jeton: jamais depuis ce que dit le navigateur. Les regles
 * de `decideMfaPage` excluent la boucle de redirection (voir ses tests).
 */
export default async function MfaPage({ searchParams }: MfaPageProps) {
  const params = await searchParams;
  const next = resolveMfaNext(typeof params.next === 'string' ? params.next : null);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const hasFactor = hasVerifiedFactor(user);
  const decision = decideMfaPage({
    signedIn: !!user,
    hasFactor,
    level: user && hasFactor ? await currentAssuranceLevel(supabase) : null,
    mustEnroll: !!user && !hasFactor && (await isSuperAdmin(supabase, user.id)),
  });

  if (decision === 'login') redirect('/login');
  if (decision === 'continue') redirect(next);

  return (
    <AuthShell scene="confirm">
      <MfaStep mode={decision} next={next} />
    </AuthShell>
  );
}
