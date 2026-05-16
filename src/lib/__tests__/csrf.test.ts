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
});
