import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { redirectToMfa } = vi.hoisted(() => ({
  redirectToMfa: vi.fn((next: string): never => {
    throw new Error(`REDIRECT:${next}`);
  }),
}));
vi.mock('@/lib/auth/redirect-to-main', () => ({ redirectToMfa }));

import { enforceMfa, hasStrongSession } from '../mfa-guard';

type Client = Parameters<typeof enforceMfa>[0];

function client(aal: 'aal1' | 'aal2' | null) {
  const getClaims = vi.fn(async () =>
    aal ? { data: { claims: { aal } }, error: null } : { data: null, error: { message: 'x' } },
  );
  return { client: { auth: { getClaims } } as unknown as Client, getClaims };
}

const WITH_FACTOR = { factors: [{ status: 'verified' }] } as never;
const NO_FACTOR = { factors: [] };

describe('enforceMfa', () => {
  beforeEach(() => vi.clearAllMocks());

  it('super admin sans facteur: envoye vers l activation (/auth/mfa)', async () => {
    const { client: c } = client('aal1');
    await expect(
      enforceMfa(c, NO_FACTOR, { next: '/admin/platform', requireEnrollment: true }),
    ).rejects.toThrow('REDIRECT:/admin/platform');
  });

  it('facteur + session aal1: envoye vers le code, destination gardee', async () => {
    const { client: c } = client('aal1');
    await expect(
      enforceMfa(c, WITH_FACTOR, { next: '/sites/resto/admin', requireEnrollment: false }),
    ).rejects.toThrow('REDIRECT:/sites/resto/admin');
  });

  it('facteur + jeton illisible: refuse (ferme par defaut)', async () => {
    const { client: c } = client(null);
    await expect(
      enforceMfa(c, WITH_FACTOR, { next: '/admin/tenants', requireEnrollment: false }),
    ).rejects.toThrow('REDIRECT:/admin/tenants');
  });

  it('facteur + aal2: passe', async () => {
    const { client: c } = client('aal2');
    await expect(
      enforceMfa(c, WITH_FACTOR, { next: '/admin/platform', requireEnrollment: true }),
    ).resolves.toBeUndefined();
    expect(redirectToMfa).not.toHaveBeenCalled();
  });

  it('restaurateur sans facteur: passe, sans appel de plus au serveur Auth', async () => {
    const { client: c, getClaims } = client('aal1');
    await expect(
      enforceMfa(c, NO_FACTOR, { next: '/sites/resto/admin', requireEnrollment: false }),
    ).resolves.toBeUndefined();
    expect(getClaims).not.toHaveBeenCalled();
  });
});

describe('hasStrongSession', () => {
  it('exige facteur ET aal2', async () => {
    expect(await hasStrongSession(client('aal2').client, WITH_FACTOR)).toBe(true);
    expect(await hasStrongSession(client('aal1').client, WITH_FACTOR)).toBe(false);
    expect(await hasStrongSession(client('aal2').client, NO_FACTOR)).toBe(false);
  });
});
