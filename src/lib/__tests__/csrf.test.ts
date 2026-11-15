import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAllowedAppHost, verifyOrigin } from '../csrf';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isAllowedAppHost', () => {
  it('allows apex and www domains', () => {
    expect(isAllowedAppHost('attabl.com', 'attabl.com')).toBe(true);
    expect(isAllowedAppHost('www.attabl.com', 'attabl.com')).toBe(true);
  });

  it('allows single-level tenant subdomains', () => {
    expect(isAllowedAppHost('radisson.attabl.com', 'attabl.com')).toBe(true);
  });

  it('rejects lookalike domains', () => {
    expect(isAllowedAppHost('attabl.com.evil.tld', 'attabl.com')).toBe(false);
    expect(isAllowedAppHost('evil-attabl.com', 'attabl.com')).toBe(false);
  });
});

describe('verifyOrigin', () => {
  it('rejects forged origin prefix attacks', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = verifyOrigin(
      new Request('https://attabl.com/api/orders', {
        method: 'POST',
        headers: {
          origin: 'https://attabl.com.evil.tld',
        },
      }),
    );

    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
  });

  it('allows exact production origin', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://attabl.com');
    vi.stubEnv('NODE_ENV', 'production');

    const response = verifyOrigin(
      new Request('https://attabl.com/api/orders', {
        method: 'POST',
        headers: {
          origin: 'https://attabl.com',
        },
      }),
    );

    expect(response).toBeNull();
  });

  it('allows localhost dev on any port (not only NEXT_PUBLIC_APP_URL port)', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', 'attabl.com');
    vi.stubEnv('NODE_ENV', 'development');

    const response = verifyOrigin(
      new Request('http://localhost:3005/api/orders/pos', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3005',
        },
      }),
    );

    expect(response).toBeNull();
  });

  it('rejects non-localhost cross-origin in production', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://attabl.com');
    vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', 'attabl.com');
    vi.stubEnv('NODE_ENV', 'production');

    const response = verifyOrigin(
      new Request('https://attabl.com/api/orders/pos', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3005',
        },
      }),
    );

    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
  });
});

/**
 * Audit du 2026-11-14: un restaurant sur son propre nom de domaine voyait
 * toutes ses commandes refusees en 403, le domaine n'etant pas dans la liste.
 */
describe('verifyOrigin - nom de domaine du restaurant', () => {
  afterEach(() => vi.unstubAllEnvs());

  function depuis(origin: string, url = 'https://menu.chez-awa.com/api/orders') {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://attabl.com');
    vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', 'attabl.com');
    return verifyOrigin(new Request(url, { method: 'POST', headers: { origin } }));
  }

  it('accepte une page servie par le domaine qui recoit la commande', () => {
    expect(depuis('https://menu.chez-awa.com')).toBeNull();
  });

  it('refuse un site tiers qui vise ce domaine', () => {
    expect(depuis('https://evil.tld')?.status).toBe(403);
  });

  it('refuse un domaine voisin qui ne fait que ressembler', () => {
    expect(depuis('https://menu.chez-awa.com.evil.tld')?.status).toBe(403);
  });
});
