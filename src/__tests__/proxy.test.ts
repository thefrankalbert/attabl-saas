/**
 * Behavioral tests for src/proxy.ts - the central multi-tenant middleware.
 *
 * proxy.ts is a PROTECTED file. These tests assert its observable behavior so
 * that a regression (e.g. removing the anti-spoofing header strip, breaking
 * subdomain extraction, dropping the auth guard) makes a test FAIL.
 *
 * Mechanics used to inspect a Next.js middleware NextResponse:
 *  - NextResponse.rewrite(url) sets header `x-middleware-rewrite` to the target URL.
 *  - NextResponse.next() sets header `x-middleware-next: 1` (pass-through).
 *  - NextResponse.redirect(url) returns status 307 with a `location` header.
 *  - Request-header overrides passed via `NextResponse.next({ request: { headers } })`
 *    are surfaced on the response as `x-middleware-request-<name>` and listed in
 *    `x-middleware-override-headers`. This is how we observe the server-derived
 *    x-tenant-slug that proxy.ts injects on the REQUEST.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// --- Mock the proxy's external dependencies -------------------------------

// Session cookies the mocked middleware client "refreshes". We assert these are
// copied onto rewrite/redirect responses.
const sessionCookies: Array<{ name: string; value: string }> = [
  { name: 'sb-access-token', value: 'access-123' },
  { name: 'sb-refresh-token', value: 'refresh-456' },
];

// Controls what supabase.auth.getUser() returns inside the proxy.
let mockUser: {
  id: string;
  email_confirmed_at: string | null;
  app_metadata: { provider: string };
} | null = null;

const getUserMock = vi.fn(async () => ({ data: { user: mockUser } }));

// Controls what the RBAC route guard sees for the current admin_users row.
let mockPostes: string[] = ['owner'];
// Reglage par personne (permission_overrides) de la ligne de membre simulee.
let mockOverrides: Record<string, boolean> | null = null;
let mockIsSuperAdmin = false;
// false = l'utilisateur n'a AUCUNE ligne admin_users (ni membre, ni super-admin).
let mockIsMember = true;

type QueryBuilder = {
  select: () => QueryBuilder;
  eq: () => QueryBuilder;
  is: () => QueryBuilder;
  limit: () => QueryBuilder;
  or: () => QueryBuilder;
  // Reglages du restaurant par poste (poste_permissions): aucun, la matrice decide.
  in: () => Promise<{ data: unknown[]; error: null }>;
  maybeSingle: () => Promise<{ data: unknown }>;
};

function makeQueryBuilder(table: string): QueryBuilder {
  const qb: QueryBuilder = {
    select: () => qb,
    eq: () => qb,
    is: () => qb,
    limit: () => qb,
    or: () => qb,
    in: async () => ({ data: [], error: null }),
    maybeSingle: async () => {
      if (table === 'admin_users') {
        if (!mockIsMember) return { data: null };
        return {
          data: {
            postes: mockPostes,
            permission_overrides: mockOverrides,
            is_super_admin: mockIsSuperAdmin,
          },
        };
      }
      return { data: null };
    },
  };
  return qb;
}

vi.mock('@/lib/supabase/middleware', () => ({
  createMiddlewareClient: vi.fn(async () => {
    const response = NextResponse.next();
    sessionCookies.forEach((c) => response.cookies.set(c.name, c.value));
    return {
      response,
      supabase: {
        auth: { getUser: getUserMock },
        from: (table: string) => makeQueryBuilder(table),
      },
    };
  }),
}));

// Tenant lookups. By default no custom domain and no frozen tenant.
const getCachedTenantByDomainMock = vi.fn<(domain: string) => Promise<string | null>>(
  async () => null,
);
const getCachedTenantMock = vi.fn<
  (slug: string) => Promise<{
    subscription_status: string;
    is_active: boolean;
    // LOT 9 / CTR7-1: la suspension plateforme est desormais un verrou applique,
    // plus seulement une colonne affichee dans la console.
    suspended_at?: string | null;
  } | null>
>(async () => null);

vi.mock('@/lib/cache', () => ({
  getCachedTenantByDomain: (domain: string) => getCachedTenantByDomainMock(domain),
  getCachedTenant: (slug: string) => getCachedTenantMock(slug),
}));

vi.mock('@/lib/csp', () => ({
  buildCspHeader: (nonce: string) => `script-src 'nonce-${nonce}'`,
}));

import { proxy } from '../proxy';

// --- Helpers ---------------------------------------------------------------

/** Build a NextRequest for a given host + path, with optional extra headers. */
function makeRequest(
  host: string,
  path: string,
  extraHeaders: Record<string, string> = {},
): NextRequest {
  // Use https for a real domain; the proxy only reads the `host` header for routing.
  const origin =
    host.startsWith('localhost') || host.includes('.localhost')
      ? `http://${host}`
      : `https://${host}`;
  const headers = new Headers({ host, ...extraHeaders });
  return new NextRequest(`${origin}${path}`, { headers });
}

