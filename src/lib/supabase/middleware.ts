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
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

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
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    },
  );

  // Rafraîchir la session
  await supabase.auth.getUser();

  return { response, supabase };
}

// Fonction legacy pour compatibilité
export async function updateSession(request: NextRequest) {
  const { response } = await createMiddlewareClient(request);
  return response;
}
