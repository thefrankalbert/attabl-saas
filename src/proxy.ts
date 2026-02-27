import { createMiddlewareClient } from '@/lib/supabase/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes qui nécessitent une authentification
const PROTECTED_PATHS = ['/admin', '/onboarding', '/dashboard', '/sites'];

// Routes publiques sur le domaine principal — aucun appel auth nécessaire (~50-100ms économisés)
// Inclut : marketing, auth, webhooks, monitoring, assets statiques
const SKIP_AUTH_PREFIXES = [
  '/login',
  '/signup',
  '/auth',
  '/api/webhooks',
  '/monitoring',
  '/contact',
  '/_next',
  '/favicon.ico',
];

// Routes marketing exactes (path = "/" ou commence par un segment marketing connu)
const SKIP_AUTH_MARKETING_PREFIXES = [
  '/pricing',
  '/features',
  '/restaurants',
  '/hotels',
  '/bars-cafes',
  '/boulangeries',
  '/dark-kitchens',
  '/food-trucks',
  '/nouveautes',
  '/quick-service',
];

/**
 * Vérifie si un chemin sur le domaine principal peut être servi sans aucun appel auth.
 * Cela couvre les pages marketing, les pages auth (login/signup), les webhooks et le monitoring.
 */
function isPublicMainDomainPath(pathname: string): boolean {
  // Page d'accueil marketing
  if (pathname === '/') return true;

  // Préfixes connus qui ne nécessitent jamais d'auth
  if (SKIP_AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;

  // Pages marketing (pricing, features, verticals, etc.)
  if (SKIP_AUTH_MARKETING_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;

  return false;
}

export async function proxy(request: NextRequest) {
  // 1. Extract subdomain and pathname early for routing decisions
  const hostname = request.headers.get('host') || '';
  const subdomain = extractSubdomain(hostname);
  const pathname = request.nextUrl.pathname;

  // 2. OPTIMISATION : Sur le domaine principal (sans subdomain), les routes publiques
  //    n'ont pas besoin de rafraîchir la session → skip createMiddlewareClient entièrement
  if (!subdomain || subdomain === 'www') {
    if (isPublicMainDomainPath(pathname)) {
      return NextResponse.next();
    }
  }

  // 3. Rafraîchir la session (createMiddlewareClient appelle getUser() en interne)
  const { response: sessionResponse, supabase } = await createMiddlewareClient(request);

  // 4. Vérifier l'authentification pour les routes protégées
  //    createMiddlewareClient a déjà validé/rafraîchi le token via getUser().
  //    On utilise getSession() pour lire le résultat sans re-appeler le serveur auth.
  const isProtectedPath = PROTECTED_PATHS.some((path) => pathname.startsWith(path));

  if (isProtectedPath) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
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

  // 5. Direct /sites/{slug}/... access on main domain — set x-tenant-slug header
  const sitesMatch = pathname.match(/^\/sites\/([^/]+)(\/.*)?$/);
  if (sitesMatch) {
    const tenantSlug = sitesMatch[1];
    sessionResponse.headers.set('x-tenant-slug', tenantSlug);
    return sessionResponse;
  }

  // 6. Si subdomain détecté, réécrire l'URL vers /sites/[site]
  // Le domaine principal (sans subdomain) sert les routes marketing, auth, super admin
  if (subdomain && subdomain !== 'www') {
    // /api/ routes live at src/app/api/ (not under /sites/[site]/api/)
    // Don't rewrite — just set the x-tenant-slug header so the API can identify the tenant
    if (pathname.startsWith('/api/')) {
      sessionResponse.headers.set('x-tenant-slug', subdomain);
      return sessionResponse;
    }

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

  // 7. Pas de subdomain → retourner la réponse avec session rafraîchie
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
    '/((?!_next/static|_next/image|favicon.ico|sounds/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wav|mp3|ogg|pdf|xlsx|xls|csv|woff|woff2|ttf|eot)$).*)',
  ],
};
