import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';

// Type pour le retour de createMiddlewareClient
interface MiddlewareClientResult {
  response: NextResponse;
  supabase: SupabaseClient;
}

export async function createMiddlewareClient(
  request: NextRequest,
): Promise<MiddlewareClientResult> {
  // Accumuler tous les cookies modifiés pour les appliquer à la response finale
  const cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_APP_DOMAIN) {
            options.domain = `.${process.env.NEXT_PUBLIC_APP_DOMAIN}`;
            options.sameSite = 'lax';
          }
          // Mettre à jour le cookie sur la request (pour les lectures suivantes)
          request.cookies.set({ name, value, ...options });
          // Accumuler pour la response finale
          cookiesToSet.push({ name, value, options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          cookiesToSet.push({ name, value: '', options });
        },
      },
    },
  );

  // Rafraîchir la session
  await supabase.auth.getUser();

  // Créer la response UNE SEULE FOIS avec les headers de la request
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Appliquer TOUS les cookies accumulés sur la response finale
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set({ name, value, ...options });
  });

  return { response, supabase };
}

// Fonction legacy pour compatibilité
export async function updateSession(request: NextRequest) {
  const { response } = await createMiddlewareClient(request);
  return response;
}
