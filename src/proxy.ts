import { createMiddlewareClient } from '@/lib/supabase/middleware';
import { getCachedTenantByDomain, getCachedTenant } from '@/lib/cache';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildCspHeader } from '@/lib/csp';
import { permissionForAdminSubPath } from '@/lib/auth/admin-route-permissions';
import { isAdminRouteDenied } from '@/lib/auth/admin-route-guard';
import { TENANT_SLUG_HEADER, TENANT_SLUG_HINT_HEADER } from '@/lib/auth/tenant-header';

// Routes qui nécessitent une authentification
// Note: /sites/{slug}/admin is protected, but /sites/{slug}/ (client pages) are public
const PROTECTED_PATHS = ['/admin', '/onboarding', '/dashboard'];

// Routes publiques sur le domaine principal - aucun appel auth nécessaire (~50-100ms économisés)
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

/** Routes under src/app/ only - must not rewrite to /sites/[slug]/ on tenant subdomains */
const APP_ROOT_ONLY_PREFIXES = [
  '/onboarding',
  '/login',
  '/signup',
  '/checkout',
  '/auth',
  '/reset-password',
  '/forgot-password',
  '/unauthorized',
  '/admin/tenants',
  '/admin/platform',
  // SW offline fallback document (app/offline). Without this, a tenant
  // subdomain rewrites /offline to /sites/<slug>/offline -> 404, the service
  // worker's precache install fails, and no SW ever installs on tenant
  // subdomains - exactly where the offline tablets live.
  '/offline',
];

