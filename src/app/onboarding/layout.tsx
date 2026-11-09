import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadSessionMemberships } from '@/lib/auth/session-destination';
import { onboardingGateDestination } from '@/lib/auth/post-login-destination';

/**
 * The onboarding is shown ONCE per establishment.
 *
 * Nothing used to stop a finished owner from reaching /onboarding again: the
 * browser "back" button right after "Lancer" did it. The screen reopened on
 * the QR step, prefilled, and relaunching re-created a dining room with its
 * tables. Here, a user with no unfinished establishment is sent where a login
 * would send them.
 *
 * A specific finished establishment requested with `?site=` is handled by the
 * client (the state API reports `completed`), since a layout cannot read the
 * search params.
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy already sends anonymous visitors to /login; this is the fallback.
  if (!user) redirect('/login');

  const memberships = await loadSessionMemberships(supabase, user.id);

  // Lookup failure: render, never redirect on a guess. The page's own API calls
  // re-check everything server-side.
  if (memberships) {
    const destination = onboardingGateDestination(memberships);
    if (destination) redirect(destination);
  }

  return children;
}