/** The path the proxy rewrote to (internal Next.js header), or null if no rewrite. */
function rewriteTarget(res: NextResponse): string | null {
  const raw = res.headers.get('x-middleware-rewrite');
  if (!raw) return null;
  return new URL(raw).pathname;
}

/** Whether the response is a plain pass-through (NextResponse.next). */
function isPassThrough(res: NextResponse): boolean {
  return res.headers.get('x-middleware-next') === '1';
}

/**
 * The x-tenant-slug value the proxy injected on the REQUEST headers (server-derived),
 * as surfaced on the response via the middleware override mechanism.
 */
function injectedTenantSlug(res: NextResponse): string | null {
  return res.headers.get('x-middleware-request-x-tenant-slug');
}

/**
 * Le slug DEDUIT DU REFERER (HDR-REFERER). Volontairement separe du precedent:
 * une route ne doit jamais autoriser sur cette valeur sans requete
 * d'appartenance, le `Referer` etant forgeable hors navigateur.
 */
function injectedTenantSlugHint(res: NextResponse): string | null {
  return res.headers.get('x-middleware-request-x-tenant-slug-hint');
}

function cookieNames(res: NextResponse): string[] {
  return res.cookies.getAll().map((c) => c.name);
}

beforeEach(() => {
  mockUser = null;
  mockPostes = ['owner'];
  mockOverrides = null;
  mockIsSuperAdmin = false;
  mockIsMember = true;
  getUserMock.mockClear();
  getCachedTenantByDomainMock.mockClear();
  getCachedTenantMock.mockClear();
  getCachedTenantByDomainMock.mockResolvedValue(null);
  // Par defaut le restaurant EXISTE et va bien. C'etait `null` auparavant,
  // c'est-a-dire "ce restaurant n'existe pas": depuis que le proxy verifie
  // l'existence avant de declarer l'en-tete de confiance, ce defaut faisait
  // echouer les cas normaux. Les tests qui ont besoin d'un autre etat le
  // posent explicitement.
  getCachedTenantMock.mockResolvedValue({ subscription_status: 'active', is_active: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ===========================================================================
// 0. Restaurant inexistant: un vrai 404, pas une page 200 "introuvable"
// ===========================================================================
describe('proxy - restaurant inexistant', () => {
  it('reecrit une page d un sous-domaine inconnu vers le chemin sans route (404)', async () => {
    getCachedTenantMock.mockResolvedValue(null);
    for (const path of ['/', '/menu', '/cart', '/admin']) {
      mockUser = {
        id: 'u-1',
        email_confirmed_at: '2026-01-01T00:00:00Z',
        app_metadata: { provider: 'email' },
      };
      const res = await proxy(makeRequest('restaurant-invente.attabl.com', path));
      expect(rewriteTarget(res), path).toBe('/restaurant-introuvable');
      expect(res.headers.get('Content-Security-Policy'), path).toBeTruthy();
    }
  });

  it('fait de meme pour /sites/<slug> inconnu sur le domaine principal', async () => {
    getCachedTenantMock.mockResolvedValue(null);
    const res = await proxy(makeRequest('attabl.com', '/sites/restaurant-invente/menu?x=1'));
    expect(rewriteTarget(res)).toBe('/restaurant-introuvable');
    expect(isPassThrough(res)).toBe(false);
  });

  it('ne touche pas aux routes /api/ ni aux chemins de la racine (login)', async () => {
    getCachedTenantMock.mockResolvedValue(null);
    for (const path of ['/api/menu-search', '/login']) {
      const res = await proxy(makeRequest('restaurant-invente.attabl.com', path));
      expect(rewriteTarget(res), path).toBeNull();
      expect(isPassThrough(res), path).toBe(true);
    }
  });

  it('temoin: un restaurant qui existe est servi normalement', async () => {
    const res = await proxy(makeRequest('radisson.attabl.com', '/menu'));
    expect(rewriteTarget(res)).toBe('/sites/radisson/menu');
    const main = await proxy(makeRequest('attabl.com', '/sites/radisson/menu'));
    expect(isPassThrough(main)).toBe(true);
  });
});

// ===========================================================================
// 1. Subdomain extraction
// ===========================================================================
describe('proxy - subdomain extraction', () => {
  it('resolves a tenant subdomain (radisson.attabl.com) and rewrites under /sites/radisson', async () => {
    const res = await proxy(makeRequest('radisson.attabl.com', '/menu'));
    expect(rewriteTarget(res)).toBe('/sites/radisson/menu');
    expect(injectedTenantSlug(res)).toBe('radisson');
  });

  it('does NOT rewrite on the apex domain (attabl.com)', async () => {
    const res = await proxy(makeRequest('attabl.com', '/'));
    expect(rewriteTarget(res)).toBeNull();
  });

  it('treats www as the main domain (no tenant rewrite)', async () => {
    const res = await proxy(makeRequest('www.attabl.com', '/'));
    expect(rewriteTarget(res)).toBeNull();
  });

  it('resolves a dev subdomain (radisson.localhost) and rewrites', async () => {
    const res = await proxy(makeRequest('radisson.localhost:3000', '/menu'));
    expect(rewriteTarget(res)).toBe('/sites/radisson/menu');
    expect(injectedTenantSlug(res)).toBe('radisson');
  });

  it('treats bare localhost as the main domain (no tenant rewrite)', async () => {
    const res = await proxy(makeRequest('localhost:3000', '/'));
    expect(rewriteTarget(res)).toBeNull();
  });

  it('treats *.vercel.app preview URLs as the main domain (no tenant rewrite)', async () => {
    const res = await proxy(makeRequest('attabl-saas-abc123.vercel.app', '/'));
    expect(rewriteTarget(res)).toBeNull();
    // Should NOT trigger a custom-domain lookup for a known vercel preview host.
    expect(getCachedTenantByDomainMock).not.toHaveBeenCalled();
  });

  it('falls through to a custom-domain lookup for an unknown host', async () => {
    getCachedTenantByDomainMock.mockResolvedValue('theblutable');
    const res = await proxy(makeRequest('theblutable.com', '/menu'));
    expect(getCachedTenantByDomainMock).toHaveBeenCalledWith('theblutable.com');
    expect(rewriteTarget(res)).toBe('/sites/theblutable/menu');
    expect(injectedTenantSlug(res)).toBe('theblutable');
  });

  it('un domaine personnalise a trois parties passe par la recherche de domaine, pas par son premier label', async () => {
    getCachedTenantByDomainMock.mockResolvedValue('monresto');
    const res = await proxy(makeRequest('menu.monresto.com', '/carte'));
    expect(getCachedTenantByDomainMock).toHaveBeenCalledWith('menu.monresto.com');
    expect(rewriteTarget(res)).toBe('/sites/monresto/carte');
    expect(injectedTenantSlug(res)).toBe('monresto');
  });

  it('B19: sur un domaine personnalise, le manifest et start_url ne sont pas prefixes deux fois', async () => {
    getCachedTenantByDomainMock.mockResolvedValue('theblutable');
    const manifest = await proxy(
      makeRequest('theblutable.com', '/sites/theblutable/manifest.webmanifest'),
    );
    expect(rewriteTarget(manifest)).toBe('/sites/theblutable/manifest.webmanifest');
    const start = await proxy(makeRequest('theblutable.com', '/sites/theblutable/welcome'));
    expect(rewriteTarget(start)).toBe('/sites/theblutable/welcome');
    // Le chemin d'un AUTRE restaurant reste confine sous celui du domaine.
    const other = await proxy(makeRequest('theblutable.com', '/sites/autre/welcome'));
    expect(rewriteTarget(other)).toBe('/sites/theblutable/sites/autre/welcome');
  });

  it('un domaine a trois parties non enregistre ne sert le restaurant de personne', async () => {
    const res = await proxy(makeRequest('menu.inconnu.com', '/carte'));
    expect(rewriteTarget(res)).toBeNull();
    expect(injectedTenantSlug(res)).toBeNull();
  });

  it('does not rewrite when the custom-domain lookup misses', async () => {
    getCachedTenantByDomainMock.mockResolvedValue(null);
    const res = await proxy(makeRequest('unknown-domain.com', '/'));
    expect(rewriteTarget(res)).toBeNull();
  });
});

// ===========================================================================
// 2. URL rewrite targets
// ===========================================================================
describe('proxy - URL rewrite', () => {
  it('rewrites a nested tenant path preserving the subpath', async () => {
    const res = await proxy(makeRequest('radisson.attabl.com', '/cart/checkout'));
    expect(rewriteTarget(res)).toBe('/sites/radisson/cart/checkout');
  });

  it('rewrites the tenant root path to /sites/<slug>', async () => {
    const res = await proxy(makeRequest('radisson.attabl.com', '/'));
    // The root path "/" is normalized away when appended, yielding /sites/<slug>.
    expect(rewriteTarget(res)).toBe('/sites/radisson');
  });

  it('does NOT rewrite app-root-only paths (e.g. /login) on a tenant subdomain', async () => {
    // /login is app-root-only AND not a protected path, so it passes through
    // unchanged (served from src/app/, not /sites/[slug]/) rather than being rewritten.
    const res = await proxy(makeRequest('radisson.attabl.com', '/login'));
    expect(rewriteTarget(res)).toBeNull();
    expect(isPassThrough(res)).toBe(true);
  });

  it('does NOT rewrite /api/ paths on a tenant subdomain, only injects the slug header', async () => {
    const res = await proxy(makeRequest('radisson.attabl.com', '/api/orders'));
    expect(rewriteTarget(res)).toBeNull();
    expect(injectedTenantSlug(res)).toBe('radisson');
  });

  it('copies refreshed session cookies onto the rewrite response', async () => {
    const res = await proxy(makeRequest('radisson.attabl.com', '/menu'));
    expect(cookieNames(res)).toEqual(
      expect.arrayContaining(['sb-access-token', 'sb-refresh-token']),
    );
  });
});

// ===========================================================================
// 3. Header anti-spoofing (SECURITY-CRITICAL)
// ===========================================================================
describe('proxy - x-tenant-slug anti-spoofing', () => {
  it('strips a client-supplied x-tenant-slug and replaces it with the server-derived value (subdomain)', async () => {
    const res = await proxy(
      makeRequest('radisson.attabl.com', '/menu', { 'x-tenant-slug': 'attacker-tenant' }),
    );
    // The injected slug must come from the subdomain, NEVER from the client header.
    expect(injectedTenantSlug(res)).toBe('radisson');
    expect(injectedTenantSlug(res)).not.toBe('attacker-tenant');
  });

  /**
   * UN EN-TETE "DE CONFIANCE" DOIT PROUVER CE QU IL AFFIRME.
   *
   * Le proxy posait `x-tenant-slug` a partir du sous-domaine SANS verifier que
   * ce restaurant existe. Or le domaine accepte un sous-domaine joker:
   * `nimportequoi.attabl.com` recevait donc un en-tete presente comme injecte
   * par le serveur, pour un restaurant inexistant. Tout code qui fonderait une
   * decision dessus - un compteur de debit, un cache, une regle d acces - se
   * serait trompe, et le defaut aurait ete invisible puisque l en-tete porte
   * justement le nom de ce qui est verifie.
   *
   * Mesure du 2026-11-08: aucun code ne lisait encore le drapeau. La faille
   * n etait donc pas exploitable, et c etait le moment de la fermer.
   */
  it('un sous-domaine inconnu N OBTIENT PAS l en-tete de confiance, seulement l indice', async () => {
    getCachedTenantMock.mockResolvedValue(null);

    const res = await proxy(makeRequest('restaurant-invente.attabl.com', '/menu'));

    expect(injectedTenantSlug(res)).toBeNull();
    expect(injectedTenantSlugHint(res)).toBe('restaurant-invente');
  });

  it('un chemin /sites/<slug> inconnu non plus', async () => {
    getCachedTenantMock.mockResolvedValue(null);

    const res = await proxy(makeRequest('attabl.com', '/sites/restaurant-invente/menu'));

    expect(injectedTenantSlug(res)).toBeNull();
    expect(injectedTenantSlugHint(res)).toBe('restaurant-invente');
  });

  it('une route /api/ sur un sous-domaine inconnu non plus', async () => {
    getCachedTenantMock.mockResolvedValue(null);

    const res = await proxy(makeRequest('restaurant-invente.attabl.com', '/api/menu-search'));

    expect(injectedTenantSlug(res)).toBeNull();
    expect(injectedTenantSlugHint(res)).toBe('restaurant-invente');
  });

  it('un restaurant qui EXISTE obtient bien l en-tete de confiance', async () => {
    const res = await proxy(makeRequest('radisson.attabl.com', '/api/menu-search'));

    expect(injectedTenantSlug(res)).toBe('radisson');
    expect(injectedTenantSlugHint(res)).toBeNull();
  });

  it('strips a client-supplied x-tenant-slug on a /sites/<slug> path served from main domain', async () => {
    const res = await proxy(
      makeRequest('attabl.com', '/sites/radisson/menu', { 'x-tenant-slug': 'attacker-tenant' }),
    );
    expect(injectedTenantSlug(res)).toBe('radisson');
    expect(injectedTenantSlug(res)).not.toBe('attacker-tenant');
  });

  it('does not leak a client-supplied x-tenant-slug on a public main-domain page', async () => {
    // Marketing/home page: proxy returns early, but must NOT echo the client value.
    const res = await proxy(makeRequest('attabl.com', '/', { 'x-tenant-slug': 'attacker-tenant' }));
    expect(injectedTenantSlug(res)).not.toBe('attacker-tenant');
  });

  it('met le slug deduit du Referer dans le HINT, jamais dans l en-tete de confiance', async () => {
    const res = await proxy(
      makeRequest('attabl.com', '/api/orders', {
        referer: 'https://attabl.com/sites/radisson/cart',
        'x-tenant-slug': 'attacker-tenant',
      }),
    );
    // HDR-REFERER. Le `Referer` est entierement forgeable hors navigateur, et
    // verifyOrigin n'exige que l'appartenance a *.attabl.com - trivialement
    // satisfait par `Referer: https://attabl.com/sites/<cible>/menu`. Le slug
    // qui en vient alimente donc le hint, et l'en-tete de confiance reste VIDE.
    //
    // Ce n'etait pas exploitable (chaque route authentifiee revalide
    // l'appartenance), le danger etait structurel: une route ajoutee demain qui
    // ferait confiance a `x-tenant-slug` sans requete `admin_users` serait
    // immediatement exploitable en cross-tenant.
    expect(injectedTenantSlugHint(res)).toBe('radisson');
    expect(injectedTenantSlug(res)).toBeNull();
  });

  it('efface un hint envoye par le client', async () => {
    const res = await proxy(
      makeRequest('attabl.com', '/api/orders', {
        'x-tenant-slug-hint': 'attacker-tenant',
      }),
    );
    // Sans Referer legitime, rien ne doit subsister: le client ne pose ni l'un
    // ni l'autre des deux en-tetes.
    expect(injectedTenantSlugHint(res)).toBeNull();
    expect(injectedTenantSlug(res)).toBeNull();
  });
});

// ===========================================================================
// 4. Auth guard
// ===========================================================================
describe('proxy - auth guard', () => {
  it('redirects an unauthenticated request to a protected path (/admin) to /login with a redirect param', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://attabl.com');
    mockUser = null;
    const res = await proxy(makeRequest('attabl.com', '/admin'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    const url = new URL(location as string);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('redirect')).toBe('/admin');
  });

  it('redirects an unauthenticated request to a /sites/<slug>/admin path to /login', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://attabl.com');
    mockUser = null;
    const res = await proxy(makeRequest('attabl.com', '/sites/radisson/admin/menu'));
    expect(res.status).toBe(307);
    const url = new URL(res.headers.get('location') as string);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('redirect')).toBe('/sites/radisson/admin/menu');
  });

  it('copies refreshed session cookies onto the login redirect', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://attabl.com');
    mockUser = null;
    const res = await proxy(makeRequest('attabl.com', '/admin'));
    expect(cookieNames(res)).toEqual(
      expect.arrayContaining(['sb-access-token', 'sb-refresh-token']),
    );
  });

  it('lets an authenticated user reach a protected path (no redirect)', async () => {
    mockUser = {
      id: 'user-1',
      email_confirmed_at: '2026-01-01T00:00:00Z',
      app_metadata: { provider: 'email' },
    };
    const res = await proxy(makeRequest('attabl.com', '/sites/radisson/admin'));
    expect(res.status).not.toBe(307);
    expect(injectedTenantSlug(res)).toBe('radisson');
  });

  it('lets a public main-domain page through without calling auth', async () => {
    const res = await proxy(makeRequest('attabl.com', '/pricing'));
    expect(res.status).not.toBe(307);
    // Public main-domain optimization: no session refresh / getUser call.
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('does not run the auth guard for non-protected tenant pages', async () => {
    const res = await proxy(makeRequest('radisson.attabl.com', '/menu'));
    expect(res.status).not.toBe(307);
    expect(rewriteTarget(res)).toBe('/sites/radisson/menu');
  });

  it('redirects an authenticated email user whose email is not confirmed away from a protected page', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://attabl.com');
    mockUser = {
      id: 'user-2',
      email_confirmed_at: null,
      app_metadata: { provider: 'email' },
    };
    const res = await proxy(makeRequest('attabl.com', '/sites/radisson/admin'));
    expect(res.status).toBe(307);
    const url = new URL(res.headers.get('location') as string);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('error')).toBe('email_not_confirmed');
  });

  it('does not block an OAuth (provider !== email) user with unconfirmed email', async () => {
    mockUser = {
      id: 'user-3',
      email_confirmed_at: null,
      app_metadata: { provider: 'google' },
    };
    const res = await proxy(makeRequest('attabl.com', '/sites/radisson/admin'));
    // OAuth provider verifies email; no email_not_confirmed redirect.
    expect(res.status).not.toBe(307);
  });
});

// ===========================================================================
// 5. Frozen / inactive tenant guard
// ===========================================================================
describe('proxy - frozen tenant guard', () => {
  it('redirects a frozen tenant admin to the subscription page', async () => {
    mockUser = {
      id: 'user-4',
      email_confirmed_at: '2026-01-01T00:00:00Z',
      app_metadata: { provider: 'email' },
    };
    getCachedTenantMock.mockResolvedValue({ subscription_status: 'frozen', is_active: true });
    const res = await proxy(makeRequest('attabl.com', '/sites/radisson/admin/menu'));
    expect(res.status).toBe(307);
    const url = new URL(res.headers.get('location') as string);
    expect(url.pathname).toBe('/sites/radisson/admin/subscription');
  });

  it('does NOT redirect a frozen tenant away from the subscription page itself', async () => {
    mockUser = {
      id: 'user-5',
      email_confirmed_at: '2026-01-01T00:00:00Z',
      app_metadata: { provider: 'email' },
    };
    getCachedTenantMock.mockResolvedValue({ subscription_status: 'frozen', is_active: true });
    const res = await proxy(makeRequest('attabl.com', '/sites/radisson/admin/subscription'));
    expect(res.status).not.toBe(307);
  });

  // CTR7-1: une suspension decidee par le super-admin ne s'exprimait en base
  // que par `is_active = false`. `suspended_at` etait ecrit par
  // platform-admin.service et affiche dans la console plateforme, mais applique
  // NULLE PART - alors que cinq ecritures du webhook Stripe recalculent
  // `is_active` sur le seul statut d'abonnement, et que
  // `isSubscriptionUsable('past_due')` vaut `true`. La ligne ci-dessous
  // (`past_due` + `is_active = true` + `suspended_at` pose) est exactement
  // celle que cette fuite produisait, et celle qui peut DEJA exister en base:
  // le tableau de bord doit la refuser quand meme.
  it('redirects a platform-suspended tenant even when is_active is true', async () => {
    mockUser = {
      id: 'user-6b',
      email_confirmed_at: '2026-01-01T00:00:00Z',
      app_metadata: { provider: 'email' },
    };
    getCachedTenantMock.mockResolvedValue({
      subscription_status: 'past_due',
      is_active: true,
      suspended_at: '2026-11-01T10:00:00.000Z',
    });
    const res = await proxy(makeRequest('attabl.com', '/sites/radisson/admin/menu'));
    expect(res.status).toBe(307);
    const url = new URL(res.headers.get('location') as string);
    expect(url.pathname).toBe('/sites/radisson/admin/subscription');
  });

  // B-1 (contre-audit FINAL-LOTS-8-9): les huit tests de cette garde passaient
  // TOUS par `attabl.com/sites/<slug>/admin`, une forme d'URL qu'aucun
  // navigateur de client ne produit. En production le tenant arrive par
  // `<slug>.attabl.com/admin/...` (ou par son domaine personnalise), ou
  // `pathname` vaut `/admin/...`: la regex `^/sites/([^/]+)/admin` ne matchait
  // donc pas, et les trois clauses du verrou (`frozen`, `is_active = false`,
  // `suspended_at`) ne s'evaluaient JAMAIS sur le chemin reel. Un tableau de
  // bord de tenant coupe restait ouvert.
  //
  // Un test par forme d'URL, et chacun eprouve les DEUX etats de coupure.
  const lockedStates: Array<
    [string, { subscription_status: string; is_active: boolean; suspended_at?: string | null }]
  > = [
    ['gele', { subscription_status: 'frozen', is_active: true }],
    [
      'suspendu par la plateforme',
      {
        subscription_status: 'past_due',
        is_active: true,
        suspended_at: '2026-11-01T10:00:00.000Z',
      },
    ],
  ];

  const authedUser = (id: string) => {
    mockUser = {
      id,
      email_confirmed_at: '2026-01-01T00:00:00Z',
      app_metadata: { provider: 'email' },
    };
  };

  it('redirects a locked tenant on its SUBDOMAIN (chemin de production)', async () => {
    for (const [label, tenant] of lockedStates) {
      authedUser(`sub-${label}`);
      getCachedTenantMock.mockResolvedValue(tenant);
      const res = await proxy(makeRequest('radisson.attabl.com', '/admin/menu'));
      expect(res.status, label).toBe(307);
      const url = new URL(res.headers.get('location') as string);
      // La redirection reste sur la forme d'URL d'origine: `/sites/...` n'existe
      // pas cote client sur un sous-domaine.
      expect(url.pathname, label).toBe('/admin/subscription');
      expect(url.host, label).toBe('radisson.attabl.com');
    }
  });

  it('redirects a locked tenant on its CUSTOM DOMAIN', async () => {
    for (const [label, tenant] of lockedStates) {
      authedUser(`cd-${label}`);
      getCachedTenantByDomainMock.mockResolvedValue('radisson');
      getCachedTenantMock.mockResolvedValue(tenant);
      const res = await proxy(makeRequest('carte.leresto.bf', '/admin/orders'));
      expect(res.status, label).toBe(307);
      const url = new URL(res.headers.get('location') as string);
      expect(url.pathname, label).toBe('/admin/subscription');
      expect(url.host, label).toBe('carte.leresto.bf');
    }
  });

  it('redirects a locked tenant on the MAIN DOMAIN (/sites/<slug>/admin)', async () => {
    for (const [label, tenant] of lockedStates) {
      authedUser(`main-${label}`);
      getCachedTenantMock.mockResolvedValue(tenant);
      const res = await proxy(makeRequest('attabl.com', '/sites/radisson/admin/menu'));
      expect(res.status, label).toBe(307);
      const url = new URL(res.headers.get('location') as string);
      expect(url.pathname, label).toBe('/sites/radisson/admin/subscription');
    }
  });

  // L'exception qui doit survivre au correctif: un client gele qui ne peut plus
  // atteindre sa page d'abonnement ne peut plus payer pour se degeler.
  it('keeps the subscription page reachable on every URL form', async () => {
    authedUser('sub-page');
    getCachedTenantMock.mockResolvedValue({ subscription_status: 'frozen', is_active: false });

    expect(
      (await proxy(makeRequest('radisson.attabl.com', '/admin/subscription'))).status,
    ).not.toBe(307);
    expect(
      (await proxy(makeRequest('radisson.attabl.com', '/admin/subscription/invoices'))).status,
    ).not.toBe(307);

    getCachedTenantByDomainMock.mockResolvedValue('radisson');
    expect((await proxy(makeRequest('carte.leresto.bf', '/admin/subscription'))).status).not.toBe(
      307,
    );
  });

  it('lets an active tenant admin through on the subdomain too', async () => {
    authedUser('active-sub');
    getCachedTenantMock.mockResolvedValue({ subscription_status: 'active', is_active: true });
    const res = await proxy(makeRequest('radisson.attabl.com', '/admin/menu'));
    expect(res.status).not.toBe(307);
    expect(rewriteTarget(res)).toBe('/sites/radisson/admin/menu');
  });

  it('lets an active tenant admin through', async () => {
    mockUser = {
      id: 'user-6',
      email_confirmed_at: '2026-01-01T00:00:00Z',
      app_metadata: { provider: 'email' },
    };
    getCachedTenantMock.mockResolvedValue({ subscription_status: 'active', is_active: true });
    const res = await proxy(makeRequest('attabl.com', '/sites/radisson/admin'));
    expect(res.status).not.toBe(307);
  });
});

// ===========================================================================
// 5b. RBAC per-route role gate (clean server-side redirect for ALL clients)
// ===========================================================================
describe('proxy - RBAC route gate', () => {
  const authed = (id: string) => {
    mockUser = {
      id,
      email_confirmed_at: '2026-01-01T00:00:00Z',
      app_metadata: { provider: 'email' },
    };
    getCachedTenantMock.mockResolvedValue({ subscription_status: 'active', is_active: true });
  };
  const go = (path: string) => proxy(makeRequest('attabl.com', path));

  it('redirects a waiter away from owner-only routes (users, settings, subscription)', async () => {
    authed('w-1');
    mockPostes = ['waiter'];
    for (const sub of ['users', 'settings', 'subscription', 'audit-logs', 'invoices']) {
      const res = await go(`/sites/radisson/admin/${sub}`);
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get('location') as string).pathname).toBe('/unauthorized');
    }
  });

  // Depuis le 2026-11-09 le serveur prend les commandes a la caisse (pos.use):
  // /pos lui est ouvert. Les ardoises (argent, orders.pay) restent fermees.
  it('redirects a waiter away from reports / inventory / house accounts / marketing editors', async () => {
    authed('w-2');
    mockPostes = ['waiter'];
    for (const sub of ['reports', 'inventory', 'orders/house-accounts', 'coupons', 'supports']) {
      const res = await go(`/sites/radisson/admin/${sub}`);
      expect(res.status).toBe(307);
    }
  });

  it('lets a waiter reach operational routes (orders, kitchen, menus, pos, dashboard)', async () => {
    authed('w-3');
    mockPostes = ['waiter'];
    for (const sub of ['orders', 'kitchen', 'menus', 'pos', '']) {
      const res = await go(`/sites/radisson/admin/${sub}`);
      expect(res.status).not.toBe(307);
    }
  });

  it('lets an owner reach every sensitive route', async () => {
    authed('o-1');
    mockPostes = ['owner'];
    for (const sub of [
      'users',
      'settings',
      'subscription',
      'reports',
      'pos',
      'settings/permissions',
    ]) {
      const res = await go(`/sites/radisson/admin/${sub}`);
      expect(res.status).not.toBe(307);
    }
  });

  it('applies poste-appropriate access: cashier uses POS but not reports; manager reports; chef inventory but not POS', async () => {
    authed('c-1');
    mockPostes = ['cashier'];
    expect((await go('/sites/radisson/admin/pos')).status).not.toBe(307); // orders.take
    expect((await go('/sites/radisson/admin/reports')).status).toBe(307); // reports.money absent

    authed('m-1');
    mockPostes = ['manager'];
    expect((await go('/sites/radisson/admin/reports')).status).not.toBe(307); // reports.money
    // Le gerant gagne settings.edit (changement voulu du lot 1).
    expect((await go('/sites/radisson/admin/settings')).status).not.toBe(307);

    authed('ch-1');
    mockPostes = ['chef'];
    expect((await go('/sites/radisson/admin/pos')).status).toBe(307); // pas de orders.take
    expect((await go('/sites/radisson/admin/inventory')).status).not.toBe(307); // inventory.view
  });

  it('abonnement et factures: le gerant les voit (niveau borne), le chef non, un reglage retire la vue', async () => {
    authed('m-2');
    mockPostes = ['manager'];
    expect((await go('/sites/radisson/admin/subscription')).status).not.toBe(307);
    expect((await go('/sites/radisson/admin/invoices')).status).not.toBe(307);

    // TEMOIN NEGATIF: meme requete, un reglage par personne retire billing.manage.
    mockOverrides = { 'billing.manage': false };
    expect((await go('/sites/radisson/admin/subscription')).status).toBe(307);
    expect((await go('/sites/radisson/admin/invoices')).status).toBe(307);

    authed('ch-2');
    mockPostes = ['chef'];
    mockOverrides = null;
    expect((await go('/sites/radisson/admin/invoices')).status).toBe(307);
  });

  it('les postes se cumulent: caissier + chef ouvre la caisse ET le stock', async () => {
    authed('cc-1');
    mockPostes = ['cashier', 'chef'];
    expect((await go('/sites/radisson/admin/pos')).status).not.toBe(307);
    expect((await go('/sites/radisson/admin/inventory')).status).not.toBe(307);
    expect((await go('/sites/radisson/admin/reports')).status).toBe(307);
  });

  it('refuse en 307 un compte SANS appartenance sur les routes ouvertes a tout membre', async () => {
    authed('etranger-1');
    mockIsMember = false;
    for (const sub of [
      '',
      '/items',
      '/categories',
      '/menus',
      '/qr-codes',
      '/kitchen',
      '/service',
    ]) {
      const res = await go(`/sites/radisson/admin${sub}`);
      expect(res.status, sub).toBe(307);
      expect(new URL(res.headers.get('location')!).pathname, sub).toBe('/unauthorized');
    }
    const sousDomaine = await proxy(makeRequest('radisson.attabl.com', '/admin/items'));
    expect(sousDomaine.status).toBe(307);
    expect(new URL(sousDomaine.headers.get('location')!).pathname).toBe('/unauthorized');
  });

  it('temoin: un membre sans droit particulier (serveur) garde ces routes ouvertes', async () => {
    authed('w-1');
    mockPostes = ['waiter'];
    for (const sub of ['', '/items', '/kitchen', '/service', '/support']) {
      const res = await go(`/sites/radisson/admin${sub}`);
      expect(res.status, sub).not.toBe(307);
    }
  });

  it('only gates the tenant admin area (super_admin platform area is unaffected)', async () => {
    authed('w-4');
    mockPostes = ['waiter'];
    // operational route stays reachable; gate only fires on sensitive sub-routes
    expect((await go('/sites/radisson/admin/service')).status).not.toBe(307);
  });
});

