import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        domain:
          process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_APP_DOMAIN
            ? `.${process.env.NEXT_PUBLIC_APP_DOMAIN}`
            : undefined,
        // 'lax' (not 'strict'): the OAuth PKCE code-verifier cookie must survive the
        // cross-site top-level navigation back from Google/Supabase to /auth/callback.
        // 'strict' withholds it on that navigation, breaking exchangeCodeForSession.
        sameSite: 'lax',
      },
    },
  );
}
