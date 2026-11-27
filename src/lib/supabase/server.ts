import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';

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
              // 'lax' (not 'strict') so the OAuth callback navigation from Google/Supabase
              // carries the auth cookies; 'strict' would break exchangeCodeForSession.
              options.sameSite = 'lax';
            }
            // Audit K3.9: `@supabase/ssr` ne pose pas `Secure` de lui-meme. En
            // production le site est servi en HTTPS seulement; hors production
            // (http://localhost) l'attribut est laisse tel quel.
            if (process.env.NODE_ENV === 'production') options.secure = true;
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Server Components cannot set cookies - this is expected.
            // Route Handlers CAN set cookies - if this fails there, log it.
            if (process.env.NODE_ENV === 'production') {
              logger.warn('Supabase server client: failed to set cookie', { name, error });
            }
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            // Meme domaine que set(): un cookie pose sur `.attabl.com` ne
            // s'efface que si l'effacement porte ce domaine. Sans lui, la
            // deconnexion laissait le jeton dans le navigateur.
            if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_APP_DOMAIN) {
              options.domain = `.${process.env.NEXT_PUBLIC_APP_DOMAIN}`;
            }
            if (process.env.NODE_ENV === 'production') options.secure = true;
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            if (process.env.NODE_ENV === 'production') {
              logger.warn('Supabase server client: failed to remove cookie', { name, error });
            }
          }
        },
      },
    },
  );
}
