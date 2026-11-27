/**
 * Audit K3.9: les cookies de session `sb-*` portent `Secure` en production,
 * et pas hors production (http://localhost doit continuer a fonctionner).
 * Couvre server.ts et client.ts; middleware.ts est un fichier protege.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { poses, optionsNavigateur } = vi.hoisted(() => ({
  poses: [] as Array<Record<string, unknown>>,
  optionsNavigateur: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => undefined,
    set: (c: Record<string, unknown>) => poses.push(c),
  }),
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _u: string,
    _k: string,
    opts: {
      cookies: {
        set: (n: string, v: string, o: Record<string, unknown>) => void;
        remove: (n: string, o: Record<string, unknown>) => void;
      };
    },
  ) => {
    opts.cookies.set('sb-abcd-auth-token', 'jeton', { path: '/', maxAge: 100 });
    opts.cookies.remove('sb-abcd-auth-token', { path: '/', maxAge: 0 });
    return {};
  },
  createBrowserClient: (
    _u: string,
    _k: string,
    opts: { cookieOptions: Record<string, unknown> },
  ) => {
    optionsNavigateur.push(opts.cookieOptions);
    return {};
  },
}));

describe('cookies Supabase: attribut Secure', () => {
  beforeEach(() => {
    poses.length = 0;
    optionsNavigateur.length = 0;
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcd.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', 'attabl.com');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('production: pose et effacement cote serveur portent Secure', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createClient } = await import('../server');
    await createClient();
    expect(poses).toHaveLength(2);
    for (const c of poses) expect(c.secure).toBe(true);
  });

  it('hors production: pas de Secure cote serveur (temoin)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { createClient } = await import('../server');
    await createClient();
    expect(poses).toHaveLength(2);
    for (const c of poses) expect(c.secure).toBeUndefined();
  });

  it('client navigateur: Secure en production seulement', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    (await import('../client')).createClient();
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();
    (await import('../client')).createClient();
    expect(optionsNavigateur.map((o) => o.secure)).toEqual([true, false]);
  });
});
