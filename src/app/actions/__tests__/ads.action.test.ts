import { describe, it, expect, vi, beforeEach } from 'vitest';

const createAd = vi.fn();

vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserForTenant: vi.fn().mockResolvedValue({}),
  AuthError: class AuthError extends Error {
    status = 403;
  },
}));
vi.mock('@/lib/billing/assert-tenant-serving', () => ({
  assertTenantServing: vi.fn().mockResolvedValue(undefined),
  TenantLockedError: class TenantLockedError extends Error {},
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn().mockResolvedValue({}) }));
vi.mock('@/services/ad.service', () => ({ createAdService: () => ({ createAd }) }));
vi.mock('@/services/storage-cleanup.service', () => ({ getStorageCleanup: vi.fn() }));

import { actionCreateAd } from '../ads';

const TENANT = '11111111-1111-4111-8111-111111111111';
const IMAGE = 'https://nqufpobuozrzwpeijkxt.supabase.co/storage/v1/object/public/images/x.jpg';

function payload(link: string | null) {
  return { tenant_id: TENANT, image_url: IMAGE, link, sort_order: 1, is_active: true };
}

describe('actionCreateAd: lien de la banniere', () => {
  beforeEach(() => {
    createAd.mockReset().mockResolvedValue({ id: 'ad-1' });
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://nqufpobuozrzwpeijkxt.supabase.co';
  });

  it('accepte un lien https', async () => {
    const r = await actionCreateAd(TENANT, payload('https://exemple.com/offre'));
    expect(r.error).toBeUndefined();
    expect(createAd).toHaveBeenCalledOnce();
  });

  it('accepte une annonce sans lien', async () => {
    const r = await actionCreateAd(TENANT, payload(null));
    expect(r.error).toBeUndefined();
  });

  it('refuse un lien javascript: (code execute chez les clients)', async () => {
    const r = await actionCreateAd(TENANT, payload('javascript:alert(1)'));
    expect(r.error).toBe('Lien invalide : il doit commencer par https://');
    expect(createAd).not.toHaveBeenCalled();
  });

  it('refuse un lien sans adresse de site', async () => {
    const r = await actionCreateAd(TENANT, payload('exemple'));
    expect(r.error).toMatch(/Lien invalide/);
  });

  it('refuse une image hors de notre stockage, avec un message en francais', async () => {
    const r = await actionCreateAd(TENANT, {
      ...payload(null),
      image_url: 'https://ailleurs.example/x.jpg',
    });
    expect(r.error).toBe("L'image ou l'ordre d'affichage n'est pas valide.");
  });
});
