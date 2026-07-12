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
let mockAdminRole = 'owner';
let mockCustomPermissions: Record<string, boolean> | null = null;
let mockIsSuperAdmin = false;

type QueryBuilder = {
  select: () => QueryBuilder;
  eq: () => QueryBuilder;
  is: () => QueryBuilder;
  limit: () => QueryBuilder;
  maybeSingle: () => Promise<{ data: unknown }>;
};

function makeQueryBuilder(table: string): QueryBuilder {
  const qb: QueryBuilder = {
    select: () => qb,
    eq: () => qb,
    is: () => qb,
    limit: () => qb,
    maybeSingle: async () => {
      if (table === 'admin_users') {
        return {
          data: {
            role: mockAdminRole,
            custom_permissions: mockCustomPermissions,
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
  (slug: string) => Promise<{ subscription_status: string; is_active: boolean } | null>
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

function cookieNames(res: NextResponse): string[] {
  return res.cookies.getAll().map((c) => c.name);
}

beforeEach(() => {
  mockUser = null;
  mockAdminRole = 'owner';
  mockCustomPermissions = null;
  mockIsSuperAdmin = false;
  getUserMock.mockClear();
  getCachedTenantByDomainMock.mockClear();
  getCachedTenantMock.mockClear();
  getCachedTenantByDomainMock.mockResolvedValue(null);
  getCachedTenantMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
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

  it('derives x-tenant-slug from the Referer for an API call from a /sites/<slug> page (not from a client header)', async () => {
    const res = await proxy(
      makeRequest('attabl.com', '/api/orders', {
        referer: 'https://attabl.com/sites/radisson/cart',
        'x-tenant-slug': 'attacker-tenant',
      }),
    );
    // /api/orders is a SKIP_AUTH prefix served on the main domain; the proxy must
    // derive the tenant from the trusted Referer, not the client-supplied header.
    expect(injectedTenantSlug(res)).toBe('radisson');
    expect(injectedTenantSlug(res)).not.toBe('attacker-tenant');
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
    mockAdminRole = 'waiter';
    for (const sub of ['users', 'settings', 'subscription', 'audit-logs', 'invoices']) {
      const res = await go(`/sites/radisson/admin/${sub}`);
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get('location') as string).pathname).toBe('/unauthorized');
    }
  });

  it('redirects a waiter away from reports / inventory / pos / marketing editors', async () => {
    authed('w-2');
    mockAdminRole = 'waiter';
    for (const sub of ['reports', 'inventory', 'pos', 'coupons', 'supports']) {
      const res = await go(`/sites/radisson/admin/${sub}`);
      expect(res.status).toBe(307);
    }
  });

  it('lets a waiter reach operational routes (orders, kitchen, menus, dashboard)', async () => {
    authed('w-3');
    mockAdminRole = 'waiter';
    for (const sub of ['orders', 'kitchen', 'menus', '']) {
      const res = await go(`/sites/radisson/admin/${sub}`);
      expect(res.status).not.toBe(307);
    }
  });

  it('lets an owner reach every sensitive route', async () => {
    authed('o-1');
    mockAdminRole = 'owner';
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

  it('applies role-appropriate access: cashier uses POS but not reports; manager reports but not settings', async () => {
    authed('c-1');
    mockAdminRole = 'cashier';
    expect((await go('/sites/radisson/admin/pos')).status).not.toBe(307); // pos.use = true
    expect((await go('/sites/radisson/admin/reports')).status).toBe(307); // reports.view = false

    authed('m-1');
    mockAdminRole = 'manager';
    expect((await go('/sites/radisson/admin/reports')).status).not.toBe(307); // reports.view = true
    expect((await go('/sites/radisson/admin/settings')).status).toBe(307); // settings.view = false

    authed('ch-1');
    mockAdminRole = 'chef';
    expect((await go('/sites/radisson/admin/pos')).status).toBe(307); // pos.use = false
    expect((await go('/sites/radisson/admin/inventory')).status).not.toBe(307); // inventory.view = true
  });

  it('only gates the tenant admin area (super_admin platform area is unaffected)', async () => {
    authed('w-4');
    mockAdminRole = 'waiter';
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
