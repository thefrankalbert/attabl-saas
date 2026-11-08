import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthFormSkeleton } from '@/components/auth/AuthFormSkeleton';
import { ClearSwCache } from '@/components/shared/ClearSwCache';
import { createClient } from '@/lib/supabase/server';
import { loadSessionMemberships } from '@/lib/auth/session-destination';
import { loginPageDestination } from '@/lib/auth/post-login-destination';
import { Suspense } from 'react';

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

/**
 * Session memorisee: un utilisateur deja connecte qui ouvre /login (icone de
 * l'app sur le telephone, favori, onglet rouvert) entre directement dans son
 * espace au lieu de revoir le formulaire.
 *
 * Deux cas gardent le formulaire, sinon boucle de redirection:
 * - un parametre `error` (le proxy renvoie ici un compte email NON confirme,
 *   qui est pourtant connecte: le renvoyer vers son espace le ferait
 *   rebondir indefiniment entre les deux);
 * - le meme compte non confirme arrivant sans parametre (meme condition que le
 *   proxy: fournisseur email sans `email_confirmed_at`).
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  if (!error) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const unconfirmedEmailAccount =
      !!user && !user.email_confirmed_at && user.app_metadata?.provider === 'email';

    if (user && !unconfirmedEmailAccount) {
      const memberships = await loadSessionMemberships(supabase, user.id);
      // Lookup failure, or an account with no access: show the form rather
      // than redirect on a guess (or into /unauthorized, a dead end).
      const destination = memberships ? loginPageDestination(memberships) : null;
      if (destination) redirect(destination);
    }
  }

  return (
    <AuthShell>
      <ClearSwCache />
      <Suspense fallback={<AuthFormSkeleton />}>
        <AuthForm mode="login" />
      </Suspense>
    </AuthShell>
  );
}