// ===========================================================================
// 6. Edge cases & security headers
// ===========================================================================
describe('proxy - edge cases', () => {
  it('blocks the x-middleware-subrequest header with a 403 (CVE-2025-29927)', async () => {
    const res = await proxy(
      makeRequest('attabl.com', '/admin', { 'x-middleware-subrequest': 'middleware' }),
    );
    expect(res.status).toBe(403);
  });

  it('treats a missing host header as the main domain (no rewrite, no crash)', async () => {
    // Construct a request without a host header by deleting it.
    const req = new NextRequest('https://attabl.com/', { headers: new Headers() });
    req.headers.delete('host');
    const res = await proxy(req);
    expect(rewriteTarget(res)).toBeNull();
  });

  it('sets a Content-Security-Policy header on the main-domain pass-through response', async () => {
    const res = await proxy(makeRequest('attabl.com', '/pricing'));
    expect(res.headers.get('Content-Security-Policy')).toContain("script-src 'nonce-");
  });

  it('injects x-tenant-slug for a direct /sites/<slug> access on the main domain', async () => {
    const res = await proxy(makeRequest('attabl.com', '/sites/radisson/menu'));
    expect(injectedTenantSlug(res)).toBe('radisson');
    // Direct /sites access is a pass-through (already correctly routed), not a rewrite.
    expect(rewriteTarget(res)).toBeNull();
  });
});

