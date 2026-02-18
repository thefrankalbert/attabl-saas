import { createMiddlewareClient } from '@/lib/supabase/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes qui nécessitent une authentification
const PROTECTED_PATHS = ['/admin', '/onboarding', '/dashboard', '/sites'];

export async function proxy(request: NextRequest) {
  // 1. Extract subdomain
  const hostname = request.headers.get('host') || '';
  const subdomain = extractSubdomain(hostname);

  // 2. Toujours rafraîchir la session en premier (pour éviter expiration des tokens)
  const { response: sessionResponse, supabase } = await createMiddlewareClient(request);

  // 3. Vérifier l'authentification pour les routes protégées
  const pathname = request.nextUrl.pathname;
  const isProtectedPath = PROTECTED_PATHS.some((path) => pathname.startsWith(path));

  if (isProtectedPath) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Rediriger vers login avec URL de retour
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      const redirectResponse = NextResponse.redirect(loginUrl);
      // Copier les cookies de session rafraîchie vers la redirection
      sessionResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value);
      });
      return redirectResponse;
    }
  }

  // 4. Direct /sites/{slug}/... access on main domain — set x-tenant-slug header
  const sitesMatch = pathname.match(/^\/sites\/([^/]+)(\/.*)?$/);
  if (sitesMatch) {
    const tenantSlug = sitesMatch[1];
    sessionResponse.headers.set('x-tenant-slug', tenantSlug);
    return sessionResponse;
  }

  // 5. Si subdomain détecté, réécrire l'URL vers /sites/[site]
  // Sur un sous-domaine, TOUJOURS réécrire (y compris /admin, /api, etc.)
  // Le domaine principal (sans subdomain) sert les routes marketing, auth, super admin
  if (subdomain && subdomain !== 'www') {
    const url = request.nextUrl.clone();

    // Réécrire vers /sites/[subdomain]/[path]
    url.pathname = `/sites/${subdomain}${pathname}`;

    // Créer la réponse de rewrite avec les cookies de session
    const response = NextResponse.rewrite(url, {
      headers: sessionResponse.headers,
    });

    // Copier les cookies de session vers la nouvelle réponse
    sessionResponse.cookies.getAll().forEach((cookie: { name: string; value: string }) => {
      response.cookies.set(cookie.name, cookie.value);
    });

    // Ajouter le header tenant
    response.headers.set('x-tenant-slug', subdomain);

    return response;
  }

  // 6. Pas de subdomain → retourner la réponse avec session rafraîchie
  return sessionResponse;
}

function extractSubdomain(hostname: string): string | null {
  // Supporte :
  // - radisson.attabl.com → "radisson"
  // - radisson.localhost:3000 → "radisson" (dev local avec subdomain)
  // - localhost:3000 → null (dev local sans subdomain)
  // - attabl.com → null (domaine principal)

  // Retirer le port si présent
  const hostWithoutPort = hostname.split(':')[0];

  // Dev local avec subdomain: radisson.localhost → "radisson"
  if (hostWithoutPort.endsWith('.localhost')) {
    const subdomain = hostWithoutPort.replace('.localhost', '');
    return subdomain || null;
  }

  // Dev local sans subdomain: localhost → null
  if (hostWithoutPort === 'localhost') {
    return null;
  }

  // Extraire sous-domaine pour les vrais domaines
  const parts = hostWithoutPort.split('.');

  // Si attabl.com (2 parties) → pas de sous-domaine
  if (parts.length === 2) {
    return null;
  }

  // Si radisson.attabl.com (3 parties) → "radisson"
  if (parts.length >= 3) {
    return parts[0];
  }

  return null;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
