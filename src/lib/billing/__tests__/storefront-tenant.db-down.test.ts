import { describe, it, expect, vi } from 'vitest';

// Audit d'equipe du 2026-11-27 (convive C37): base indisponible = le client
// voyait "Page introuvable". La lecture doit LEVER (page d'erreur du restaurant,
// "Reessayer"), et un slug inconnu rester un `null` (404).

const { mockOrThrow } = vi.hoisted(() => ({ mockOrThrow: vi.fn() }));
vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock('@/lib/cache', () => ({ getCachedTenantOrThrow: mockOrThrow }));
vi.mock('../lapsed-trial', () => ({ storefrontAccessForTenant: vi.fn(async () => 'open') }));

import { getStorefrontTenant } from '../storefront-tenant';

describe('getStorefrontTenant', () => {
  it('leve quand la base ne repond pas (pas de faux 404)', async () => {
    mockOrThrow.mockRejectedValueOnce(new Error('connexion refusee'));
    await expect(getStorefrontTenant('lepicurien')).rejects.toThrow('connexion refusee');
  });

  it('slug inconnu: tenant null, comme avant (temoin)', async () => {
    mockOrThrow.mockResolvedValueOnce(null);
    await expect(getStorefrontTenant('inconnu')).resolves.toEqual({
      tenant: null,
      access: 'closed',
    });
  });
});
