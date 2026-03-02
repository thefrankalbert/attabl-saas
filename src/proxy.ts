import { createMiddlewareClient } from '@/lib/supabase/middleware';
import { getCachedTenantByDomain } from '@/lib/cache';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes qui nécessitent une authentification
// Note: /sites/{slug}/admin is protected, but /sites/{slug}/ (client pages) are public
const PROTECTED_PATHS = ['/admin', '/onboarding', '/dashboard'];

// Routes publiques sur le domaine principal — aucun appel auth nécessaire (~50-100ms économisés)
// Inclut : marketing, auth, webhooks, monitoring, assets statiques
const SKIP_AUTH_PREFIXES = [
  '/login',
  '/signup',
  '/auth',
  '/api/webhooks',
  '/api/orders',
  '/monitoring',
  '/contact',
  '/_next',
  '/favicon.ico',
  '/checkout',
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

  // 2. Custom domain check: hostname is not *.attabl.com and not localhost
  const hostWithoutPort = hostname.split(':')[0];
  const isMainDomain = hostWithoutPort === 'attabl.com' || hostWithoutPort === 'www.attabl.com';
  const isLocalhost = hostWithoutPort === 'localhost' || hostWithoutPort.endsWith('.localhost');
  const isVercelPreview = hostWithoutPort.endsWith('.vercel.app');

  if (!subdomain && !isMainDomain && !isLocalhost && !isVercelPreview) {
    // Might be a custom domain (e.g., theblutable.com)
    const tenantSlug = await getCachedTenantByDomain(hostWithoutPort);
    if (tenantSlug) {
      // Custom domain matched — treat like a subdomain rewrite
      const { response: sessionResponse } = await createMiddlewareClient(request);
      const url = request.nextUrl.clone();

      // Set x-tenant-slug on REQUEST headers so server components can read it
      request.headers.set('x-tenant-slug', tenantSlug);

      if (pathname.startsWith('/api/')) {
        const response = NextResponse.next({
          request: { headers: request.headers },
        });
        sessionResponse.cookies.getAll().forEach((cookie: { name: string; value: string }) => {
          response.cookies.set(cookie.name, cookie.value);
        });
        return response;
      }

      url.pathname = `/sites/${tenantSlug}${pathname}`;
      const response = NextResponse.rewrite(url, {
        request: { headers: request.headers },
      });
      sessionResponse.cookies.getAll().forEach((cookie: { name: string; value: string }) => {
        response.cookies.set(cookie.name, cookie.value);
      });
      return response;
    }
  }

  // 3. OPTIMISATION : Sur le domaine principal (sans subdomain), les routes publiques
  //    n'ont pas besoin de rafraîchir la session → skip createMiddlewareClient entièrement
  if (!subdomain || subdomain === 'www') {
    if (isPublicMainDomainPath(pathname)) {
      return NextResponse.next();
    }
  }

  // 4. Rafraîchir la session (createMiddlewareClient appelle getUser() en interne)
  const { response: sessionResponse, supabase } = await createMiddlewareClient(request);

  // 5. Vérifier l'authentification pour les routes protégées
  //    createMiddlewareClient a déjà validé/rafraîchi le token via getUser().
  //    On utilise getSession() pour lire le résultat sans re-appeler le serveur auth.
  // Check top-level protected paths (/admin, /onboarding, /dashboard)
  // AND /sites/{slug}/admin/* paths (admin dashboard accessed via main domain)
  const isProtectedPath =
    PROTECTED_PATHS.some((path) => pathname.startsWith(path)) ||
    /^\/sites\/[^/]+\/admin(\/|$)/.test(pathname);

  if (isProtectedPath) {
    // Dev bypass: skip auth check in development when explicitly enabled
    const devBypass =
      process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH_BYPASS === 'true';

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user && !devBypass) {
      // Rediriger vers login avec URL de retour
      // Pour les subdomains, rediriger vers le domaine principal pour éviter les 404
      const mainDomain = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
      const loginUrl = new URL('/login', mainDomain);
      loginUrl.searchParams.set('redirect', pathname);
      const redirectResponse = NextResponse.redirect(loginUrl);
      // Copier les cookies de session rafraîchie vers la redirection
      sessionResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value);
      });
      return redirectResponse;
    }
  }

  // 6. Direct /sites/{slug}/... access on main domain — set x-tenant-slug header
  //    Must be set on REQUEST headers (not response) so headers() in server components can read it
  const sitesMatch = pathname.match(/^\/sites\/([^/]+)(\/.*)?$/);
  if (sitesMatch) {
    const tenantSlug = sitesMatch[1];
    request.headers.set('x-tenant-slug', tenantSlug);
    const response = NextResponse.next({
      request: { headers: request.headers },
    });
    // Copy session cookies to the new response
    sessionResponse.cookies.getAll().forEach((cookie: { name: string; value: string }) => {
      response.cookies.set(cookie.name, cookie.value);
    });
    return response;
  }

  // 7. Si subdomain détecté, réécrire l'URL vers /sites/[site]
  // Le domaine principal (sans subdomain) sert les routes marketing, auth, super admin
  if (subdomain && subdomain !== 'www') {
    // /api/ routes live at src/app/api/ (not under /sites/[site]/api/)
    // Don't rewrite — just set the x-tenant-slug header so the API can identify the tenant
    if (pathname.startsWith('/api/')) {
      request.headers.set('x-tenant-slug', subdomain);
      const response = NextResponse.next({
        request: { headers: request.headers },
      });
      sessionResponse.cookies.getAll().forEach((cookie: { name: string; value: string }) => {
        response.cookies.set(cookie.name, cookie.value);
      });
      return response;
    }

    const url = request.nextUrl.clone();

    // Réécrire vers /sites/[subdomain]/[path]
    url.pathname = `/sites/${subdomain}${pathname}`;

    // Set x-tenant-slug on REQUEST headers so server components can read it via headers()
    request.headers.set('x-tenant-slug', subdomain);

    // Créer la réponse de rewrite avec les cookies de session
    const response = NextResponse.rewrite(url, {
      request: { headers: request.headers },
    });

    // Copier les cookies de session vers la nouvelle réponse
    sessionResponse.cookies.getAll().forEach((cookie: { name: string; value: string }) => {
      response.cookies.set(cookie.name, cookie.value);
    });

    return response;
  }

  // 8. Pas de subdomain → retourner la réponse avec session rafraîchie
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

  // Vercel preview/production URLs — no subdomain extraction
  // e.g., attabl-saas-xxx.vercel.app → treated as main domain
  if (hostWithoutPort.endsWith('.vercel.app')) {
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
