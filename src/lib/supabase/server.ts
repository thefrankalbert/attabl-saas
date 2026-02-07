import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            // En production, on force le domaine racine pour partager le cookie entre sous-domaines
            if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_APP_DOMAIN) {
              options.domain = `.${process.env.NEXT_PUBLIC_APP_DOMAIN}`;
              options.sameSite = 'lax';
            }
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Handle error (route handler context)
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Handle error
          }
        },
      },
    }
  );
}