function isAppRootOnlyPath(pathname: string): boolean {
  return APP_ROOT_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

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

/**
 * B-1 - la forme de l'URL n'a rien a dire sur l'etat du tenant.
 *
 * Le verrou d'etat (gel, desactivation, suspension plateforme) ne portait que
 * sur `^/sites/<slug>/admin`, la forme du DOMAINE PRINCIPAL. Or un client
 * arrive par `<slug>.attabl.com/admin/...`, ou par son domaine personnalise:
 * `pathname` vaut alors `/admin/...`, et la reecriture vers `/sites/<slug>`
 * n'a pas encore eu lieu (elle est en fin de fonction pour le sous-domaine, et
 * la branche domaine personnalise RETOURNE avant la garde). Les trois clauses
 * du verrou ne s'evaluaient donc jamais sur le chemin reel de production.
 *
 * La garde RBAC qui suit resolvait DEJA les deux formes: cette fonction est
 * cette resolution, mise en commun, pour que les deux gardes portent sur la
 * meme. `adminBase` retient la forme d'origine, parce qu'une redirection vers
 * `/sites/<slug>/...` ne veut rien dire sur un sous-domaine.
 */
function resolveAdminGate(
  pathname: string,
  slugFromHost: string | null,
): { slug: string; subPath: string; adminBase: string } | null {
  const mainAdmin = pathname.match(/^\/sites\/([^/]+)\/admin(\/.*)?$/);
  if (mainAdmin) {
    return {
      slug: mainAdmin[1],
      subPath: mainAdmin[2] || '',
      adminBase: `/sites/${mainAdmin[1]}/admin`,
    };
  }
  // Les consoles plateforme (/admin/tenants, /admin/platform) vivent sous
  // src/app/ et n'appartiennent a aucun tenant: isAppRootOnlyPath les exclut.
  if (slugFromHost && !isAppRootOnlyPath(pathname) && /^\/admin(\/|$)/.test(pathname)) {
    return {
      slug: slugFromHost,
      subPath: pathname.replace(/^\/admin/, ''),
      adminBase: '/admin',
    };
  }
  return null;
}

/** L'acces d'un tenant est-il coupe ? Une seule definition, trois formes d'URL. */
function isTenantAccessLocked(
  tenant: {
    subscription_status?: string | null;
    is_active?: boolean | null;
    suspended_at?: string | null;
  } | null,
): boolean {
  if (!tenant) return false;
  return (
    tenant.subscription_status === 'frozen' ||
    tenant.is_active === false ||
    // CTR7-1: une suspension plateforme ne reposait que sur is_active, que cinq
    // ecritures du webhook Stripe pouvaient remettre a true. `suspended_at`
    // etait ecrit et affiche, jamais applique: ce verrou le rend reel, comme
    // deleted_at l'est deja (filtre du select de getCachedTenant).
    !!tenant.suspended_at
  );
}

/**
 * L'URL de redirection si l'acces du tenant est coupe, `null` sinon.
 *
 * L'exception doit survivre: la page d'abonnement reste atteignable, sinon un
 * client gele ne peut plus payer pour se degeler.
 */
async function lockedTenantRedirectUrl(
  gate: { slug: string; subPath: string; adminBase: string },
  origin: string,
): Promise<URL | null> {
  if (gate.subPath.startsWith('/subscription')) return null;
  const tenantInfo = await getCachedTenant(gate.slug);
  if (!isTenantAccessLocked(tenantInfo)) return null;
  return new URL(`${gate.adminBase}/subscription`, origin);
}

export async function proxy(request: NextRequest) {
  // SECURITY: Block x-middleware-subrequest header to prevent middleware bypass (CVE-2025-29927)
  if (request.headers.get('x-middleware-subrequest')) {
    return new NextResponse(null, { status: 403 });
  }

  // Generate a per-request CSP nonce (replaces static unsafe-inline in script-src)
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
  request.headers.set('x-csp-nonce', nonce);
  // Next.js only nonces its own inline bootstrap scripts when it can read the CSP
  // from the REQUEST headers (it extracts 'nonce-...' there). Every downstream
  // NextResponse.next/rewrite - including the supabase session response - forwards
  // request.headers, so setting it once here makes the nonced CSP actually work
  // instead of blocking Next's scripts (the previous attempt only set a custom
  // x-csp-nonce header, which Next ignores).
  request.headers.set('Content-Security-Policy', buildCspHeader(nonce));

  // SECURITY: Strip any client-injected x-tenant-slug - only the proxy should set this.
  // Le hint suit la meme regle: sans cela un client poserait lui-meme le hint et
  // reproduirait exactement le trou que HDR-REFERER ferme.
  request.headers.delete(TENANT_SLUG_HEADER);
  request.headers.delete(TENANT_SLUG_HINT_HEADER);

  // 1. Extract subdomain and pathname early for routing decisions
  const hostname = request.headers.get('host') || '';
  const subdomain = extractSubdomain(hostname);
  const pathname = request.nextUrl.pathname;

  // The update banner polls /api/version every 60s and on every tab focus. Every
  // request otherwise runs createMiddlewareClient -> getUser -> a single-use
  // Supabase refresh-token rotation (on subdomains AND custom domains), so that
  // frequent poll churns the auth session and races real navigations on the
  // rotating token, logging users out. A version check needs no auth and no tenant
  // resolution: serve it here, before any host branch, without touching the session.
  if (pathname === '/api/version') {
    const resp = NextResponse.next({ request: { headers: request.headers } });
    resp.headers.set('Content-Security-Policy', buildCspHeader(nonce));
    return resp;
  }

  // 2. Custom domain check: hostname is not *.attabl.com and not localhost
  const hostWithoutPort = hostname.split(':')[0];
  const isMainDomain = hostWithoutPort === 'attabl.com' || hostWithoutPort === 'www.attabl.com';
  const isLocalhost = hostWithoutPort === 'localhost' || hostWithoutPort.endsWith('.localhost');
  const isVercelPreview = hostWithoutPort.endsWith('.vercel.app');

  if (!subdomain && !isMainDomain && !isLocalhost && !isVercelPreview) {
    // Might be a custom domain (e.g., theblutable.com)
    // BUG-32: Negative results (null) are cached for 5 min by unstable_cache (revalidate: 300)
    // in getCachedTenantByDomain, preventing repeated DB lookups for unknown domains.
    const tenantSlug = await getCachedTenantByDomain(hostWithoutPort);
    if (tenantSlug) {
      // Custom domain matched - treat like a subdomain rewrite
      const { response: sessionResponse } = await createMiddlewareClient(request);
      const url = request.nextUrl.clone();

      // Set x-tenant-slug on REQUEST headers so server components can read it.
      // Ici le slug est DEJA prouve: il sort de `getCachedTenantByDomain`, qui
      // ne rend un slug que pour un domaine reellement enregistre. Pas besoin
      // de `poserEnteteTenant`.
      request.headers.set(TENANT_SLUG_HEADER, tenantSlug);

      // B-1: cette branche RETOURNE avant la garde d'etat du tenant plus bas,
      // donc le tableau de bord d'un tenant coupe restait ouvert sur son
      // domaine personnalise. Le verrou est applique ici, sur la meme
      // resolution que les deux autres formes d'URL.
      const customDomainGate = resolveAdminGate(pathname, tenantSlug);
      if (customDomainGate) {
        const lockedUrl = await lockedTenantRedirectUrl(customDomainGate, request.nextUrl.origin);
        if (lockedUrl) {
          const redirectResponse = NextResponse.redirect(lockedUrl);
          sessionResponse.cookies.getAll().forEach((cookie: { name: string; value: string }) => {
            redirectResponse.cookies.set(cookie.name, cookie.value);
          });
          return redirectResponse;
        }
      }

      if (pathname.startsWith('/api/') || isAppRootOnlyPath(pathname)) {
        const response = NextResponse.next({
          request: { headers: request.headers },
        });
        sessionResponse.cookies.getAll().forEach((cookie: { name: string; value: string }) => {
          response.cookies.set(cookie.name, cookie.value);
        });
        // CSP-CUSTOM-DOMAIN. Cette sortie anticipee etait la SEULE des huit a ne
        // pas poser la CSP. Or `isAppRootOnlyPath` couvre /login, /signup,
        // /onboarding, /checkout, /reset-password, /forgot-password et /auth/*:
        // un tenant sur domaine custom servait donc ses pages d'identification
        // et de paiement sans aucune politique de securite du contenu.
        response.headers.set('Content-Security-Policy', buildCspHeader(nonce));
        return response;
      }

      url.pathname = `/sites/${tenantSlug}${pathname}`;
      const response = NextResponse.rewrite(url, {
        request: { headers: request.headers },
      });
      sessionResponse.cookies.getAll().forEach((cookie: { name: string; value: string }) => {
        response.cookies.set(cookie.name, cookie.value);
      });
      response.headers.set('Content-Security-Policy', buildCspHeader(nonce));
      return response;
    }
  }

  // 3. OPTIMISATION : Sur le domaine principal (sans subdomain), les routes publiques
  //    n'ont pas besoin de rafraîchir la session → skip createMiddlewareClient entièrement
  if (!subdomain || subdomain === 'www') {
    if (isPublicMainDomainPath(pathname)) {
      // For API calls originating from /sites/{slug}/ pages (e.g. cart → /api/orders),
      // inject x-tenant-slug from the Referer before returning early.
      if (pathname.startsWith('/api/')) {
        const referer = request.headers.get('referer') || '';
        const refererSitesMatch = referer.match(/\/sites\/([^/]+)/);
        if (refererSitesMatch) {
          // HDR-REFERER: le `Referer` est forgeable, donc il alimente le HINT,
          // jamais l'en-tete de confiance. Voir src/lib/auth/tenant-header.ts.
          request.headers.set(TENANT_SLUG_HINT_HEADER, refererSitesMatch[1]);
        }
      }
      const resp = NextResponse.next({ request: { headers: request.headers } });
      resp.headers.set('Content-Security-Policy', buildCspHeader(nonce));
      return resp;
    }
  }

  // 4. Rafraîchir la session (createMiddlewareClient appelle getUser() en interne)
  const { response: sessionResponse, supabase } = await createMiddlewareClient(request);

  // 5. Vérifier l'authentification pour les routes protégées
  //    On utilise getUser() pour valider cryptographiquement le JWT côté serveur.
  // Check top-level protected paths (/admin, /onboarding, /dashboard)
  // AND /sites/{slug}/admin/* paths (admin dashboard accessed via main domain)
  const isProtectedPath =
    PROTECTED_PATHS.some((path) => pathname.startsWith(path)) ||
    /^\/sites\/[^/]+\/admin(\/|$)/.test(pathname);

  if (isProtectedPath) {
    // Dev bypass: skip auth check in development when explicitly enabled
    // SECURITY: Only allow bypass on localhost/127.0.0.1 to prevent abuse on public networks
    const devBypass =
      process.env.NODE_ENV === 'development' &&
      process.env.ALLOW_DEV_AUTH_BYPASS === 'true' &&
      (hostWithoutPort === 'localhost' ||
        hostWithoutPort === '127.0.0.1' ||
        hostWithoutPort.endsWith('.localhost'));

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && !devBypass) {
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

    // Block users whose email is not yet confirmed (prevents password-reset bypass).
    // Skip for OAuth users (Google/Azure) - their email is verified by the provider.
    // Allow /reset-password and /auth/* paths so the reset flow itself still works.
    if (
      user &&
      !devBypass &&
      !user.email_confirmed_at &&
      user.app_metadata?.provider === 'email' &&
      !pathname.startsWith('/reset-password') &&
      !pathname.startsWith('/auth/') &&
      !pathname.startsWith('/onboarding')
    ) {
      const mainDomain = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
      const loginUrl = new URL('/login', mainDomain);
      loginUrl.searchParams.set('error', 'email_not_confirmed');
      const redirectResponse = NextResponse.redirect(loginUrl);
      sessionResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value);
      });
      return redirectResponse;
    }

    // B2: Block frozen/inactive tenants from admin pages (except subscription page)
    // B-1: les DEUX formes d'URL (domaine principal `/sites/<slug>/admin` et
    // sous-domaine `/admin`) passent par la meme resolution que la garde RBAC
    // ci-dessous. Sur le sous-domaine - le chemin reel de production - cette
    // garde ne s'evaluait pas du tout.
    const hostSlug = subdomain && subdomain !== 'www' ? subdomain : null;
    const adminGate = resolveAdminGate(pathname, hostSlug);
    if (user && adminGate) {
      const lockedUrl = await lockedTenantRedirectUrl(adminGate, request.nextUrl.origin);
      if (lockedUrl) {
        const redirectResponse = NextResponse.redirect(lockedUrl);
        sessionResponse.cookies.getAll().forEach((cookie) => {
          redirectResponse.cookies.set(cookie.name, cookie.value);
        });
        return redirectResponse;
      }
    }

    // B3: RBAC - enforce per-route role permissions with a clean server-side
    // redirect (covers EVERY client: browser, curl, bots - not only JS-enabled).
    // Sensitive admin routes (users, settings, billing, reports, inventory, pos,
    // marketing editors) require a specific permission; operational routes
    // (orders, kitchen, menus, ...) stay open to all members.
    // Meme resolution que la garde B2 ci-dessus (B-1: une seule definition de
    // "quel tenant, quelle sous-route" pour les deux gardes).
    if (user && adminGate) {
      const requiredPermission = permissionForAdminSubPath(adminGate.subPath);
      if (requiredPermission) {
        const gateTenant = await getCachedTenant(adminGate.slug);
        if (
          gateTenant &&
          (await isAdminRouteDenied(supabase, user.id, gateTenant.id, requiredPermission))
        ) {
          const mainDomain = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
          const unauthorizedUrl = new URL('/unauthorized', mainDomain);
          const redirectResponse = NextResponse.redirect(unauthorizedUrl);
          sessionResponse.cookies.getAll().forEach((cookie) => {
            redirectResponse.cookies.set(cookie.name, cookie.value);
          });
          return redirectResponse;
        }
      }
    }
  }

  // 6a. API calls from /sites/{slug}/ pages on main domain (no subdomain)
  //     The Referer header contains /sites/{slug}/ but the API path is just /api/...
  //     Derive the tenant from the Referer so the API can identify the tenant.
  if (pathname.startsWith('/api/') && !subdomain) {
    const referer = request.headers.get('referer') || '';
    const refererMatch = referer.match(/\/sites\/([^/]+)/);
    if (refererMatch) {
      // HDR-REFERER: hint et non en-tete de confiance. Cette branche s'applique
      // a TOUTES les routes /api/ du domaine principal, c'etait donc la plus
      // large surface ou la garantie "le slug vient du serveur" etait fausse.
      request.headers.set(TENANT_SLUG_HINT_HEADER, refererMatch[1]);
      const response = NextResponse.next({
        request: { headers: request.headers },
      });
      sessionResponse.cookies.getAll().forEach((cookie: { name: string; value: string }) => {
        response.cookies.set(cookie.name, cookie.value);
      });
      response.headers.set('Content-Security-Policy', buildCspHeader(nonce));
      return response;
    }
  }

  /**
   * Pose l'en-tete de tenant, et ne le declare DE CONFIANCE que si le restaurant
   * EXISTE vraiment.
   *
   * POURQUOI. Trois endroits posaient `x-tenant-slug` a partir du sous-domaine ou
   * du chemin, SANS rien verifier. Or le domaine accepte un sous-domaine joker:
   * `nimportequoi.attabl.com` recevait donc un en-tete presente comme injecte par
   * le proxy, donc "de confiance", pour un restaurant qui n'existe pas. Tout code
   * qui fonderait une decision sur cet en-tete - un compteur de debit, un cache,
   * une regle d'acces - se serait trompe, et le defaut aurait ete invisible
   * puisque l'en-tete porte justement le nom de ce qui est verifie.
   *
   * Mesure du 2026-11-08: aucun code ne lisait encore le drapeau `trusted`. La
   * faille n'etait donc pas exploitable - c'est exactement le moment de la
   * fermer, avant qu'un appelant ne s'y fie.
   *
   * UN SLUG INCONNU N'EST PAS REFUSE, il est RETROGRADE en indice
   * (`x-tenant-slug-hint`). Refuser creerait une panne la ou il n'y avait qu'une
   * imprecision: toutes les routes relisent le restaurant en base ensuite, et
   * `readTenantSlug` rend la valeur dans les deux cas. On ne perd donc aucun
   * comportement, et `trusted` signifie enfin ce qu'il dit.
   *
   * Cout assume: une lecture de restaurant par slug inconnu. `getCachedTenant`
   * met le resultat en cache, y compris l'absence, et le proxy fait deja cette
   * verification pour les chemins admin.
   */
  async function poserEnteteTenant(request: NextRequest, slug: string): Promise<void> {
    const tenant = await getCachedTenant(slug);
    if (tenant) {
      request.headers.set(TENANT_SLUG_HEADER, slug);
      return;
    }
    request.headers.set(TENANT_SLUG_HINT_HEADER, slug);
  }

  // 6b. Direct /sites/{slug}/... access on main domain - set x-tenant-slug header
  //     Must be set on REQUEST headers (not response) so headers() in server components can read it
  const sitesMatch = pathname.match(/^\/sites\/([^/]+)(\/.*)?$/);
  if (sitesMatch) {
    const tenantSlug = sitesMatch[1];
    await poserEnteteTenant(request, tenantSlug);
    const response = NextResponse.next({
      request: { headers: request.headers },
    });
    // Copy session cookies to the new response
    sessionResponse.cookies.getAll().forEach((cookie: { name: string; value: string }) => {
      response.cookies.set(cookie.name, cookie.value);
    });
    response.headers.set('Content-Security-Policy', buildCspHeader(nonce));
    return response;
  }

  // 7. Si subdomain détecté, réécrire l'URL vers /sites/[site]
  // Le domaine principal (sans subdomain) sert les routes marketing, auth, super admin
  if (subdomain && subdomain !== 'www') {
    // /api/ routes live at src/app/api/ (not under /sites/[site]/api/)
    // Don't rewrite - just set the x-tenant-slug header so the API can identify the tenant
    if (pathname.startsWith('/api/')) {
      await poserEnteteTenant(request, subdomain);
      const response = NextResponse.next({
        request: { headers: request.headers },
      });
      sessionResponse.cookies.getAll().forEach((cookie: { name: string; value: string }) => {
        response.cookies.set(cookie.name, cookie.value);
      });
      return response;
    }

    if (isAppRootOnlyPath(pathname)) {
      const response = NextResponse.next({
        request: { headers: request.headers },
      });
      sessionResponse.cookies.getAll().forEach((cookie: { name: string; value: string }) => {
        response.cookies.set(cookie.name, cookie.value);
      });
      response.headers.set('Content-Security-Policy', buildCspHeader(nonce));
      return response;
    }

    const url = request.nextUrl.clone();

    // Réécrire vers /sites/[subdomain]/[path]
    url.pathname = `/sites/${subdomain}${pathname}`;

    // Set x-tenant-slug on REQUEST headers so server components can read it via headers()
    await poserEnteteTenant(request, subdomain);

    // Créer la réponse de rewrite avec les cookies de session
    const response = NextResponse.rewrite(url, {
      request: { headers: request.headers },
    });

    // Copier les cookies de session vers la nouvelle réponse
    sessionResponse.cookies.getAll().forEach((cookie: { name: string; value: string }) => {
      response.cookies.set(cookie.name, cookie.value);
    });

    response.headers.set('Content-Security-Policy', buildCspHeader(nonce));
    return response;
  }

  // 8. Pas de subdomain → retourner la réponse avec session rafraîchie
  sessionResponse.headers.set('Content-Security-Policy', buildCspHeader(nonce));
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

  // Vercel preview/production URLs - no subdomain extraction
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
     * - sw.js (Serwist service worker at the root scope - must be served
     *   verbatim, never rewritten to a tenant path)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|sw.js|sounds/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wav|mp3|ogg|pdf|xlsx|xls|csv|woff|woff2|ttf|eot)$).*)',
  ],
};
