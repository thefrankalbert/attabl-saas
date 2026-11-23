/**
 * Audit B63 (Haute), bout en bout: vrai proxy + vrai createMiddlewareClient.
 *
 * Le proxy recopiait les cookies de session du middleware par
 * `response.cookies.set(cookie.name, cookie.value)`, a douze endroits, en
 * PERDANT leurs options. En production, l'effacement du cookie de session
 * partait sans `Domain=.attabl.com` ni `Max-Age=0`: le cookie du domaine parent
 * survivait a la deconnexion, et un cookie vide propre a l'hote etait cree. Les
 * renouvellements de session perdaient de meme leur domaine et leur duree.
 *
 * Seul `@supabase/ssr` est remplace: son getUser() demande ce que la vraie
 * bibliotheque demande (effacement, ou renouvellement avec une duree).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mode = vi.hoisted(() => ({ v: 'efface' as 'efface' | 'renouvelle' }));

vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _u: string,
    _k: string,
    opts: {
      cookies: {
        remove: (n: string, o: Record<string, unknown>) => void;
        set: (n: string, v: string, o: Record<string, unknown>) => void;
      };
    },
  ) => ({
    auth: {
      getUser: async () => {
        if (mode.v === 'efface') {
          opts.cookies.remove('sb-abcd-auth-token', { path: '/', sameSite: 'lax', maxAge: 0 });
        } else {
          opts.cookies.set('sb-abcd-auth-token', 'jeton-neuf', {
            path: '/',
            sameSite: 'lax',
            maxAge: 34560000,
          });
        }
        return { data: { user: null }, error: null };
      },
    },
    from: () => ({}),
  }),
}));

vi.mock('@/lib/cache', () => ({
  getCachedTenantByDomain: async () => null,
  getCachedTenant: async () => null,
}));
vi.mock('@/lib/csp', () => ({ buildCspHeader: () => "default-src 'self'" }));

function setCookies(res: Response): string {
  return (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie().join(' | ');
}

async function appel(url: string): Promise<Response> {
  const { proxy } = await import('@/proxy');
  const req = new NextRequest(url, { headers: { host: new URL(url).host } });
  return proxy(req);
}

describe('proxy: les cookies de session gardent leurs options (B63)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcd.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', 'attabl.com');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://attabl.com');
    vi.stubEnv('NODE_ENV', 'production');
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['redirection admin sans session', 'https://radisson.attabl.com/admin'],
    ['route API du sous-domaine', 'https://radisson.attabl.com/api/menu-search'],
    ['console plateforme du domaine principal', 'https://attabl.com/admin/tenants'],
    ['vitrine du sous-domaine', 'https://radisson.attabl.com/'],
  ])('effacement (%s): Domain=.attabl.com et Max-Age=0 arrivent au navigateur', async (_l, url) => {
    mode.v = 'efface';
    const sc = setCookies(await appel(url));
    expect(sc).toMatch(/sb-abcd-auth-token=;/);
    expect(sc).toMatch(/Domain=\.attabl\.com/i);
    expect(sc).toMatch(/Max-Age=0/i);
  });

  it('renouvellement: le jeton neuf garde son domaine et sa duree', async () => {
    mode.v = 'renouvelle';
    const sc = setCookies(await appel('https://radisson.attabl.com/admin'));
    expect(sc).toMatch(/sb-abcd-auth-token=jeton-neuf/);
    expect(sc).toMatch(/Domain=\.attabl\.com/i);
    expect(sc).toMatch(/Max-Age=34560000/i);
  });

  it('temoin: hors production, aucun Domain (la mesure sait voir l absence)', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    mode.v = 'efface';
    const sc = setCookies(await appel('https://radisson.attabl.com/admin'));
    expect(sc).toMatch(/sb-abcd-auth-token=;/);
    expect(sc).not.toMatch(/Domain=/i);
  });
});
