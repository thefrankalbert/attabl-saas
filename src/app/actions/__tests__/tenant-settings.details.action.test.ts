/**
 * Parametres > details propres au type (etoiles, terrasse, wifi...).
 * Verrouille: absents = intouches; invalides = refuses (pas ignores en silence);
 * filtres par type au moment d'enregistrer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Coupure du restaurant (A-02): la garde est simulee ici, sa logique est testee
// dans lib/billing/__tests__/assert-tenant-serving.test.ts.
const { mockAssertServing } = vi.hoisted(() => ({ mockAssertServing: vi.fn() }));
vi.mock('@/lib/billing/assert-tenant-serving', async () => {
  const { AuthError } = await import('@/lib/auth/get-session');
  class TenantLockedError extends AuthError {
    constructor(message = 'Ce restaurant est temporairement indisponible') {
      super(message, 403);
    }
  }
  return { assertTenantServing: mockAssertServing, TenantLockedError };
});

const updateSettings = vi.fn();

vi.mock('@/services/storage-cleanup.service', () => ({
  getStorageCleanup: () => ({
    imageUrlsOf: async () => [],
    logoUrlOf: async () => [],
    release: async () => undefined,
    releaseUnreferencedFiles: async () => undefined,
    purgeTenant: async () => undefined,
  }),
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (k: string) => k }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/services/audit.service', () => ({ createAuditService: () => ({ log: vi.fn() }) }));
vi.mock('@/services/tenant.service', () => ({ createTenantService: () => ({ updateSettings }) }));
vi.mock('@/lib/auth/get-session', () => ({
  AuthError: class AuthError extends Error {},
  getAuthenticatedUserWithTenant: async () => ({
    tenantId: 't1',
    role: 'owner',
    user: { id: 'u1', email: 'o@x.test' },
    supabase: {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: { slug: 'resto' } }) }) }),
      }),
    },
  }),
}));

import { actionUpdateTenantSettings } from '../tenant-settings';

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  updateSettings.mockResolvedValue(undefined);
});

describe('actionUpdateTenantSettings - establishmentDetails', () => {
  it('enregistre les details du type choisi, et seulement eux', async () => {
    const r = await actionUpdateTenantSettings(
      form({
        establishmentType: 'hotel',
        establishmentDetails: JSON.stringify({ starRating: 5, hasTerrace: true }),
      }),
    );
    expect(r).toEqual({ success: true });
    expect(updateSettings).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ establishmentDetails: { starRating: 5 } }),
    );
  });

  it('ne touche PAS aux details quand le champ est absent (sauvegarde partielle)', async () => {
    await actionUpdateTenantSettings(form({ customDomain: 'menu.resto.test' }));
    const settings = updateSettings.mock.calls[0][1] as Record<string, unknown>;
    expect(settings.establishmentDetails).toBeUndefined();
  });

  it('refuse un JSON illisible au lieu de l ignorer', async () => {
    const r = await actionUpdateTenantSettings(
      form({ establishmentType: 'hotel', establishmentDetails: '{pas du json' }),
    );
    expect(r.success).toBe(false);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('refuse des details hors bornes', async () => {
    const r = await actionUpdateTenantSettings(
      form({ establishmentType: 'hotel', establishmentDetails: JSON.stringify({ starRating: 9 }) }),
    );
    expect(r.success).toBe(false);
    expect(updateSettings).not.toHaveBeenCalled();
  });
});
