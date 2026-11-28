import { describe, it, expect, vi, beforeEach } from 'vitest';

// Coupure du restaurant (A-02): la garde est simulee ici, sa logique est testee
// dans lib/billing/__tests__/assert-tenant-serving.test.ts.
const { mockAssertServing, mockResolve, mockResolveLimit } = vi.hoisted(() => ({
  mockAssertServing: vi.fn(),
  mockResolve: vi.fn(),
  mockResolveLimit: vi.fn(),
}));
vi.mock('@/lib/billing/assert-tenant-serving', async () => {
  const { AuthError } = await import('@/lib/auth/get-session');
  class TenantLockedError extends AuthError {
    constructor(message = 'Ce restaurant est temporairement indisponible') {
      super(message, 403);
    }
  }
  return { assertTenantServing: mockAssertServing, TenantLockedError };
});

/**
 * X14: /qr-codes est ouvert a tout membre, mais l'export "imprimer toutes les
 * tables" appelait une action de LECTURE gardee par settings.edit. Un gerant
 * (settings.edit faux par defaut) ou la salle recevait une erreur et ne pouvait
 * pas imprimer les cartes de table. Ecrire un design reste sous settings.edit.
 *
 * Vraie resolution de permissions (get-session -> hasPermission): seul le
 * client Supabase est simule.
 */

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({
  uploadLimiter: { check: vi.fn(async () => ({ success: true })) },
  assignmentLimiter: { check: vi.fn(async () => ({ success: true })) },
  qrDesignResolveLimiter: { check: mockResolveLimit },
  getClientIpFromHeaders: () => '127.0.0.1',
}));
vi.mock('@/lib/plans/assert-feature', () => ({ isFeatureEntitled: async () => true }));
vi.mock('@/services/audit.service', () => ({ createAuditService: () => ({ log: vi.fn() }) }));

const mockAssignTable = vi.fn();
vi.mock('@/services/qr-design.service', () => ({
  createQrDesignService: () => ({
    resolveDesignsForTables: mockResolve,
    assignDesignToTable: mockAssignTable,
  }),
}));

const member = { poste: 'manager' };
function chain(table: string) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'or']) c[m] = vi.fn(() => c);
  const row =
    table === 'admin_users'
      ? { id: 'admin-1', tenant_id: 'tenant-1', postes: [member.poste], permission_overrides: null }
      : null;
  c.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  c.single = vi.fn(async () => ({ data: row, error: null }));
  return c;
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1', email: 'a@b.c' } } }) },
    from: (table: string) => chain(table),
  })),
}));

const TABLE_ID = '550e8400-e29b-41d4-a716-446655440001';

beforeEach(() => {
  vi.clearAllMocks();
  member.poste = 'manager';
  mockResolve.mockResolvedValue({ [TABLE_ID]: { size: 200 } });
  mockResolveLimit.mockResolvedValue({ success: true });
});

describe('QR: imprimer oui, modifier seulement avec settings.edit', () => {
  it.each(['manager', 'waiter', 'cashier', 'chef'])(
    '%s resout les designs pour imprimer les tables',
    async (poste) => {
      member.poste = poste;
      const { actionResolveDesignsForTables } = await import('@/app/actions/qr-design');
      const res = await actionResolveDesignsForTables([TABLE_ID]);
      expect(res.success).toBe(true);
      expect(mockResolve).toHaveBeenCalledWith('tenant-1', [TABLE_ID]);
    },
  );

  it('un serveur n assigne PAS de design (settings.edit)', async () => {
    member.poste = 'waiter';
    const { actionAssignQrDesign } = await import('@/app/actions/qr-design');
    const res = await actionAssignQrDesign({ target: 'table', targetId: TABLE_ID, designId: null });
    expect(res.success).toBe(false);
    expect(mockAssignTable).not.toHaveBeenCalled();
  });

  // Temoin: le gerant detient `settings.edit` (lot 1 des roles). Sans lui, le
  // refus ci-dessus pourrait venir d'une autre cause que le droit.
  it('un gerant assigne un design (temoin du refus ci-dessus)', async () => {
    const { actionAssignQrDesign } = await import('@/app/actions/qr-design');
    const res = await actionAssignQrDesign({ target: 'table', targetId: TABLE_ID, designId: null });
    expect(res.success).toBe(true);
    expect(mockAssignTable).toHaveBeenCalled();
  });

  // Revue L013 (A9): lecture ouverte a tout membre, donc bornee et limitee.
  it('refuse un tableau trop grand ou des identifiants non UUID, sans rien resoudre', async () => {
    const { actionResolveDesignsForTables } = await import('@/app/actions/qr-design');
    const trop = Array.from({ length: 501 }, () => TABLE_ID);
    expect((await actionResolveDesignsForTables(trop)).success).toBe(false);
    expect((await actionResolveDesignsForTables(['pas-un-uuid'])).success).toBe(false);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('passe par le limiteur de debit et refuse au-dela', async () => {
    mockResolveLimit.mockResolvedValueOnce({ success: false });
    const { actionResolveDesignsForTables } = await import('@/app/actions/qr-design');
    const res = await actionResolveDesignsForTables([TABLE_ID]);
    expect(res).toEqual({ success: false, error: 'rateLimited' });
    expect(mockResolve).not.toHaveBeenCalled();
  });
});
