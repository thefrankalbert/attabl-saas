import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Coupure du restaurant sur les ardoises.
 *
 * Solder une ardoise est un ENCAISSEMENT: c'est de l'argent qui rentre. Ces
 * actions sont des Server Actions appelees par l'interface admin, donc la
 * coupure posee sur `/api/orders/mutations` ne les couvrait pas, et le
 * middleware ne refuse que `frozen`, `is_active = false` et `suspended_at`.
 * Pour `cancelled`, `paused`, `unpaid`, `incomplete` et `pending`, un
 * restaurant coupe pouvait encore solder ses ardoises.
 *
 * Ces tests figent le refus et, surtout, que le service n'est jamais atteint.
 */

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

class MockAuthError extends Error {
  public readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
const mockGetAuthUserForTenant = vi.fn();
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserForTenant: (...args: unknown[]) => mockGetAuthUserForTenant(...args),
  AuthError: MockAuthError,
}));

const mockSettle = vi.fn();
const mockCreate = vi.fn();
const mockAttach = vi.fn();
const mockDetach = vi.fn();
vi.mock('@/services/order-annotation.service', () => ({
  createOrderAnnotationService: vi.fn(() => ({
    settleHouseAccount: mockSettle,
    createHouseAccount: mockCreate,
    attachOrderToHouseAccount: mockAttach,
    detachOrderFromHouseAccount: mockDetach,
  })),
}));

/** Chaine Supabase minimale: `select` / `eq` / `is` / `maybeSingle`. */
function chaineTenant(ligne: Record<string, unknown> | null) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is']) chain[m] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: ligne, error: null });
  return chain;
}

const TENANT_ID = '22222222-2222-4222-a222-222222222222';
const ACCOUNT_ID = '44444444-4444-4444-a444-444444444444';

function brancherTenant(statut: string) {
  const supabase = {
    from: vi.fn(() =>
      chaineTenant({ is_active: true, suspended_at: null, subscription_status: statut }),
    ),
  };
  mockGetAuthUserForTenant.mockResolvedValue({
    supabase,
    user: { id: 'user-9' },
    adminUserId: 'admin-9',
  });
}

describe('ardoises - coupure du restaurant', () => {
  beforeEach(() => vi.clearAllMocks());

  const COUPES = ['frozen', 'cancelled', 'paused', 'unpaid', 'incomplete', 'pending'] as const;

  it.each(COUPES)('refuse de solder une ardoise quand le restaurant est %s', async (statut) => {
    brancherTenant(statut);
    const { actionSettleHouseAccount } = await import('@/app/actions/house-accounts');
    const result = await actionSettleHouseAccount(TENANT_ID, ACCOUNT_ID);

    expect(result.error).toBe('Ce restaurant est temporairement indisponible');
    expect(result.success).toBeUndefined();
    // Le point qui compte: l'encaissement n'a pas eu lieu.
    expect(mockSettle).not.toHaveBeenCalled();
  });

  it('refuse de creer une ardoise quand le restaurant est coupe', async () => {
    brancherTenant('cancelled');
    const { actionCreateHouseAccount } = await import('@/app/actions/house-accounts');
    const result = await actionCreateHouseAccount(TENANT_ID, 'Table 4');

    expect(result.error).toBe('Ce restaurant est temporairement indisponible');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each(['trial', 'past_due', 'active'] as const)(
    'laisse solder une ardoise quand le restaurant est %s',
    async (statut) => {
      brancherTenant(statut);
      mockSettle.mockResolvedValue(undefined);
      const { actionSettleHouseAccount } = await import('@/app/actions/house-accounts');
      const result = await actionSettleHouseAccount(TENANT_ID, ACCOUNT_ID);

      expect(result.success).toBe(true);
      expect(mockSettle).toHaveBeenCalled();
    },
  );
});
