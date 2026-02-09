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
        sameSite: 'lax',
      },
    },
  );
}