// Pins the fix for the "logged out when applying an update" bug: /api/version is
// polled every 60s + on focus by the update banner. If the middleware refreshed
// the Supabase session (getUser -> single-use refresh-token rotation) on that
// poll, the churn logged users out on reload. The version check must never touch
// the session, on ANY host type.
describe('proxy - /api/version never refreshes the session', () => {
  it('serves /api/version without calling getUser on the main domain', async () => {
    const res = await proxy(makeRequest('attabl.com', '/api/version'));
    expect(getUserMock).not.toHaveBeenCalled();
    expect(isPassThrough(res)).toBe(true);
    expect(res.headers.get('Content-Security-Policy')).toContain("'nonce-");
  });

  it('serves /api/version without calling getUser on a tenant subdomain', async () => {
    const res = await proxy(makeRequest('radisson.attabl.com', '/api/version'));
    expect(getUserMock).not.toHaveBeenCalled();
    expect(isPassThrough(res)).toBe(true);
  });

  it('serves /api/version without calling getUser on a custom domain', async () => {
    getCachedTenantByDomainMock.mockResolvedValue('radisson');
    const res = await proxy(makeRequest('menu.restaurant.com', '/api/version'));
    expect(getUserMock).not.toHaveBeenCalled();
    // Short-circuits before tenant resolution too.
    expect(getCachedTenantByDomainMock).not.toHaveBeenCalled();
    expect(isPassThrough(res)).toBe(true);
  });
});
